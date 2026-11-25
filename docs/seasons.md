# 演出年份：每一年的光表分開存

每一年的演出各自一個 MongoDB 資料庫，帳號各年共用：

| 資料庫 | 內容 |
|---|---|
| `test` | `users`（帳號）。分年之前的 `color` / `raw_json` 也還留在這裡，沒有刪 |
| `lightdance_2025`、`lightdance_2026`… | 那一年的 `color`（韌體播的）與 `raw_json`（編輯器載回來的） |

音樂檔：新上傳的放 `music_file/_years/<年份>/<使用者>/`；分年之前上傳的留在
`music_file/<使用者>/`，**每一年都看得到**（舊光表引用的是檔名，搬走就找不到歌了）。

## 年份怎麼算

**存檔那天的西元年就是演出年份**（2026-01-01 ～ 2026-12-31 → 2026）。定義只在
`backend/seasons.py`——前端不自己算，沒選年份時請求就不帶 `year`，由後端決定
今年是哪一年。

一開始用的是「7 月到隔年 6 月算隔年」，實際歸檔後發現 2026 年電機營
（`2026_eecamp.mp3`，6 月開始做、7 月初演出）被拆進 2026 與 2027 兩年，
2026-11-25 改成西元年並重新歸檔。分界月份仍可用 `SEASON_START_MONTH` 調整
（預設 1），但改了之後已歸檔的資料要照下面的步驟重新分一次。

## API

所有光表與音樂端點都多了一個選填的 `?year=`：

| 沒帶 `year` 的時候 | 用哪一年 |
|---|---|
| 指定版本（`/items/{u}/{版本}`、`/raw/{u}/{版本}`） | 由版本編號推（版本編號開頭就是日期），所以**分年之前的舊連結照樣打得開** |
| `LATEST`、清單、上傳 | 今年 |

另外新增 `GET /api/seasons` → `{"current": 2026, "seasons": [2026, 2025]}`。

⚠️ **韌體讀 `LATEST` 時拿的是「今年」最新的一版。** 每年 1 月 1 日一過，新的
一年還沒有人存檔之前，`LATEST` 會是「找不到」。要讀去年的就帶 `?year=`。

⚠️ **存檔存進 Dashboard 選的那一年。** 打開去年的光表修改後存檔，那一版留在
去年，不會跑到今年。存檔成功的訊息會講出存進哪一年。

## 正式環境的狀態與部署步驟

**2026-11-25 已經在正式資料庫歸檔完成**（依西元年）：

| 資料庫 | `color` | `raw_json` |
|---|---|---|
| `lightdance_2025` | 262 | 254 |
| `lightdance_2026` | 343 | 367 |

歸檔前做了完整備份：`db/dump_data/pre_season_split_20261125_220017/`（mongodump
`--gzip`，還原要加 `--gzip`）。逐筆核對過，每一年都和 `test` 裡的來源一一對上；
來源裡有 8 份重複存了兩次的版本（內容完全相同），每組只複製一份。

`test` 裡的原始資料**沒有刪**。舊版程式在新版部署之前會繼續寫進 `test`，所以：

```bash
# 新版部署之後跑一次 --apply，把這段期間新存的版本補過去（已經搬過的會跳過）
docker compose -f docker-compose.prod.yml --env-file .env.deployment \
  exec backend python migrate_to_seasons.py            # 先預覽
docker compose -f docker-compose.prod.yml --env-file .env.deployment \
  exec backend python migrate_to_seasons.py --apply
```

### 改了年份規則（`SEASON_START_MONTH`）的話

已經歸檔的資料是照舊規則分的，要重新分一次：先備份，刪掉所有 `lightdance_<年份>`
（它們只是複本，來源在 `test`），再跑一次 `migrate_to_seasons.py --apply`。
2026-11-25 從「7 月起算隔年」改成西元年時就是這樣做的。

## 備份

`backend/mongo-backup.sh` 會備份 `test` 加上所有 `lightdance_<年份>`（每次現場問
有哪些年份）。列不出有哪些資料庫時整次備份失敗，而不是只備份到帳號——漏掉每一年
的光表比備份失敗更糟，後者至少會被發現。還原時備份裡有幾個資料庫就還原幾個。
