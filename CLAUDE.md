# LightDance 專案 - Claude Code 記憶檔案

## 專案基本資訊

**專案名稱**：LightDance 燈光舞蹈控制系統  
**維護團隊**：國立陽明交通大學電機工程學系學生   
**開發語言**：繁體中文為主，專有名詞保持原文

## 專案概述

這是一個**全端 Web 應用程式**，用於設計、編輯與控制穿戴式 LED 燈光舞蹈表演。
舞者身上穿著由多個 LED 部位組成的「光衣」(Armor)，編舞者透過此系統在時間軸上為每個部位
編排顏色變化，搭配音樂同步，最終把資料下發到硬體 (Pico) 上播放。

### 技術架構

```
前端 (React 18 + Redux) ←→ 後端 (FastAPI) ←→ 資料庫 (MongoDB)
     ↑                          ↑                  ↑
  Port 3000                 Port 8000          Port 27017
                                ↓
                          音樂檔 (MUSIC_FILE_PATH，預設 /music)
```

## 系統核心邏輯

### 資料模型 ([backend/models.py](backend/models.py))
一場表演的資料結構：
- **PlayerData**：單一舞者在「某個時間點」的燈光快照，含 15 個部位整數顏色值
  (`hat, face, chestL, chestR, armL, armR, tie, belt, gloveL, gloveR, legL, legR, shoeL, shoeR, board`)
- **Player**：一位舞者的完整時間序列 = `List[PlayerData]`
- **Data**：完整表演 = `user + last_updated_time + List[Player] + music_filename`
- **RAW**：前端編輯中的原始 JSON 字串 (含 actionTable/duration/線性插值資訊)，未壓平成 PlayerData

MongoDB collections：
- `color`：壓平後可下發給硬體的 PlayerData 序列（`upload_items` 寫入）
- `raw_json`：前端編輯中的完整原始狀態（`upload_raw` 寫入），方便載入時還原 UI
- `music`：音樂 metadata（音檔本身存在檔案系統 `MUSIC_FILE_PATH`）
- `pico`：硬體相關
- `users`：帳號（⚠️ 密碼明文儲存，token 直接 = username，見安全章節）

### 前端資料流 (Redux)
- [frontend/src/redux/store.js](frontend/src/redux/store.js) 用 redux-persist 將編輯狀態存到 localStorage
- 主要 state：`profiles.data.actionTable`、`currentTime`、`duration`、`chosenColor`、
  `multiSelectedBlocks`、`musicFilename`
- actionTable 結構：`actionTable[armorIdx][partIdx] = [{time, color:{R,G,B,A}, linear}, ...]`
  - `linear` 標記該段是否漸變到下一個關鍵點
- 上傳時前端把 RGBA + 時間壓平成後端 PlayerData 的整數格式

## 後端 API 功能總覽

所有 API 都在 `/api` 前綴下 ([backend/main.py](backend/main.py))。

### 身份驗證
| Method | Path | 用途 |
|---|---|---|
| POST | `/api/token` | 登入 (form: username, password)，回傳 access_token |
| GET | `/api/users/me` | 取得當前使用者，需 Bearer Token |

### 系統
| Method | Path | 用途 |
|---|---|---|
| GET | `/api/` | 健康檢查 |

### 光表資料 (Color / 處理後)
| Method | Path | 用途 |
|---|---|---|
| GET | `/api/timelist/` | 列出所有使用者所有版本 |
| GET | `/api/timelist/{username}` | 列出某使用者的所有版本 |
| GET | `/api/items/{username}/{query_time}` | 取單一版本完整資料；`query_time=LATEST` 取最新 |
| GET | `/api/items/{username}/{query_time}/player={player}/chunk={chunk}` | 分塊載入某 player (CHUNK_SIZE=10) |
| GET | `/api/items/{username}/{query_time}/{player_ID}` | 取某玩家整段資料 |
| POST | `/api/upload_items` | 上傳壓平後的 PlayerData 序列，需登入 |

### 原始資料 (Raw / 編輯狀態)
| Method | Path | 用途 |
|---|---|---|
| GET | `/api/raw/{username}/{query_time}` | 取得原始 actionTable JSON，給編輯器還原 |
| POST | `/api/upload_raw` | 上傳原始編輯狀態，需登入 |

> ⚠️ `upload_items` 與 `upload_raw` 內「保留最近 5 筆」舊資料淘汰邏輯被註解掉，
> 目前會無限累積，是已知 TODO。

### 音樂
| Method | Path | 用途 |
|---|---|---|
| POST | `/api/upload_music` | 上傳 MP3，需登入；存到 `MUSIC_FILE_PATH/{username}/` |
| GET | `/api/get_music_list` | 列出所有使用者的音樂目錄 |
| GET | `/api/get_music_list/{username}` | 列出特定使用者的音樂檔 |
| GET | `/api/get_music/{username}/{filename}` | 串流下載 MP3 |

### 測試與生成工具
| Method | Path | 用途 |
|---|---|---|
| GET | `/api/get_rand_lightlist/cnt={cnt}/seed={seed}` | 指定種子的隨機光表 (1≤cnt≤1500) |
| GET | `/api/get_rand_lightlist/cnt={cnt}` | 隨機光表 |
| GET | `/api/get_rand_lightlist/json/cnt={cnt}` | JSON 格式隨機光表 |
| GET | `/api/get_test_lightlist/cnt={cnt}` | 固定位元樣式測試資料 |
| GET | `/api/get_test_lightlist/cnt={cnt}/chunk={chunk}` | 分塊版本，CHUNK_SIZE=100 |
| GET | `/api/test/get_test_color` | 給韌體組的固定顏色字串 |

## 前端功能與頁面流程

### 路由 / 頁面 ([frontend/src/pages/](frontend/src/pages/))
- **[Welcome.jsx](frontend/src/pages/Welcome.jsx)**：開場動畫
- **[Login.jsx](frontend/src/pages/Login.jsx)**：登入畫面，呼叫 `POST /api/token`
- **[Dashboard.jsx](frontend/src/pages/Dashboard.jsx)**：登入後主入口
  - `GET /api/timelist/{username}` 顯示「舊專案列表」
  - 「+ 新專案」：選音樂 → 進入 `/home`
  - 點舊專案：`GET /api/raw/{user}/{time}` 還原 actionTable + musicFilename → 進入 `/home`
- **[Home.jsx](frontend/src/pages/Home.jsx)**：主編輯器頁面
  - 載入 Palette / People / ControlPanel / DancerToggle / Armor 等元件
  - 提供匯入、匯出、編輯模式、登出、自動刷新
  - 上傳時將 actionTable 轉成 PlayerData，POST 至 `/api/upload_items` 與 `/api/upload_raw`
- **[EditActionTable.jsx](frontend/src/pages/EditActionTable.jsx)**：細部編輯介面
- **[model.jsx](frontend/src/pages/model.jsx)**：3D 預覽

### 元件 ([frontend/src/components/](frontend/src/components/))
- **Armor.jsx**：單一舞者光衣視覺化 (15 部位 hat/face/chestL...board)，依 `currentTime` 顯示對應顏色，可點選部位
- **Palette.jsx**：取色盤，更新 `chosenColor`
- **ControlPanel.jsx**：播放列、時間軸、duration 控制，與音樂同步
- **People.jsx**：所有舞者列表
- **DancerToggle.jsx**：切換顯示舞者
- **DisplayContent.jsx**：時間軸關鍵格顯示
- **LoadData.jsx**：載入既有專案 dropdown
- **ApiDebugPanel.jsx**：API 偵錯面板
- **WelcomeMotion/, audio/**：動畫與音效素材

### Redux ([frontend/src/redux/](frontend/src/redux/))
- **store.js**：configureStore + redux-persist
- **actions.js**：`updateActionTable / updateCurrentTime / updateDuration / updateChosenColor / updateMultiSelectedBlocks / updateMusicFilename / updateAutoRefresh ...`

## 典型使用流程

1. `./start-dev.sh` 啟動 Docker (前端 3000 / 後端 8000 / Mongo 27017)
2. 開啟 `http://localhost:3000` → Welcome → Login（帳密在 mongo `users` collection）
3. **Dashboard**：
   - 上傳音樂：`POST /api/upload_music` (MP3)
   - 「新專案」：選音樂 → 進編輯器
   - 「舊專案」：選版本 → `GET /api/raw/...` 還原 → 進編輯器
4. **Home 編輯器**：
   - 用 Palette 選顏色，在 Armor / EditActionTable 上對「舞者 × 部位 × 時間點」放色塊
   - ControlPanel 播放音樂預覽，currentTime 同步更新光衣顏色
   - 可設定 linear (漸變) 或單點切換
5. **儲存**：
   - `POST /api/upload_raw`：保存原始編輯狀態 (供下次載入回 UI)
   - `POST /api/upload_items`：保存壓平後 PlayerData (供硬體播放)
6. **硬體端 (Pico)** 透過 `/api/items/...` 或分塊 API 拉資料下發到 LED 板

## 開發環境指令

### 必備檢查指令
```bash
# 檢查專案狀態
docker compose -f docker-compose.dev.yml ps

# 查看所有服務日誌
docker compose -f docker-compose.dev.yml logs -f

# 啟動開發環境
./start-dev.sh

# 停止開發環境
# 使用 Ctrl+C 或
docker compose -f docker-compose.dev.yml down
```

### 故障排除指令
```bash
# 重新建置並啟動
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build

# 檢查端口占用
lsof -i :3000  # 前端
lsof -i :8000  # 後端
lsof -i :27017 # 資料庫

# 清除前端快取
docker volume rm lightdance_frontend_node_modules
```

## 專案特色

### 對 C++ 開發者友好的設計
- **詳細的中文註解**：所有重要概念都有對應 C++ 的解釋
- **一鍵啟動環境**：使用 `./start-dev.sh` 避免複雜的環境配置
- **完整的故障排除指南**：常見問題都有詳細的解決步驟
- **容器化部署**：類似跨平台編譯，確保環境一致性

### 程式碼品質標準
根據專案要求，程式碼優先順序為：
1. **可讀性** - 程式碼要讓其他開發者容易理解
2. **可維護性** - 便於未來修改和擴展  
3. **可擴展性** - 支援功能增加和系統擴展
4. **易懂** - 邏輯清晰，註解適當
5. **簡潔** - 在滿足以上條件下保持簡潔

## 重要檔案說明

### 配置檔案
- **`.env.development`**：開發環境變數設定
- **`docker-compose.dev.yml`**：開發環境容器編排
- **`start-dev.sh`**：開發環境一鍵啟動腳本

### 核心程式碼
- **`frontend/src/`**：React 前端程式碼
- **`backend/main.py`**：FastAPI 後端主程式
- **`mongo-init/`**：資料庫初始化腳本

### 文件檔案
- **`README.md`**：專案說明文件（已針對 C++ 開發者優化）
- **`docs/technical-analysis.md`**：詳細技術分析報告
- **`docs/configuration.md`**：完整配置說明

## 常見開發任務

### 新增功能開發
1. 先閱讀 `docs/technical-analysis.md` 了解現有架構
2. 確認功能需求符合專案目標（燈光控制相關）
3. 遵循程式碼品質標準進行開發
4. 確保前後端都能正常運行後再提交

### 修復 Bug
1. 使用 `docker compose logs -f` 查看錯誤日誌
2. 查閱 README.md 中的故障排除章節
3. 如果是安全性相關問題，參考 `docs/technical-analysis.md` 第五章節

### 程式碼重構
1. 保持向後相容性
2. 增加適當的註解說明變更原因
3. 確保重構後符合程式碼品質標準

## 安全性注意事項

⚠️ **重要**：專案目前存在以下安全問題需要注意：

1. **密碼明文儲存** - 需實施 bcrypt 或 Argon2 加密
2. **Token 機制不安全** - 需要改用 JWT
3. **輸入驗證不足** - 需加強使用者輸入驗證
4. **CORS 設定過寬** - 需要限制允許的來源

詳細改進方案請參考 `docs/technical-analysis.md`。

## 學習建議

### 對 C++ 開發者的概念對應
- **前端 React** ≈ Qt/GTK GUI 程式設計
- **後端 FastAPI** ≈ 主程式邏輯處理
- **MongoDB** ≈ 檔案 I/O + 資料結構，但更強大
- **Docker** ≈ 跨平台編譯環境
- **RESTful API** ≈ 函數介面呼叫

### 推薦學習順序
1. 先熟悉 Docker 基本概念和指令
2. 了解 HTTP 協定和 RESTful API 設計
3. 學習 React 前端框架基礎
4. 學習 Python 和 FastAPI 後端開發
5. 了解 MongoDB 文件式資料庫

## 協作指引

### 與 C++ 背景開發者溝通
- 多使用類比的方式解釋 Web 開發概念
- 提供具體的指令範例而非抽象描述
- 解釋每個步驟的原因和目的
- 先詢問需求細節再開始實作

### 程式碼審查重點
- 檢查是否有適當的中文註解
- 確認程式碼符合可讀性優先的原則
- 驗證新功能是否破壞現有功能
- 確保安全性問題沒有被引入

## 更新記錄

- **2025-08-20**：建立專案記憶檔案，針對 C++ 背景開發者優化 README.md
- **專案狀態**：開發版本，包含已知安全性問題待修復