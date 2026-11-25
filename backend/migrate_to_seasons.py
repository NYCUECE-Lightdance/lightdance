"""
把分年之前的光表複製到各年的資料庫。

分年之前所有光表都在 `test` 資料庫的 `color` / `raw_json` 裡。這支腳本依版本
編號（`update_time`）推出每一份屬於哪一年的演出（規則在 seasons.py），複製到
`lightdance_<年份>`。

⚠️ **只複製，不刪除。** 原本 `test` 裡的光表原封不動留著，確認新版沒問題之後
要不要清掉由人決定。

⚠️ **可以重跑。** 目標資料庫裡已經有同一個 `(user, update_time)` 的就跳過，
所以部署前先跑一次、部署後再跑一次補上中間新存的版本，不會產生重複。

用法（在後端容器裡跑，`MONGO_CONNECT_URI` 已經設好）：

    python migrate_to_seasons.py            # 預覽：只印出會怎麼分，不寫入
    python migrate_to_seasons.py --apply    # 真的複製

正式環境：

    docker compose -f docker-compose.prod.yml exec backend python migrate_to_seasons.py
"""

import argparse
import os
import sys
from collections import Counter
from datetime import datetime

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from seasons import ACCOUNTS_DB, database_name, season_of, season_of_stamp
from storage import SHOW_COLLECTIONS, ensure_indexes


def season_of_document(doc):
    """這份光表屬於哪一年。版本編號認不出來時退而用 created_at，再不行就是 None。"""
    season = season_of_stamp(doc.get("update_time", ""))
    if season is None and isinstance(doc.get("created_at"), datetime):
        season = season_of(doc["created_at"])
    return season


def migrate(client, source_db=ACCOUNTS_DB, apply=False, log=print):
    """
    @returns {(集合, 年份): Counter}，Counter 的鍵是 copied / existing / duplicate
             （預覽模式下 copied 是「會複製」的數量）；以及認不出年份的文件清單
    """
    results = {}
    unknown = []

    for name in SHOW_COLLECTIONS:
        source = client[source_db][name]
        # 這一輪已經處理過的版本。來源裡同一個 (user, update_time) 出現第二次時
        # 要回報成重複，而不是混進「上一輪已經複製過」裡
        seen = set()
        for doc in source.find({}):
            season = season_of_document(doc)
            if season is None:
                unknown.append((name, doc.get("_id"), doc.get("user"), doc.get("update_time")))
                continue

            stats = results.setdefault((name, season), Counter())
            target = client[database_name(season)][name]
            key = {"user": doc.get("user"), "update_time": doc.get("update_time")}

            if (season, key["user"], key["update_time"]) in seen:
                # 來源本身就有重複（唯一索引之前留下的），第一份已經處理過了。
                # 只回報，不猜要留哪一份
                stats["duplicate"] += 1
                log(f"  ⚠️ {name} 重複的版本沒有複製：{key}（_id={doc.get('_id')}）")
                continue
            seen.add((season, key["user"], key["update_time"]))

            if target.find_one(key, {"_id": 1}) is not None:
                stats["existing"] += 1
                continue
            if not apply:
                stats["copied"] += 1
                continue
            try:
                target.insert_one(doc)
                stats["copied"] += 1
            except DuplicateKeyError:
                # 查的時候還沒有、寫的時候有了：有別人（例如正在跑的後端）同時寫入
                stats["duplicate"] += 1
                log(f"  ⚠️ {name} 重複的版本沒有複製：{key}（_id={doc.get('_id')}）")

    return results, unknown


def prepare_indexes(client, seasons, log=print):
    """先建好唯一索引再寫入，複製途中產生的重複才會被擋下來。"""
    for season in sorted(seasons):
        ensure_indexes(client[database_name(season)], names=SHOW_COLLECTIONS, log=log)


def planned_seasons(client, source_db=ACCOUNTS_DB):
    seasons = set()
    for name in SHOW_COLLECTIONS:
        for doc in client[source_db][name].find({}, {"update_time": 1, "created_at": 1}):
            season = season_of_document(doc)
            if season is not None:
                seasons.add(season)
    return seasons


def print_report(client, results, unknown, source_db, apply):
    verb = "已複製" if apply else "會複製"
    print()
    print("（已存在＝之前就複製過；重複略過＝來源裡同一個版本出現兩次，只複製第一份）")
    print(f"{'集合':<10}{'年份':>6}{verb:>8}{'已存在':>8}{'重複略過':>8}{'目標總數':>10}")
    for (name, season), stats in sorted(results.items(), key=lambda item: (item[0][1], item[0][0])):
        total = client[database_name(season)][name].count_documents({})
        print(
            f"{name:<10}{season:>6}{stats['copied']:>10}{stats['existing']:>10}"
            f"{stats['duplicate']:>10}{total:>12}"
        )
    for name in SHOW_COLLECTIONS:
        print(f"來源 {source_db}.{name}：{client[source_db][name].count_documents({})} 份")

    if unknown:
        print(f"\n⚠️ {len(unknown)} 份認不出年份，沒有複製：")
        for name, doc_id, user, update_time in unknown[:20]:
            print(f"  {name} _id={doc_id} user={user} update_time={update_time!r}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="把分年之前的光表複製到各年的資料庫（不刪除原本的）")
    parser.add_argument("--apply", action="store_true", help="真的寫入；沒加就只預覽")
    parser.add_argument("--source-db", default=ACCOUNTS_DB, help=f"來源資料庫（預設 {ACCOUNTS_DB}）")
    args = parser.parse_args(argv)

    uri = os.getenv("MONGO_CONNECT_URI")
    if not uri:
        print("找不到 MONGO_CONNECT_URI", file=sys.stderr)
        return 1
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")

    print("模式：" + ("寫入" if args.apply else "預覽（加 --apply 才會寫入）"))
    if args.apply:
        prepare_indexes(client, planned_seasons(client, args.source_db))

    results, unknown = migrate(client, args.source_db, apply=args.apply)
    print_report(client, results, unknown, args.source_db, args.apply)
    return 0


if __name__ == "__main__":
    sys.exit(main())
