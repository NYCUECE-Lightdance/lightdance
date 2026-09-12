# LightDance 資料流管道 (Data Flow Pipeline)

從前端編輯器到 MongoDB 資料庫的完整資料流說明。適合想了解燈光資料如何在系統中流轉的開發者。

## 1. 資料流概覽

```
┌──────────────────────────────────────────────────────────────────────┐
│                           前端 (React + Redux)                        │
│                                                                      │
│  Editor (EditActionTable.jsx / ControlPanel.jsx / Armor.jsx)         │
│       │                                                              │
│       ▼                                                              │
│  Redux Store (state.profiles.data.actionTable)                       │
│       │                                                              │
│       │  handleOutput() (Home.jsx:155)                               │
│       ▼                                                              │
│  32-bit RGBA PlayerData[] ──── POST /api/upload_full ──────────┐     │
│  raw JSON string ──────────────────────────────────────────────┤     │
│                                                                 │     │
│  IndexedDB (localforage) ←── saveLocalBackup() 本地備份         │     │
└─────────────────────────────────────────────────────────────────┼─────┘
                                                                  │
┌─────────────────────────────────────────────────────────────────┼─────┐
│                        後端 (FastAPI + PyMongo)                  │     │
│                                                                 ▼     │
│  api_router.post("/upload_full")  (main.py)                          │
│       │                                                              │
│       ├──▶ collection_color.insert_one()  — 處理後的播放資料         │
│       └──▶ collection_raw.insert_one()   — 原始編輯器 JSON           │
│                                                                      │
│                    ▼                                                 │
│              MongoDB (test 資料庫)                                    │
│              ├── color    — 播放用 32-bit RGBA 陣列                  │
│              ├── raw_json — 編輯器原始狀態 JSON                       │
│              └── users    — 使用者帳號密碼                            │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. 編輯器資料格式 (actionTable)

actionTable 是前端 Redux store 中的核心資料結構，用巢狀物件陣列表示燈光編排：

```
actionTable[armorIndex][partIndex] = [
  { time: <毫秒>, color: {R, G, B, A}, linear: 0|1 },
  ...
]
```

### 參數說明

| 參數 | 類型 | 說明 |
|------|------|------|
| `armorIndex` | 0-6 | 舞者編號，最多 7 位 |
| `partIndex` | 0-21 | 身體部位編號，共 22 個 |
| `time` | number | 時間點（毫秒，ms） |
| `color.R/G/B` | 0-255 | RGB 顏色值 |
| `color.A` | 0.0-1.0 | 透明度（浮點數） |
| `linear` | 0 或 1 | 0 = 固定色，1 = 線性過渡到下一個區塊 |

### 身體部位對照表 (partIndex → 部位名稱)

| partIndex | 部位名稱 | partIndex | 部位名稱 |
|-----------|---------|-----------|---------|
| 0 | hat (帽子) | 11 | legR (右腿) |
| 1 | face (臉) | 12 | shoeL (左鞋) |
| 2 | chestL (左胸) | 13 | shoeR (右鞋) |
| 3 | chestR (右胸) | 14 | acc0 (配件0) |
| 4 | armL (左手臂) | 15 | acc1 (配件1) |
| 5 | armR (右手臂) | 16 | acc2 (配件2) |
| 6 | tie (領帶) | 17 | acc3 (配件3) |
| 7 | belt (腰帶) | 18 | acc4 (配件4) |
| 8 | gloveL (左手套) | 19 | acc5 (配件5) |
| 9 | gloveR (右手套) | 20 | acc6 (配件6) |
| 10 | legL (左腿) | 21 | acc7 (配件7) |

> **配件說明**：acc0-acc7 為舞者身上的可程式化配件 LED（如螢光繩、劍、匕首）。配件對應設定在 `frontend/src/config/accessoryConfig.js`。

## 3. handleOutput() 轉換流程

`handleOutput()` 位於 `frontend/src/pages/Home.jsx:155`，負責將編輯器格式轉換為硬體可讀的 PlayerData 格式。轉換分為四個步驟：

### Step 1 — 時間軸對齊

```javascript
const roundedTime = Math.ceil(item.time / 50) * 50;
```

每個區塊的時間點被向上取整到 50ms 的倍數（如 123ms → 150ms），確保所有燈光指令在統一的時間網格上。

### Step 2 — 線性過渡插值 (linear interpolation)

當區塊標記 `linear === 1` 時，系統在當前區塊和下一個區塊之間進行顏色插值：

```javascript
const f = (time - activeBlock.time) / (nextBlock.time - activeBlock.time);
R = Math.round(activeBlock.color.R * (1 - f) + nextBlock.color.R * f);
G = Math.round(activeBlock.color.G * (1 - f) + nextBlock.color.G * f);
B = Math.round(activeBlock.color.B * (1 - f) + nextBlock.color.B * f);
A = activeBlock.color.A * (1 - f) + nextBlock.color.A * f;
```

> **C++ 概念對應**：這等同於 `std::lerp(activeBlock, nextBlock, f)` 的線性插值。

### Step 3 — 32-bit RGBA 打包

每個部位的顏色被壓縮為單一 32-bit 整數（與硬體 LED 控制器的資料格式對齊）：

```javascript
const alpha7 = Math.min(Math.floor(A * 128), 127);   // float → 7-bit (0-127)
const packedByte = (alpha7 << 1) | (linear & 1);     // bit[7:1]=alpha, bit[0]=linear
const color32 = ((R & 0xff) << 24) | ((G & 0xff) << 16) | ((B & 0xff) << 8) | (packedByte & 0xff);
```

**bit 佈局**：

```
  31       24 23       16 15        8 7         0
┌───────────┬───────────┬───────────┬───────────┐
│     R     │     G     │     B     │ A6..A1│L │
│  8 bits   │  8 bits   │  8 bits   │ 7 bits│1b│
└───────────┴───────────┴───────────┴───────────┘
```

- R/G/B 各佔 8 bits（無損）
- Alpha 從 float 0.0-1.0 量化為 7-bit 整數 0-127（輕微精度損失）
- L (linear flag) 佔 1 bit，表示此時間步是否為線性過渡

### Step 4 — 合併為 PlayerData 格式

```javascript
mergedResults.push({
  time: mergedItem.time,   // 以 50ms 為單位的時間步編號
  hat: mergedItem[0] ?? 0,
  face: mergedItem[1] ?? 0,
  // ... 共 22 個欄位
  acc7: mergedItem[21] ?? 0,
});
```

最後使用 forward-fill 填補空缺：若某時間步缺少某部位的值，則沿用前一個時間步的值，確保燈光連續性。

## 4. 上傳 API 端點

所有端點均需 `Bearer Token` 認證（目前 token 即為使用者名稱）。

### POST /api/upload_full（主要上傳端點）

前端使用的合併上傳端點，一次請求同時寫入原始資料和播放資料，確保兩者的時間戳一致。

```json
// 請求體 (FullUpload model)
{
  "raw_data": "{ ... actionTable JSON string ... }",
  "players": [[{ "time": 0, "hat": 4278190080, "face": 0, ... }]],
  "music_filename": "2026_show.mp3"
}
```

**後端處理** (`main.py`):
1. 產生統一的 `update_time` 時間戳
2. `collection_color.insert_one()` — 寫入處理後的播放資料
3. `collection_raw.insert_one()` — 寫入原始編輯器 JSON
4. 若 Pydantic 驗證失敗，回退到降級格式儲存

### POST /api/upload_items

僅上傳處理後的 PlayerData（不包含 raw JSON）。

### POST /api/upload_raw

僅上傳原始編輯器 JSON 字串。

## 5. MongoDB 文件結構

### color 集合（處理後的播放資料）

```json
{
  "_id": ObjectId,
  "user": "testuser",
  "update_time": "2026-05-03T12:00:00.000Z",
  "players": [
    // armorIndex 0 (舞者1)
    [
      { "time": 0, "hat": 4278190080, "face": 0, "chestL": 0, ..., "acc7": 0 },
      { "time": 1, "hat": 4278190080, "face": 0, "chestL": 0, ..., "acc7": 0 }
    ],
    // armorIndex 1-6 (舞者2-7)
    ...
  ],
  "music_filename": "2026_show.mp3"
}
```

每個 `players[armorIndex]` 是一個時間步陣列，時間步以 50ms 為單位（`time: 0` = 0ms, `time: 1` = 50ms）。

### raw_json 集合（原始編輯器資料）

```json
{
  "_id": ObjectId,
  "user": "testuser",
  "update_time": "2026-05-03T12:00:00.000Z",
  "raw_data": "{ \"actionTable\": [...], \"music_filename\": \"2026_show.mp3\" }"
}
```

`raw_data` 儲存完整的 Redux `data` 物件 JSON 字串，可直接用於恢復編輯狀態。

### 每使用者條目限制

後端限制每使用者最多 5 個條目（`MAX_ITEMS_PER_USER = 5`）。超過 5 個時會刪除最舊的條目。

## 6. IndexedDB 本地備份機制

使用 `localforage` 在瀏覽器 IndexedDB 中儲存備份，位於 `frontend/src/utils/indexedDB.js`。

### 儲存流程

1. handleOutput() 先執行 `saveLocalBackup(backupKey, backupData)` 將資料存至 IndexedDB
2. 再嘗試 POST 上傳至伺服器
3. 上傳成功後更新備份狀態為 `uploaded: true`
4. 上傳失敗：資料仍在 IndexedDB 中，使用者可稍後重試

### 備份鍵值

```
local_backup_{music_filename}
```

### 自動清理

```javascript
// 超過 30 天的備份自動清除
const EXPIRATION_DAYS = 30;
```

### Redux Persist

Redux 狀態透過 `redux-persist` + `localforage` 持續寫入 IndexedDB，確保頁面刷新後編輯狀態不丟失。音訊波形峰值資料 (`fullPeaks`) 使用自訂 `PeaksTransform` 以 `Float32Array` 格式高效儲存。

## 7. 資料載入流程

從伺服器載入已儲存專案的逆向流程：

```
GET /api/timelist/{username}
  → 取得使用者的所有時間戳列表
  → Dashboard.jsx 顯示專案卡片

GET /api/raw/{username}/{query_time}
  → 取得 raw_data JSON 字串
  → JSON.parse(raw_data)
  → dispatch(updateActionTable(parsed.actionTable))
  → navigate("/home") 回到編輯器

或

GET /api/items/{username}/{query_time}
  → 取得處理後的 32-bit RGBA 陣列
  → 逆向轉換回 actionTable 格式
  → dispatch 至 Redux store
```

## 8. C++ 開發者概念對應

| Web 概念 | C++ 類比 | 說明 |
|----------|---------|------|
| actionTable (巢狀物件) | `std::vector<std::unordered_map<int, std::vector<Block>>>` | 多層巢狀容器 |
| handleOutput() 轉換 | 資料序列化 (serialization) | 將記憶體格式轉為傳輸/儲存格式 |
| 32-bit RGBA 打包 | bitwise `<<` `\|` 操作 + `union` | 手動 bit layout 壓縮 |
| 線性插值 | `std::lerp()` (C++20) | 兩個顏色之間的平滑過渡 |
| MongoDB document | `struct` 寫入檔案 | 結構化資料的持久化儲存 |
| IndexedDB | `std::map` + 檔案 I/O | 瀏覽器端的 key-value 持久化儲存 |
| POST /api/upload_full | 函數呼叫 + 參數傳遞 | 透過 HTTP 呼叫遠端函數 |
| Redux dispatch | 事件驅動的狀態更新 | 類似 signal/slot 或 observer pattern |
