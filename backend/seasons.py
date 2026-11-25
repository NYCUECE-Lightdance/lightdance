"""
演出年份 —— **「這份光表屬於哪一年的演出」的唯一定義處**。

每一年的演出各自存在一個資料庫裡（`lightdance_2026`、`lightdance_2027`…），
帳號（`users`）則留在原本的 `test` 資料庫、各年共用。分開存的理由：

- 每年的舞者、光衣、歌單都不一樣，混在一起時清單會越來越長，而且很容易
  載到去年的光表還以為是今年的。
- 一年演完就可以整個資料庫單獨備份、封存，不會被之後的上傳動到。

## 年份怎麼算

演出年份**不是上傳那天的西元年**。準備期是從暑假開始、隔年春天演出，
所以 7 月到隔年 6 月上傳的都算隔年的演出：

| 上傳日期 | 演出年份 |
|---|---|
| 2025-07-01 ～ 2026-06-30 | 2026 |
| 2026-07-01 ～ 2027-06-30 | 2027 |

分界的月份由 `SEASON_START_MONTH` 環境變數決定（預設 7）。設成 1 就等於
「上傳那年就是演出年份」。

⚠️ **前端不自己算年份。** 前端沒有指定年份時就不帶參數，由這裡的
`current_season()` 決定——分界月份只在一個地方定義，改了不會兩邊對不上。
"""

import os
import re
from datetime import date, datetime

#: 每年從幾月開始算下一年的演出（1-12）
SEASON_START_MONTH = int(os.getenv("SEASON_START_MONTH", "7") or 7)
if not 1 <= SEASON_START_MONTH <= 12:
    raise ValueError(f"SEASON_START_MONTH 必須是 1 到 12，目前是 {SEASON_START_MONTH}")

#: 每年的資料庫名稱 = 前綴 + 年份
SEASON_DB_PREFIX = os.getenv("SEASON_DB_PREFIX", "lightdance_")

#: 帳號所在的資料庫（各年共用）。也是分年之前所有光表所在的地方
ACCOUNTS_DB = "test"

#: 合理的年份範圍。擋掉打錯字（`?year=226`）造出一個新資料庫
MIN_SEASON = 2000
MAX_SEASON = 2100

_DB_NAME = re.compile(rf"^{re.escape(SEASON_DB_PREFIX)}(\d{{4}})$")


def season_of(day):
    """某一天屬於哪一年的演出。`day` 可以是 date 或 datetime。"""
    if SEASON_START_MONTH > 1 and day.month >= SEASON_START_MONTH:
        return day.year + 1
    return day.year


def current_season(today=None):
    """現在正在準備的是哪一年的演出。"""
    return season_of(today or date.today())


def season_of_stamp(update_time):
    """
    從版本編號（`update_time`）推出演出年份；認不出來就回 None。

    版本編號開頭一定是 `YYYY-MM-DD`（見 storage.STAMP_FORMAT），所以指定版本的
    網址本身就帶著年份——舊的連結不必補 `?year=` 也找得到。
    """
    try:
        return season_of(datetime.strptime(str(update_time)[:10], "%Y-%m-%d"))
    except ValueError:
        return None


def validate_season(value):
    """檢查年份是否合理，回傳整數；不合理就丟 ValueError。"""
    try:
        season = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"演出年份必須是整數：{value!r}")
    if not MIN_SEASON <= season <= MAX_SEASON:
        raise ValueError(f"演出年份必須介於 {MIN_SEASON} 和 {MAX_SEASON} 之間：{season}")
    return season


def database_name(season):
    """這一年的光表存在哪個資料庫。"""
    return f"{SEASON_DB_PREFIX}{validate_season(season)}"


def seasons_from_database_names(names):
    """從資料庫名稱清單挑出有哪些年份，由新到舊排序。"""
    seasons = {int(match.group(1)) for name in names if (match := _DB_NAME.match(name))}
    return sorted(seasons, reverse=True)
