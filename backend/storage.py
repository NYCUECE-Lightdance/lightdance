"""
MongoDB 的儲存規則 —— **文件形狀、索引、保留策略的唯一定義處**。

主程式 `main.py` 只負責「收到請求之後做什麼」，「一份光表存進去長什麼樣、
用什麼查得到」全部在這裡。先前這些散在四個端點裡各寫一遍，於是
`music_filename` 的預設值在兩個地方是 `0`（整數）、在另外兩個地方是字串。

## 這個資料庫原本的樣子

- **完全沒有索引**。`find_one({"user": u}, sort=[("update_time", -1)])` 是
  「掃過這個使用者的每一份光表、全部載進記憶體、排序、取第一筆」。一份光表
  的 `players` 實測 43KB（真實 production 的密集光表），一個使用者存了幾十
  版之後，每次開 Dashboard 都要搬幾 MB。
- **時間戳只到秒**，而且沒有唯一約束。連按兩下 Output 會產生兩份
  `(user, update_time)` 完全相同的文件，之後 `find_one` 回哪一份是隨機的
  ——「載入某個版本」會變成擲骰子。
- **舊資料永遠不刪**：`upload_items` 裡那段「超過 5 份就刪最舊的」被註解掉了，
  但**查詢還留著**（每次上傳都掃一次全部）。等於付了成本卻沒有得到效果。
- **讀取沒有投影**：分塊端點 `player={p}/chunk={c}` 每次都把整份 `players`
  撈出來再切 10 筆出去。分 100 次載入就搬了 100 份完整光表。

## 時間戳為什麼還是本地時間

`update_time` 同時是**顯示字串、網址參數、排序鍵**（`sort` 直接對字串做，
靠 `YYYY-MM-DD-HH:MM:SS` 這個定寬格式恰好等價於時間順序）。

改成 UTC 會出事：同一個瞬間，UTC 寫出來是 `04:00` 而舊資料是 `12:00`，於是
**新存的版本排序上比舊的還早**，`LATEST` 會回傳一份舊光表——而畫面上完全
看不出來。所以格式維持原樣，只在秒後面補毫秒（`...:56.789`），字典序仍然
與時間順序一致（`"...:56" < "...:56.789" < "...:57"`），舊資料照樣排得對。

真正的時間另外存一個 `created_at`（BSON datetime、UTC），未來要換排序鍵時
有東西可以依據。
"""

import os
from datetime import datetime, timezone
from time import localtime, strftime

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

# ============================================================================
# 時間戳
# ============================================================================

#: `update_time` 的格式。定寬，所以字典序 == 時間序（排序直接對字串做）
STAMP_FORMAT = "%Y-%m-%d-%H:%M:%S"


def now_stamp():
    """
    產生這一次上傳的 `update_time`。

    毫秒是為了**唯一性**，不是為了精度：連按兩下 Output 若產生兩份
    `(user, update_time)` 相同的文件，`find_one` 回哪一份就沒有定義了。
    """
    now = datetime.now()
    return f"{strftime(STAMP_FORMAT, localtime())}.{now.microsecond // 1000:03d}"


def now_utc():
    """真正的時間點。`update_time` 是本地時間字串，這個才有時區。"""
    return datetime.now(timezone.utc)


# ============================================================================
# 索引
# ============================================================================

#: 集合 → 索引定義。`unique` 的那些若因既有重複資料建不起來，會退成一般索引
INDEXES = {
    "color": [
        # 這一組同時服務四種查詢：指定版本、LATEST（同前綴 + 反向掃一筆）、
        # 某使用者的版本清單、以及上傳時的計數。少了它每一種都是全表掃描。
        {"keys": [("user", ASCENDING), ("update_time", DESCENDING)], "unique": True},
    ],
    "raw_json": [
        {"keys": [("user", ASCENDING), ("update_time", DESCENDING)], "unique": True},
    ],
    "users": [
        # 帳號名稱是登入的鍵。沒有唯一索引的話，資料庫允許存在兩個同名帳號，
        # 而 `find_one` 只會回其中一個——密碼對不上的那個使用者會登不進來
        {"keys": [("username", ASCENDING)], "unique": True},
    ],
}


def ensure_indexes(db, log=print):
    """
    建立索引。**冪等**：已經存在的定義 `create_index` 直接回傳，不會重建。

    在啟動時呼叫。刻意不讓它把整個服務弄掛——資料庫暫時連不上時，服務應該還是
    起得來（讀寫會各自失敗並回報），比整個 API 起不來好。

    @returns 建立/確認了幾個索引，以及失敗的清單（給測試與啟動日誌用）
    """
    created, failed = [], []

    for name, specs in INDEXES.items():
        collection = db[name]
        for spec in specs:
            keys = spec["keys"]
            unique = spec.get("unique", False)
            try:
                collection.create_index(keys, unique=unique, background=True)
                created.append((name, keys, unique))
            except PyMongoError as error:
                if unique:
                    # 既有資料裡就有重複（例如同一秒上傳兩次留下來的），
                    # 唯一索引建不起來。退成一般索引：查詢還是快，只是
                    # 擋不住新的重複——而那要先把舊的重複清掉才做得到。
                    try:
                        collection.create_index(keys, background=True)
                        created.append((name, keys, False))
                        log(
                            f"[storage] {name} 的唯一索引建不起來（既有資料有重複），"
                            f"已退成一般索引：{error}"
                        )
                        # 光說「有重複」沒有用，要指出是哪幾筆才清得掉
                        _report_duplicates(collection, keys, log)
                        continue
                    except PyMongoError as fallback_error:
                        error = fallback_error
                failed.append((name, keys, str(error)))
                log(f"[storage] 建立索引失敗 {name}{keys}：{error}")

    return created, failed


def _report_duplicates(collection, keys, log):
    """唯一索引建不起來時，把重複的鍵印出來讓人知道要清哪些。"""
    try:
        duplicates = find_duplicates(collection, tuple(key for key, _ in keys))
    except PyMongoError as error:  # aggregate 也可能失敗，那就算了
        log(f"[storage] 找不出重複的資料：{error}")
        return

    if not duplicates:
        # 索引失敗但查不到重複——那就不是重複造成的，原始錯誤才是重點
        log("[storage] 查不到重複的鍵，唯一索引失敗的原因可能不是重複資料")
        return

    log(f"[storage] {collection.name} 有 {len(duplicates)} 組重複的鍵（最多列 50 組）：")
    for entry in duplicates[:10]:
        log(f"[storage]   {entry['_id']} × {entry['count']}")


def find_duplicates(collection, keys=("user", "update_time")):
    """
    找出違反唯一性的既有資料，讓唯一索引建不起來時知道要清哪些。

    刻意**只回報不刪除**——刪掉的是使用者的光表版本，那必須由人決定。
    """
    group_id = {key: f"${key}" for key in keys}
    pipeline = [
        {"$group": {"_id": group_id, "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 50},
    ]
    return list(collection.aggregate(pipeline))


# ============================================================================
# 文件形狀
# ============================================================================

#: 清單頁只需要這幾欄。不投影的話每一列都會把整份 `players` 撈出來
LIST_PROJECTION = {"user": 1, "update_time": 1, "music_filename": 1}

#: 一次最多回幾筆版本清單。沒有上限的話，用久了那支端點會回傳整個資料庫
DEFAULT_LIST_LIMIT = 200
MAX_LIST_LIMIT = 1000


def color_document(user, update_time, players, music_filename):
    """
    播放用的文件（韌體吃的那份）。

    `music_filename` 一律轉成字串。先前有兩個地方預設是 `0`（整數），於是同一個
    欄位在資料庫裡同時存在字串與整數兩種型別，前端 `item.music_filename ||
    "未設定"` 對 `0` 的判斷剛好也是 falsy，所以沒有人發現。
    """
    return {
        "user": user,
        "update_time": update_time,
        "created_at": now_utc(),
        "players": players,
        "music_filename": str(music_filename or ""),
    }


def raw_document(user, update_time, raw_data, music_filename=""):
    """
    編輯器的原始資料。

    `raw_data` 是**前端的黑盒子**（一整串 JSON 字串），後端不解析——這是刻意的：
    光表的形狀由前端的 schemaVersion 管，後端不必跟著改版。

    但 `music_filename` 另外抄一份到頂層：不然想知道「這一版是哪首歌」就得把
    整串 JSON 拉出來 parse 一次，而那正是清單頁要做的事。
    """
    return {
        "user": user,
        "update_time": update_time,
        "created_at": now_utc(),
        "raw_data": raw_data,
        "music_filename": str(music_filename or ""),
    }


# ============================================================================
# 保留策略
# ============================================================================

#: 每個使用者最多保留幾個版本。**0 = 全部保留**（預設）
HISTORY_LIMIT = int(os.getenv("HISTORY_LIMIT", "0") or 0)


def prune_history(collection, user, limit=None, log=print):
    """
    刪掉超出保留數量的舊版本，只留最新的 `limit` 份。

    ⚠️ **預設不刪任何東西。** 這裡刪的是使用者存過的光表版本，一旦刪掉就沒有了
    （備份腳本是每兩天跑一次的，中間那段沒有）。所以要明確設定 `HISTORY_LIMIT`
    才會啟用——先前那段程式碼被註解掉，多半就是因為沒有人敢讓它預設開著。

    @returns 刪掉幾份
    """
    limit = HISTORY_LIMIT if limit is None else limit
    if limit <= 0:
        return 0

    keep = [
        doc["_id"]
        for doc in collection.find({"user": user}, {"_id": 1})
        .sort("update_time", DESCENDING)
        .limit(limit)
    ]
    if len(keep) < limit:
        return 0

    result = collection.delete_many({"user": user, "_id": {"$nin": keep}})
    if result.deleted_count:
        log(f"[storage] {user} 超出保留上限 {limit}，刪除 {result.deleted_count} 份舊版本")
    return result.deleted_count


# ============================================================================
# 寫入
# ============================================================================


class StorageError(RuntimeError):
    """寫入失敗。呼叫端要據此回錯誤給客戶端，不要吞掉之後回 success。"""


def insert_show(collection_color, collection_raw, *, color, raw, log=print):
    """
    把一次上傳的兩份文件寫進去，**要嘛都成功、要嘛都不留**。

    ⚠️ 這兩份必須成對存在：`color` 是韌體要播的、`raw` 是編輯器要載回來的，
    共用同一個 `update_time` 當版本編號。只寫成功一份的話會出現「跑得動但打不開」
    或「打得開但跑不動」的版本，而清單上看起來完全正常。

    這個部署是單機 mongo（不是 replica set），**用不了交易**，所以用補償的做法：
    第二份失敗就把第一份刪掉。刪除本身再失敗的話明講，不要假裝沒事。
    """
    raw_id = None
    try:
        raw_id = collection_raw.insert_one(raw).inserted_id
        collection_color.insert_one(color)
    except DuplicateKeyError as error:
        _rollback(collection_raw, raw_id, log)
        raise StorageError(
            "這個版本編號已經存在（同一秒內重複上傳？）請再試一次"
        ) from error
    except PyMongoError as error:
        _rollback(collection_raw, raw_id, log)
        raise StorageError(f"寫入資料庫失敗：{error}") from error

    return raw_id


def _rollback(collection, doc_id, log):
    """補償刪除。失敗就記下來——這時候資料庫裡真的留了一份孤兒。"""
    if doc_id is None:
        return
    try:
        collection.delete_one({"_id": doc_id})
    except PyMongoError as error:
        log(f"[storage] ⚠️ 回滾失敗，raw_json 留下孤兒文件 {doc_id}：{error}")
