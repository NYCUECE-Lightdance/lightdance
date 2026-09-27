# LightDance 專案 - Claude Code 記憶檔案

## 專案基本資訊

**專案名稱**：LightDance 燈光舞蹈控制系統  
**維護團隊**：國立陽明交通大學電機工程學系學生   
**開發語言**：繁體中文為主，專有名詞保持原文

## 專案概述

這是一個**全端 Web 應用程式**，用於設計和控制燈光舞蹈表演。專案採用現代化的微服務架構，透過 Docker 容器化技術確保環境一致性。

### 技術架構

```
開發環境：
  前端 (Vite/React, Port 3000) ── /api proxy ──→ 後端 (FastAPI, Port 8000) ──→ MongoDB (Port 27017)
生產環境：
  Nginx (Port 80) ── /api 轉發 ──→ 後端 (FastAPI, Port 8000) ──→ MongoDB (Port 27017)
                    └── 靜態檔案 (React build)
```

> **注意**：開發與生產環境的 API 路由方式不同，詳見 `docs/network-architecture-refactor-plan.md`。

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

# 檢查連接埠占用
lsof -i :3000  # 前端
lsof -i :8000  # 後端
lsof -i :27017 # 資料庫

# 清除前端快取
docker volume rm lightdance_frontend_node_modules

# MongoDB 連線問題（登入 500 錯誤）
# 請參考 docs/troubleshooting-login-500.md 的完整 SOP
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

## 資料流管道 (Data Flow Pipeline)

```
Editor (actionTable) → Redux Store → handleOutput() → 32-bit RGBA 打包 → POST /api/upload_full → MongoDB
```

### 編輯器資料格式 (actionTable)
store 存的是 **segments**（色塊），不是關鍵格：

```js
actionTable[armorIndex][partIndex] = [
  { id, start, end, colorStart: {R,G,B,A}, colorEnd: {R,G,B,A}, linear },
  ...
]
```

armorIndex 0-6（舞者），partIndex 0-21（14 個身體部位 + 8 個配件 LED）。
時間單位是毫秒且對齊 `TICK_MS`（50ms）網格，`linear` 為 1 時段內從
`colorStart` 漸變到 `colorEnd`。

**段與段之間可以有間隔，間隔就是熄滅**——黑色不是資料。壓平回韌體格式時
空隙前會在網格整點補一個黑關鍵格，所以韌體看到的東西不變（有等價測試守著）。

### 上傳格式轉換 (handleOutput, Home.jsx:155)
1. 時間軸對齊至 50ms 的倍數
2. 線性過渡顏色插值（等同 `std::lerp`）
3. 32-bit RGBA 打包：`(R<<24) | (G<<16) | (B<<8) | ((alpha7)<<1 | linear)`
4. 一次寫入 `collection_color`（播放資料）和 `collection_raw`（編輯器原始 JSON）

### 本地備份
IndexedDB（localforage）自動備份，30 天自動清理。Redux 透過 redux-persist 持續持久化。

詳細流程說明請參考 `docs/data-flow-pipeline.md`。

## 重要檔案說明

### 配置檔案
- **`.env.development`**：開發環境變數設定
- **`docker-compose.dev.yml`**：開發環境容器編排
- **`start-dev.sh`**：開發環境一鍵啟動腳本

### 核心程式碼
- **`frontend/src/`**：React 前端程式碼
- **`backend/main.py`**：FastAPI 後端主程式
- **`mongo-init/`**：資料庫初始化腳本

#### 編輯器元件（Phase 3 拆件後）

`components/audio/audioplayer.jsx` 現在只是外殼（狀態容器 + 版面組合）。
有快捷鍵的功能一律拆成 **hook（邏輯）+ 元件（UI）**，外殼呼叫一次 hook，
按鈕與鍵盤共用同一組函式：

| 檔案 | hook | 內容 |
|---|---|---|
| `MusicSelector.jsx` | — | 音樂清單與切歌（完全自持） |
| `PlayerControls.jsx` | — | 速度 / 播放 / 時間 / 縮放 / 音量 |
| `ShiftTool.jsx` | `useTimeShift` | 區間平移（按鈕 + 時間軸標記） |
| `EffectMenu.jsx` | `useLightEffects` | 漸變 / 頻閃 / 亮度階梯 |
| `TrackToolbar.jsx` | `useTrackActions` | 導航 / 剪下 / 刪除 / 亮度 / 改色 / 統一透明度 |
| `CopyPasteManager.jsx` | `useCopyPaste` | 五種複製貼上 + 複製模式 |
| `hooks/useKeyboardShortcuts.js` | — | 全站唯一的 keydown 註冊點（宣告式 keymap） |
| `WorksetBar.jsx` | `useWorksets` | 工作集：具名軌道組的切換 / 新增 / 改名 / 刪除 |

`Timeline.jsx` 的拖曳/resize 運算已在 Phase 5f 抽到
`utils/segments/gestures.js`（`movableRange` / `moveSegments` / `resizeSegment`
三個純函式），元件裡只剩像素換算與直接寫 DOM。

`waveform.jsx` 已經拆完，現在只做兩件事：**畫波形**與**回報播放位置**。
音訊全部在 `utils/audio/`：

| 檔案 | 內容 |
|---|---|
| `peaks.js` | 峰值運算（兩層降取樣，純函式）＋ 多首歌拼成一條波形 |
| `clock.js` | 「現在播到第幾毫秒」的唯一算法 |
| `clips.js` | 播放清單的形狀與不變式（順序 → 位置、接縫） |
| `schedule.js` | clip 時間軸 → `start(when, offset, duration)` 的參數與音量包絡 |
| `engine.js` | 所有 Web Audio 狀態（**不是 hook、不認得 React**，所以測得到） |
| `hooks/useAudioEngine.js` | 薄薄一層：建立引擎、同步 volume/rate、卸載時清掉 |
| `hooks/useAudioClips.js` | 播放清單的唯一讀取入口（順手做形狀遷移） |

### 文件檔案
- **`README.md`**：專案說明文件（散文式，重點在資料模型與驗收方式）
- **`docs/getting-started.md`**：全新電腦從零跑起 dev 環境（含匯入真實資料、跑測試）
- **`docs/data-handoff.md`**：給維護者：交接給新成員的資料（只給 `color`/`raw_json` 與音樂，不給 `users`/`.env.deployment`）與伺服器打包步驟
- **`docs/technical-analysis.md`**：詳細技術分析報告（架構、API、安全問題、改進路線圖）
- **`docs/configuration.md`**：完整配置說明（環境變數、API 端點、部署模式）
- **`docs/data-flow-pipeline.md`**：從編輯器到資料庫的完整資料流說明
- **`docs/backend-management.md`**：MongoDB 備份與 Docker 管理操作指南
- **`docs/network-architecture-refactor-plan.md`**：網路路由架構重構計畫
- **`docs/shortcuts.md`**：鍵盤快速鍵速查表，前端 Home 頁面可透過 Shortcuts 按鈕查看
- **`docs/troubleshooting-login-500.md`**：MongoDB 連線 500 錯誤 SOP
- **`docs/frontend-rendering-optimization.md`**：前端渲染邏輯與效能優化詳解（元件樹、播放管線、Redux 配置、memo 策略、區塊索引語意、duration 溢出防護）
- **`docs/ui-design-plan.md`**：UI 設計系統的診斷、六項拍板決策與施工回顧（token 層、無彩色原則、按鈕階層、時間刻度尺）

### 後端管理腳本
- **`backend/mongo-backup.sh`**：MongoDB 自動備份主腳本
- **`backend/mongo-restore.sh`**：資料還原輔助腳本
- **`backend/setup-cron.sh`**：crontab 定時備份設定腳本
- **`backend/BACKUP_README.md`**：備份系統完整使用說明
- **`backend/SHELL_SCRIPT_GUIDE.md`**：Shell 腳本語法教學（適合 C++ 開發者）

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

### CI 與部署（`.github/workflows/`）

| 檔案 | 什麼時候跑 | 做什麼 |
|---|---|---|
| `ci.yml` | 每個 PR、每次推上 main / dev | 前端 lint + 單元測試 + bundle 預算、瀏覽器驗收（e2e + 版面稽核）、後端 ruff + pytest、Docker 映像建置與兩份 compose 設定 |
| `deploy.yml` | 推上 main，或在 Actions 頁面手動觸發 | Tailscale → SSH 進伺服器 → `run-deploy.sh` → 確認後端有回應 |

⚠️ **每一項檢查都必須是真的會擋下來的，不要加 `continue-on-error`。** 前身
`pr-checks.yml` 有一半的步驟掛著它：ESLint 在沒有設定檔的情況下每次都失敗、Docker
建置壞了也顯示綠勾、後端從來沒跑過測試。綠勾只代表「前端單元測試過了」，而大家以為
每一項都有人在守。要加一項「參考用」的檢查，就不要把它放進 CI。

分支保護只需要把 **「CI 結果」** 設成必須通過——它彙整其他所有 job，之後新增或
改名 job 不必回去改保護規則。

lint 刻意只抓「幾乎一定是 bug」的東西（規則與理由分別寫在
`frontend/eslint.config.mjs` 與 `backend/pyproject.toml` 的 `[tool.ruff.lint]`）。
不開格式類規則：`main.py` 混用 tab 與空白，為了排版改整份檔案會讓每一條還開著的
分支都衝突。`react-hooks` 也沒用 recommended——v7 起它包含 React Compiler 的規則，
會把 Timeline 拖曳時直接寫 DOM 的零 re-render 路徑標成錯誤。

⚠️ **`run-deploy.sh` 在動到任何東西之前先檢查 `AUTH_SECRET` 與靜態檔案目錄的寫入
權限。** 兩者都曾經在部署做到一半才失敗（舊檔案刪了、新檔案複製不進去；或容器停了
卻起不來），站就一直停著。部署帳號（`SSH_USERNAME`）必須是
`/usr/share/nginx/html/lightdance` 的擁有者。

⚠️ Node 的大版本在四個地方要一致：`ci.yml`、`frontend/Dockerfile`、
`docker-compose.dev.yml`、`run-deploy.sh`。CI 測的必須是實際部署的那一版。

### 前端驗收（瀏覽器，不需要後端）

單元測試（`npm test`）跑在 jsdom 上，測不到真實瀏覽器的鍵盤事件序列與版面
重疊。前端有兩支 Playwright 腳本補這一段，`/api/**` 全部攔截回假資料，
所以**後端不用跑**：

```bash
cd frontend
npm run dev            # 另一個終端機
npm run e2e            # 61 項：放色 / 選取 / 框選 / 剪下 / undo / 快捷鍵 /
                       #        重新整理 / 拖曳 resize / 多段一起搬 / 頻閃 /
                       #        刻度尺 / 倍速 / 波形 / 道具 / 調色盤 /
                       #        工作集 / 行高 / 播放清單 / Output / /edit /
                       #        lazy 路由打得開 / 節拍格線 / 建立帳號
npm run audit:layout   # 5 項：控制項被蓋住 / 元素溢出容器 / 提示或標籤被裁掉或折行 /
                       #      成對元素沒對齊（含軌名列↔時間軸逐列）/
                       #      各塊邊緣與各排內容左緣沒對齊
npm run audit:bundle   # 初始 JS 的大小預算（不需要 dev server，自己跑一次 build）
```

兩支都會把截圖存在 `frontend/e2e/shots/`。動過 CSS、版面或快捷鍵之後請跑一次
——它們抓到過 jsdom 測試全綠但實際完全不能用的問題（Ctrl+數字被防彈跳吃掉、
Edit/Logout 被橫幅蓋住、舞者開關蓋掉 12 個光衣部位、按鈕階層被 Bootstrap 的
`.btn` 蓋掉、17 則提示有 12 則被 `overflow` 裁光）。

⚠️ 若出現 `編輯器一直載入不了` / `一直被彈回首頁`，**先重開 `npm run dev` 再判斷**。
連續改一堆 CSS 之後 vite 的 HMR 狀態會累積到 `/home` 載不起來，這是開發伺服器的
問題不是程式碼的問題（重開後同一份程式碼就全過）。

### 設計系統（2026-08-12 起）

**顏色只能定義在 `frontend/src/styles/tokens.css`，其他地方一律 `var()`。**
`styles/__tests__/tokens.test.js` 會掃描所有 CSS 把違規的抓出來（目前 0 處）。

核心原則是**編輯器介面無彩色** —— 畫面上唯一飽和的顏色是使用者的燈光資料，
狀態靠亮度與圖示表達，不靠色相。這樣色塊和光衣才會自己跳出來。

| 檔案 | 內容 |
|---|---|
| `styles/tokens.css` | 42 個 token：背景 5 階、文字 4 階、邊框、選取 ring、光衣、波形、圓角 3 階、字級 6 階、間距 |
| `styles/buttons.css` | 按鈕四階層 `.ld-btn--primary / secondary / ghost / danger` |
| `styles/tooltip.css` | 提示的唯一定義：自我置中、寬度由內容決定、`:hover > .tooltip` 顯示 |

⚠️ 按鈕的類別前綴是 **`ld-`** 而不是 `.btn` —— Bootstrap 也用 `.btn`，
而且比它晚載入，撞名會讓四個階層整組失效。

改視覺時只動 token 的值，不要回頭在元件的 CSS 裡寫死顏色。入口頁
（Welcome / Dashboard）保留自己的品牌色，但一樣收成各自的區域 token。

**欄寬只定義在兩個地方**：上半部在 `pages/Home.css` 的 `.homepage`
（`--page-inset` / `--palette-w`），下半部在 `ControlPanel.css` 的 `.control-panel`
（`--gutter-w` 左側軌名欄寬、`--row-inset` 每一排內容的左內縮）。

這些數字先前散在四個 CSS 檔各寫各的，實測出過三種對不齊：上半部右緣停 1427 而
下半部停 1595；三排的內容左緣是 12 / 6 / 1；軌名欄 15%（240px）而播放器從 235px
開始，兩者重疊 5px。版面稽核的第五項同時守容器邊緣與各排的內容左緣——後者用
容器比較是抓不到的，三排的容器都從 0 開始，差別在各自的內縮。

**光衣的幾何在 `config/armorShapes.js`**，圖形與選取高亮吃同一組座標（先前兩份
各寫一遍，鞋子的高亮框比鞋子高 10px）。圓角由短邊推導、不逐個手填，
`viewBox` 收緊到圖形的實際範圍。點某個部位請用 `data-part` 指名，
不要用「第 N 個有 fill 的元素」——帽子與領帶各由兩個形狀組成。

完整的設計決策與施工回顧見 `docs/ui-design-plan.md`。

### 工作集（軌道組合）

154 條時間軸不可能同時擺在畫面上，所以軌道一直由使用者自己挑。**那組挑選現在
是具名的、存得起來、可以一鍵切換**——`utils/worksets.js` 是形狀與不變式的
唯一定義處，`hooks/useWorksets.js` 是唯一的讀取入口。

寫入仍然走既有的 `updateShowPart(tracks)`：payload 形狀沒變，只是 reducer 把它
寫進**目前那一組**。加軌、移除、上下移、套用選取四個呼叫端因此一行都沒改。

⚠️ 讀取一律用 `useActiveTracks()` / `useWorksets()`，不要自己去讀
`state.profiles.worksets`。「目前是哪一組」必須只有一個答案，否則軌名列與
Timeline 有機會顯示不同組——而且畫面看起來都正常，只是點某一軌會編到別條。

兩個不變式由 `worksets.js` 保證：`sets` 至少留一組（刪到剩一組就不准再刪，
沒有工作集的話畫面上一條軌道都沒有），`activeId` 永遠指得到東西（指不到時
退回第一組而不是回傳 null）。舊的 `showPart` 由 persist 的 outbound transform
收成「未命名」那一組，靠形狀辨認、不看版本號。

### 道具就掛在人旁邊

飾品燈原本列在右側一個獨立的「裝備編輯」側欄，離它所屬的舞者好幾百像素遠——
播放的時候看不出「這位舞者的刀亮了」。現在它們畫在**同一張光衣卡片裡、與人並排**
（`Armor.jsx` 的 `.armor-props`），顏色和光衣一樣走 `getColorAt(segments, time)`，
播放時整個人連同手上的東西一起亮。

身體部位一直都能在光衣上點，所以右側不需要再列一份部位清單；右欄現在只剩調色盤
（`--palette-w: 200px`，先前「調色盤 168 + 飾品側欄 200」共 376px）。

⚠️ **光衣卡片的寬度是先分好的**（`.personBackGround { flex: 1 1 0 }`），圖形再在
裡面等比縮放。先前卡片寬度由 SVG 的固有比例撐出來，人與道具並排之後那條路走不通
——SVG 在 flex row 裡沒有固有寬度，卡片沒有確定寬度時它不是塌成一條線就是溢出到
卡片外面（兩種都實測過）。`.armor-figure` 的 `min-width: 0` 也不能拿掉，
flex 項目的預設最小寬度是內容寬，少了它道具一多就會把圖形推出去。

### 調色盤

形狀與不變式在 **`utils/palette.js`**，兩份清單長得像但語意相反：

| | 最愛（`favoriteColor`） | 最近（`recentColors`） |
|---|---|---|
| 誰決定內容 | 使用者明確存的 | reducer 自動記的 |
| 空格 | `null`（虛線框 + `+`） | 不會有，不夠就是短的 |
| 順序 | 存在哪格就在哪格（快捷鍵 1–6 靠這個） | 最新的在最前面 |

⚠️ **點最愛色的預設行為是「拿出來用」，不是覆蓋。** 舊版預設是覆蓋（而且切換
開關長得像一支連續值的滑桿），點一格存好的顏色就把它蓋掉了——破壞性的操作不能
當預設值。空格則不看模式一律是「存」：空的格子沒有東西可以拿出來用，沒有歧義。

「最近」記在 **reducer 的 `UPDATECHOSENCOLOR`**，不是在調色盤元件裡——選色的入口
有五個（調色器、HEX 欄位、最愛色、時間軸取色、亮度滑桿），每個各記一次遲早會漏掉
第六個。去重只比色相不比亮度，否則拉一次亮度滑桿就會把清單塞滿同一個顏色的十幾種
亮度（每格一次 dispatch）。

⚠️ **空格是 `null`，不能拿白色當哨兵**——白色是最常用的燈色之一，用它當空格的話
「還沒存過」與「存了白色」在畫面上完全一樣。既有資料裡的白色原樣保留。

快捷鍵 `1`–`6` / `Shift+1`–`6` 的鍵位由 `FAVORITE_SLOTS` 推導。先前寫死 1–8 並用
二維座標換算（`favoriteColor[row % rows][col]`），色票收成一列六格之後 7 與 8 會
**繞回第 1、2 格**，而畫面上沒有任何東西顯示這件事。

### 兩欄逐列對齊

左側軌名列與右側時間軸的**每一列必須落在同一條水平線上**。這是整份版面裡最難
用肉眼確定的一項：兩邊各自看起來都很整齊、分隔線也等距，但整欄可能一起偏移。
偏了的後果是捲到下面時軌名對到隔壁那條軌——使用者以為在編第 5 軌，其實在編第 6 軌。

兩欄上方擋著的東西不一樣：右邊有工具列與時間刻度尺，左邊只有五顆工具鈕。
CSS 用 `--ruler-h` 讓出一段當預設值，但那只在工具列排成一行時才對——1280 寬時
工具列會換兩行，實測整欄差 49px。所以 `ControlPanel` 會**量第一列的落差再補上去**
（`align()` + ResizeObserver）。

⚠️ 量的是「第一列的落差」而不是「容器的落差」：前者會收斂（補上 delta 之後左側
第一列就落在右側第一列上，下一次量到 0），而容器的 top 不受自己的 padding 影響，
拿它當基準會一路往下加。

版面稽核逐列比對這件事（容許 2px 的邊框捨入）。

### 軌道行高

**高度是像素，不是百分比**（`utils/tracks.js`）。舊版是 `100 / 軌道數 %`，
超過 7 條之後改成寫死的 14%——高度由軌道數決定，加一條軌就把其他每一條壓矮，
使用者說了不算。而且左側軌名欄與右側時間軸各自算自己的百分比，兩邊容器只要
有一點高度差，捲到下面時軌名就會對到隔壁那條軌（畫面上完全看不出來）。

全域行高在 `state.profiles.rowHeight`，逐軌覆寫在 `track.height`
（`trackHeight(track, rowHeight)` 是唯一的取值方式）。低於 `COMPACT_ROW_H`
時軌名列收起上下移與刪除——那兩顆疊起來要 56px，硬留著會變成畫得出來但點不到。

逐軌把手拖曳時只改自己的 DOM，**放開才 dispatch 一次**：每格像素都寫 redux
的話 154 條 Timeline 會跟著重繪，手感會變成一格一格跳。

### 頻閃是 metadata，不是一堆小色塊

`seg.effect = {type:'blink', period}`，語意與展開規則在
`utils/segments/effects.js`。展開只發生在**兩個地方**：壓平成韌體格式
（`segmentsToKeyframes`）與播放預覽取色（`getColorAt`）。畫面上它一直是
**一個**可拖曳、可 resize、可改色的色塊，左下角有一排短豎線當記號。

舊版是破壞性的：套下去之後色塊就被換成 N 個小色塊，於是想整段挪半拍要把
N 個全部選起來（它們之間有空隙，`Shift+click` 連選會斷）、想把間隔從 250 改成
200 只能刪掉重放、想改顏色要逐塊改。

⚠️ **預覽取色不要展開整條時間軸**。播放時每一格都會問一次 `getColorAt`，
展開會在每一幀配置 N 個物件。用 `blinkColorAt` 直接算相位。

⚠️ **顏色的基本運算在 `utils/segments/rgba.js`，不在 `color.js`。**
`effects.js` 需要顏色插值，而 `color.js` 需要問 `effects.js`「這一格是亮是滅」
——兩邊互相 import 在 ES module 下跑得起來（都只在函式裡呼叫），但那是靠時序
矇混過去的。共同的下層讓依賴方向永遠是單向的。`color.js` 原樣 re-export，
既有的 import 路徑不必改。

展開後的形狀與舊版逐格相同（有等價測試守著），所以韌體收到的東西沒變。

### 音訊引擎

所有 Web Audio 的狀態都在 `utils/audio/engine.js`。它**刻意不是 hook 也不認得
React**——這樣才能拿假的 AudioContext 在 jsdom 裡驗排程，而「你把這個 source
排在第幾秒」在真瀏覽器裡問不到。

⚠️ **`isPlaying` 一變就驅動引擎，不要只掛在 `handlePlayPause` 上。** 設定
`isPlaying` 的地方有三個（播放鍵自己 `setIsPlaying(p => !p)`、空白鍵、整場播完
的回呼），只掛其中一條路徑的話按鈕會變成「畫面切成暫停圖示但音樂照播」。

⚠️ **載入不能等 `resume()`。** 沒有使用者手勢時 Chrome 的 `resume()` promise
會一直 pending（不是 reject，是永遠不 settle），把它放進載入路徑會讓 duration
永遠出不來、波形永遠空白。`decodeAudioData` 在 suspended 的 context 上照樣能用，
所以 `getContext()`（只建立）與 `ensureRunning()`（建立 + resume）是分開的。

⚠️ **接縫一次排好，不要等 `onended` 再啟動下一首**——後者一定有縫。代價是
變速與 seek 都必須整批重排（已排好的 `when` 是用舊速率/舊起點算的）。

⚠️ 結束通知只掛在**最後一個** clip 上，否則每首歌播完都會通知一次，
播放鍵會在接縫處自己跳掉。

**行為改變**：播放中 seek 現在會**繼續播**（引擎重排），不再變成暫停。

### 衍生資料不要繞 Redux

**時間軸的色塊（`timelineBlocks`）是元件自己 `useMemo` 算的。**

舊版是 `buildTimelineBlocks` 算完 dispatch 進 store，再 `useSelector` 讀回來
——寫的人和讀的人是**同一個元件**，中間沒有第三者。那趟往返在記憶體上只有
0.2MB（實測真實光表），但每次編輯多一個 dispatch，而**一次 dispatch 會通知
整個 store 的訂閱者**：154 條 Timeline 每條約六個 selector，等於每編輯一格
就重跑約九百次 selector；載入一份光表更是連續 154 次，reducer 那邊還要逐次
展開兩層物件。

⚠️ **Timeline 裡不要再出現 `<canvas>` 相關的 state。** 曾經有
`canvasRef` / `canvasWidth` / `canvasHeight` 三個 state 加兩個 effect，
而這個元件的 JSX 裡**從來沒有 `<canvas>`**（色塊是 `<div>` 畫的），ref 永遠
是 null。死掉還在花錢：那個 effect 掛在 `zoomValue` 上，所以每動一次縮放，
154 條 Timeline 各多一次無謂的重繪——而拖縮放滑桿會連續產生很多次變更。

### 記憶體：解碼後的音訊才是大頭

⚠️ **解碼後的音訊是這個編輯器最大的記憶體項目，比光表大兩個數量級。**
它在記憶體裡是 Float32：`時長 × 取樣率 × 聲道 × 4 bytes`，立體聲 44.1kHz
**每分鐘約 17MB**。`musicsrc/` 那十一首全部試聽過就是 **800MB**。

`engine.keepOnly(files)` 依「現在的播放清單」淘汰，呼叫點在 `waveform.jsx`
的載入 effect 開頭。舊版只有 `dispose()`（離開編輯器）才清，所以同一次工作
階段裡點開過的每一首都一直留著——低配機器上會把整個分頁拖到卡頓，而畫面上
完全看不出來，只覺得越用越卡。

⚠️ **淘汰要在 early return 之前做。** 移除最後一首會走到「清單空了」那個
早退分支，而那正是最該回收的時刻——寫在載入成功之後的話，「清空播放清單」
反而什麼都沒放掉。

⚠️ **解碼到一半被淘汰的不要塞回快取。** 只從 `inflight` 移除是不夠的：
那個 promise 還在跑，解完照樣 `buffers.set()`，剛丟掉的東西自己長回來
——回收看起來有做，記憶體卻沒有降。用「我還是登記中的那一個嗎」判斷。

峰值走同一個 `wanted`（一首約 0.8MB，小二十倍但同一個道理），而且型別是
**`Float32Array`**：峰值只是 0..1 的振幅，一般陣列每格 8 bytes，20 萬個桶
就多花一半。`utils/audio/peaks.js` 的 `isPeaks` 同時認得兩種容器——
`Array.isArray` 對 TypedArray 回傳 false，漏改一個守衛就會靜靜地退化成
「沒有峰值」而畫出空白波形。persist 的 outbound 也不再轉回一般陣列。

### 播放清單（多曲銜接）

一場表演是五、六首歌接續播放，所以音訊時間軸是一串 clip。形狀與不變式在
**`utils/audio/clips.js`**（唯一定義處），讀取一律走 **`hooks/useAudioClips.js`**。

**使用者排的是順序，不是時間點。** 每次動到清單就 `resequence()` 重算一次
首尾相接的位置，`start`/`end` 是推導出來的——換掉第三首時，後面每一首的位置
自己跟著移，不必要求使用者手動改一遍。

⚠️ **接縫的實際長度是逐條算的，不是直接用 `overlapMs`。** 兩首各自要留下一段
沒被疊到的部分（`min(overlapMs, 前一首 − 一格, 後一首 − 一格)`），否則短的那一首
會整首被蓋在重疊區裡，三首接在一起時甚至排得出「第三首比第二首還早開始」。
`fadeIn`/`fadeOut` 記的是這個**實際值**，位置與包絡由同一個數字推導。

⚠️ **`music_filename` 是 clip 清單的投影，不是另一份真相。** 後端的 raw_data、
舊的本地備份、Dashboard 的清單都認得那個欄位，所以 reducer 讓它永遠等於第一首
——**空清單投影出來是空字串**。留著舊檔名的話讀取端會把「沒有 clip 但有
music_filename」判成還沒遷移的舊單曲專案而生一個 clip 回來，於是**移除最後一首
之後它自己長回來**（只移除到剩一首的測試看不到這件事）。
反過來，舊的單曲入口 `updateMusicFilename` 會換掉整張清單，但**第一首已經是它時
不動**——多曲專案載入時 envelope 的 `music_filename` 就是第一首，不擋的話先
dispatch 的那一下會把後面幾首丟掉。

⚠️ **長度要解碼才知道，所以位置是載入之後才確定的。** 加一首歌的當下只有檔名，
`createClip` 先給一格佔位，`waveform.jsx` 解碼完用 `applyMeasuredLengths` 補回
store。那個函式在沒有任何一條改變時回傳**原 reference**——不擋住的話
「dispatch → store 變 → 重新載入 → 再 dispatch」會轉成無窮迴圈。

⚠️ **遷移出來的 clip 要有決定性的 id。** `useAudioClips` 是每個呼叫端各跑一次的
（波形、播放清單、接縫標記三個），隨機 id 會讓同一個舊專案在三個元件眼裡是三個
不同的 clip——三邊畫面都正常，只是對「這是哪一首」沒有共識，而那正是這個 hook
要消滅的東西。舊模型一場表演只有一首歌，所以檔名就是身分（`legacy:<檔名>`）。

⚠️ **接縫滑桿拖曳中不 dispatch**（和逐軌行高把手同一個做法）。改接縫會讓整張
清單重排、波形重新拼一次，而 `stitchPeaks` 要跑 20 萬個桶乘上歌數——每格像素都
dispatch 等於每秒做幾十次那個運算。

⚠️ **`engine.setClips` 播放中會停下來，但停的是引擎自己的旗標**，React 的
`isPlaying` 不會跟著變（會變成「按鈕顯示播放中但沒有聲音」）。載入 effect 只要
重跑就會呼叫它，所以先用 `sameClipTimeline` 擋掉沒有內容變化的那些。

⚠️ **store 存檔名，引擎收 URL。** 換一個部署、換一個使用者，同一份光表的音樂還是
同幾首歌，而網址前綴會變。解析在 `waveform.jsx` 的 `useResolvedClips`，量到的
長度寫回去時要換回檔名版。

波形畫的是**整場**：每首歌的峰值逐檔快取，再由 `stitchPeaks` 依位置拼成一條
（重疊處取兩首的較大值——那段時間兩首確實都在響）。桶的範圍由起點與終點各自
換算，不是「起點 + 長度換算出來的桶數」，後者會在最右邊留下沒填到的桶。

UI 是可收合的（`components/audio/Playlist.jsx`）：排燈時幾乎不會動歌單，
常駐六列等於用最貴的版面放最少用的功能。點面板外面會收起來，而那個 listener
必須掛在 **capture 階段**——`Timeline` 與 `MarqueeSelect` 的 mousedown 都會
`stopPropagation()`，而時間軸正好是面板蓋住的那塊區域。時間軸上的接縫由 `ClipMarkers` 標出來，
和 `TimeRuler` / `ShiftMarkers` 同一個座標系。

### 路由層 lazy 與大小預算

開編輯器要下載多少 JS 是個**只會往上爬**的數字：每個人加一個 import 都只多幾十
KB，沒有人會為了幾十 KB 反對一個功能。實測爬到 1817 KB（gzip 547 KB）時，
其中 **746 KB 是 `/model` 那一頁的 `three` 與 `@google/model-viewer`**——
排燈的人從頭到尾不會打開那一頁。另外 `Home.jsx` 還有一行完全沒用到的
`import { set } from "lodash"`（72 KB）。

分割線畫在**路由**上（`App.jsx` 的 `lazy`），不是靠 `manualChunks` 手動分組：
路由本來就是「使用者現在需要哪些程式碼」的天然邊界，不必維護一份會過期的清單。
`ShortcutModal` 也是 lazy 的（它帶著整套 markdown 轉譯器約 155 KB），而且
**沒打開就完全不 render**——只寫 `lazy` 但無條件 render 的話 chunk 照樣會被抓。

⚠️ **`Home` 不要 lazy。** 它是唯一的熱路徑，切出去只會讓每次進編輯器多一趟
往返。分割的目的是把用不到的移走，不是把所有東西都切開。

結果：初始 chunk 1817 → **475 KB**（gzip 547 → 156 KB）。`npm run audit:bundle`
守著這個數字（超過就 exit 1，實測把 `/model` 改回 eager 會被抓到）。

**還沒處理**：`dist/` 有 **91 MB 的 mp3**（`components/audio/musicsrc/` 十一首
示範曲，其中一首是商業歌曲，而這個 repo 是 public fork）。它們不進 JS chunk、
不影響載入速度，只有選到才會抓，但每次部署都要搬 91 MB。要拿掉的話音樂改走
後端的 `/music`（`localMusicMap` 是「不需後端也能播」的開發便利，不是產品需求）。

### 節拍格線

速度**掛在歌上，不掛在時間上**（`clip.bpm` / `clip.beatAnchor` / `clip.beatsPerBar`，
運算在 `utils/audio/tempo.js`）。使用者拍板同一個音檔不變速，所以一首歌一個速度；
真的遇到 medley 就把那個檔案切成兩個 clip。

⚠️ **`beatAnchor` 是相對於這個 clip 的**，不是表演時間的絕對毫秒。歌單可以重排，
絕對時間的速度表在使用者把第三首和第四首對調的瞬間就會整片對到別首歌——而畫面上
不會有任何異常，波形照畫、格線照畫，只是每一條都錯了。

⚠️ **50ms 網格才是真相，格線只是輔助線。** 128 BPM 一拍 468.75ms 不是 50 的倍數，
所以「一拍長」的色塊不是固定的格數（拍點落在 0、450、950、1400…，間隔在 9 格和
10 格之間跳）。任何「每拍重複一次」的功能都必須**從 `beatLines` 逐點取位置**，
不能拿一個固定間隔一直加——加法會累積誤差，八小節之後偏掉半格以上。
格線本身刻意**不**四捨五入到網格：它畫的是音樂真正的位置，而使用者是照著線在對拍的。

⚠️ **每一條線要帶 `clipId`。** 接縫重疊時兩首歌可能在同一毫秒各有一條線，只用
時間當 React key 的話不只是警告——實測會**留下上一個狀態的節點**（多出 5 條線、
小節線多 2 條），畫面上看起來只是「線好像有點多」。

密度由「相鄰兩條至少 `MIN_GAP_PX`」推導（`pickLevel`），最細到四分之一拍
（三連音略過），連小節線都擠在一起時整片不畫。`BeatGrid` 墊在 `.main-controlPanel`
最底層，底色因此從 `.timeline-container` 搬上去了——格線畫在不透明的軌道底色下面
會完全看不到，畫在上面又會蓋住色塊。

**吸附還沒做**：`gestures.js` 目前只有 `roundToTick` 一個量化器。要加的話必須是
它的一個參數而不是另一條路徑，兩份量化邏輯各寫一遍就會回到「拖到底了但放開後又
跳一點」那類錯位。

### 提示（tooltip）與 Bootstrap 撞名

⚠️ **`.tooltip` 的規則寫成 `.tooltip.tooltip`，那個重複是故意的。** Bootstrap 也
定義 `.tooltip`（`white-space: normal`、`text-align: start`、`opacity: 0`）而且比
`styles/tooltip.css` 晚載入——權重相同時後到的贏，所以那份檔案的
`white-space: nowrap` **從來沒有生效過**。後果是每一則提示都照宿主的寬度折行：
34px 的按鈕配 8 個字實測折成 48×96 的一長條。它「有出現」，所以沒有人覺得壞掉。
和 `.btn` 撞名是同一個病因。

靠邊的規則用**後代選擇器**（`.lefttool-container .tooltip`），不要用
`> *:first-child >`——`.lefttool-container` 底下多包了一層 `.leftupcorner`，
舊的寫法從來沒對上過。巢狀深度會隨重構改變，「這一欄貼著畫面左緣」才是真正的依據。

版面稽核第三項會量提示有沒有被折行（拿實際高度跟行高比，不寫死像素）。

### 播放時鐘

「現在播到第幾毫秒」只有一份算法（`utils/audio/clock.js`）：

```
position(t) = (t - anchor) × rate × 1000
```

`anchor` 是「若一路以目前速率播放，音檔位置 0 會落在哪個 context 時間」。
開播、seek、變速三個時機都用 `anchorFor()` 算錨點。

⚠️ 先前這件事寫在兩個地方而且**慣例不同**：開播時是 `now - offset`（少除一個
rate），變速時是 `now - cur/rate`（正確）。前者代進公式得到
`(Δt + offset) × rate` 而不是 `offset + Δt × rate`——只有 rate = 1 或
offset = 0 時才相等。也就是**從中間某處用非 1 倍速播放，位置就是錯的**，
而 `currentTime` 是光衣預覽取色的依據，所以變速對拍時燈跟音樂對不上。

⚠️ **`pendingSeekRef` 只在真的打斷播放時才舉起來。** 消耗它的只有
「isPlaying 轉 false」那個 effect，暫停時 seek 不會讓 isPlaying 變動，
旗標會一直舉著到下一次暫停才被消耗，把真實位置蓋回上一次點的地方。

兩個都是 e2e 加「2 倍速從第 15 秒播」那一項時抓到的。

### 波形的峰值運算

在 `utils/audio/peaks.js`。降取樣分兩層：解碼後一次（整首歌 → 20 萬個桶，
存進 redux，跟縮放無關），每次重繪一次（取出捲到的那一段 → 降到畫得下的柱數）。

⚠️ **每個除法都要處理分母為 0。** 靜音的音檔、還沒量到寬度的容器、捲過頭的
捲動位置都會讓某個分母變成 0，而 `NaN` 傳進 `fillRect` **不會報錯，只是什麼都
不畫**——波形就這樣消失，console 一片乾淨。這種安靜的失敗比丟例外難查得多。

⚠️ **每一幀重繪時會再正規化一次**（`peaksForViewport` 最後那步）。不重新
正規化的話，整首歌最大聲的地方決定所有段落的高度，放大看某個小聲的段落
會是一條貼著中線的細線。

e2e 直接數畫布上有多少個不透明像素——波形整片空白時其他每一項都還是會過
（duration 是從解碼結果來的，跟畫不畫得出來無關）。

### 選取跨軌，操作也跨軌

框選一次就能選到七位舞者身上的同一個樂句。**選了幾條就編幾條**——這件事現在
沒有例外，而先前幾乎每個操作都在第一筆選取那一條就收斂了：

```js
const activePart = multiSelectedBlocks[0];   // 只看第一筆
```

選了七條只有一條會動，**不報錯、沒提示**，畫面上只是「怎麼其他六條沒變」。

| 層 | 檔案 | 內容 |
|---|---|---|
| 選取 → 逐軌 | `utils/selection.js` 的 `groupSelectionsByPart` | 跨軌操作的唯一入口 |
| 逐軌 → 光表 | `utils/segments/table.js` | `updateParts` / `mapSelectedParts` / `partsOfSelection`，維持結構共享 |
| 剪貼簿 | `utils/segments/clipboard.js` | 一個矩形（區間 × 幾條軌）與貼上的落點 |
| 拖曳 | `gestures.js` 的 `movableRangeAcross` / `moveAcross` | 整批共用同一個位移量 |
| 換軌 | `table.js` 的 `trackMoveRange` / `moveSegmentsToTracks` | 把段搬到別條軌 |

⚠️ **`groupSelectionsByPart` 要保留 `segmentId` 是 `null` 的選取**（收成一個空
集合的組）。`multiSelectedBlocks` 同時表達「選了哪些色塊」與「目前在編哪一條
軌」——點了軌道但還沒點到色塊時就是 `null`。濾掉的話「在播放頭放一個最愛色」
與「跳到下一個時間點」會變成什麼都不做，因為它們要的是**部位**不是色塊。

⚠️ **兩種「往哪一軌」的算法刻意不同**，不要統一：

| | 平移量 | 為什麼 |
|---|---|---|
| 貼上 | `(舞者, 部位)` 二維座標差 | 剪貼簿會跨越工作集的切換，而工作集隨時可以重排。用列號的話同一份剪貼簿在切換工作集之後會貼到完全不同的部位，而畫面上一切正常，只是燈亮錯人 |
| 拖曳換軌 | **可見軌道清單的列數差** | 使用者是拖到眼睛看到的那一列上。從按下到放開都在同一個畫面上，沒有持久化的問題 |

⚠️ **同軌拖曳與換軌拖曳的水平界線也不同。** 同軌撞到鄰居就停
（`movableRange`）；換軌是**覆蓋**（與貼上同一套碰撞規則），所以唯一的限制是
不要跑出表演的時間範圍（`trackMoveRange`）。跨列的那一瞬間要重算一次像素邊界。

⚠️ **整批共用同一個位移量，不要讓每一條各自再夾一次。** 那會讓限制最緊的那條
停下而其他條繼續走，樂句就散開了——而畫面上只是「怎麼有幾條沒跟上」。

⚠️ **換軌時先全部移除、再全部插入。** 來源與目標會重疊（兩條一起往下拖一格
時，第二條同時是第一條的目標與它自己的來源）。邊移邊插的話，後處理的那一條會
把前一條剛搬進來的東西當成「落點上原本就有的」再裁一次。

⚠️ **搬過去的段 `id` 保持原樣**（貼上才換新 id）。它已經不在來源那一條上不會
撞名，而且選取可以直接跟著走——換 id 的話拖完選取就掉了。

⚠️ **Timeline 不能為了跨軌而訂閱整張表**（那會讓 154 個實例被每一次編輯喚醒，
逐部位訂閱正是為了避免這件事）。拖曳需要的是「按下去那一刻」與「放開時」，
兩者都是事件當下才需要，所以走 `useTableCommit()`——只拿 `store` 與 `dispatch`，
一個 `useSelector` 都沒有。

別條軌上的色塊 DOM 不在事件上、也不在自己的 `blockDomRefs` 裡，所以預覽是靠
`data-segment-id` 跟畫面要；「游標停在哪一列」則是 `elementFromPoint` +
`data-row-index`（逐軌高度可以各自調整，自己累加算一遍等於把版面邏輯抄第二份）。
被拖著的色塊在拖曳期間 `pointer-events: none`，否則問到的是它自己。

**亮度階梯刻意維持單選**：它是「從這一段開始往後逐段遞增」，起點必須是唯一的。

### 貼上的滑鼠預覽

複製模式下**游標指到哪，落點的虛線框就畫在哪，按左鍵就貼在框的位置**
（`components/audio/PastePreview.jsx`）。舊流程是「先點一個目標色塊選起來，
再按 Ctrl+V」——想貼到空白處沒有東西可以點，而且按下去之前完全看不到會貼到哪
（剪貼簿跨軌之後更明顯，落點是由錨點的座標差推出來的）。Ctrl+V 原樣保留。

⚠️ **預覽與實際落點必須是同一份運算**（`clipboard.js`）。`landingSpans` 與
`planPaste` 各算一遍的話遲早會不一致，而不一致的症狀是「框畫在 A、貼下去在
B」——使用者按下去之前明明看到框在那裡。有測試直接比對兩者。

⚠️ **`landingSpans` 刻意不收光表**：滑鼠每動一格都要算一次，而 `planPaste`
會對每一條目標軌跑 `clearRange` 並產生新陣列。代價是它不知道「這個部位存不
存在」，那由畫預覽的人決定（找不到對應的可見軌道就收起那個框）。

⚠️ **框的數量由剪貼簿決定，位置直接寫 DOM**（和框選同一個理由）：這個容器是
154 條 Timeline 的祖先，滑鼠每動一格就 setState 會讓它們全部重算。

⚠️ **capture 階段收 mousedown**：Timeline 的 block mousedown 會
`stopPropagation`，冒泡階段收不到落在色塊上的那些點擊——而色塊正好是最常見的
貼上目標。

**跑馬燈（相位偏移）**：`target.phaseMs` 不是 0 時，落點會再多一項
「**第幾條** × phaseMs」——一個色塊貼到七位舞者身上、每位往後推 100ms，
就是一道光波沿著隊形跑過去。在這之前要做只能複製七次再一條一條推，
推完想改間隔就得全部重來。

⚠️ **「第幾條」依 `(舞者, 部位)` 排序，不是選取順序。** 框選的順序取決於使用者
從哪個角落開始拉（由下往上拉就整個反過來），而波要沿著隊形跑。

⚠️ **相位一律往後推，`phaseMs` 的正負只決定波的方向。** 直覺寫法
`名次 × phaseMs` 會讓負相位把後面幾條推到**游標之前**、甚至推到負時間被丟掉，
而預覽的夾緊只顧得到一邊。負相位改以最後一名當基準，「游標指到哪，最早的那條
就落在哪」對兩個方向都成立。

⚠️ **`phaseMs` 不要放進預覽 listener effect 的 deps。** 那會讓 listener 重掛，
而 cleanup 的 `hideAll()` 會把框全部收起來——改完間隔畫面上什麼都沒有，要再動
一次滑鼠才回來。改間隔的重畫走另一個 effect，用記下來的游標位置原地重畫。

⚠️ **提示橫幅移到畫面底部並且 `pointer-events: none`。** 舊版是 `top: 20px`
的置中膠囊，正好蓋住 header 的 Load / Edit / Logout（和先前「尚未儲存」橫幅
蓋掉 Edit/Logout 是同一個病因）。版面稽核抓不到它，因為它只在複製模式下出現。
橫幅裡的跑馬燈欄位要自己寫 `pointer-events: auto`（和光衣卡片的隱藏鈕同一個坑）。

### 選色要等使用者確定

`<input type="color">` 有兩個事件：拖過色域的**每一格**都會發 `input`，
使用者確定（關掉原生對話框）才發 `change`。而 React 的 `onChange` 綁的是前者。

⚠️ 所以舊版是「滑鼠在色盤上滑過哪裡，選取的色塊就變成哪個顏色」——而
`chosenColor` 一變就觸發 `applyColorToSelection`，於是**滑過去的每一個中間色
都寫進光表、各佔一格 undo**，選完一個顏色要按幾十次 Ctrl+Z 才回得去。
「最近使用」也會被沿途經過的色相塞滿（它只比色相不比亮度）。

修法是把那個 input 改成 **uncontrolled + 監聽原生 `change`**：拖曳期間完全
不進 React，放開才提交一次。代價是外部改色（HEX 欄位、最愛色、工具列的改色）
要用 effect 自己寫回 DOM，否則下次打開色盤顯示的還是上一個顏色。

**還沒處理**：亮度滑桿仍然是每一格像素 dispatch 一次。它在改色模式下同樣會
每格佔一格 undo，做法應該和逐軌行高把手、接縫滑桿一樣（拖曳中不 dispatch），
只是那三個地方的「拖曳中要看到什麼」各不相同。

### 時間軸縮放是幾何的，不是線性的

換算在 **`utils/zoom.js`**（`zoomIn` / `zoomOut` / `sliderToZoom` /
`zoomToSlider`）。縮放是**乘法**的：1 倍到 2 倍與 50 倍到 100 倍是同一件事
（寬度都變兩倍），所以控制項也必須是幾何級數。

舊版整條路徑都是線性的，兩個症狀同一個根因：

| | 舊版 | 現在 |
|---|---|---|
| `+` / `-` | 每次 ±0.05，1 → 100 要按 **1980 次**，而 50 倍時按一下只變 0.1% | 每次 ×÷1.25，走完全程 **21 次**，每一步的感覺一樣大 |
| 滑桿 | 線性 1..100 再套 `Math.floor`，**一個像素約等於一倍**，低倍率那端從 1 直接跳 2 | 位置與 `log(倍率)` 成正比，中點是 10 倍 |

滑桿的 `value` 是**位置**（0..1）不是倍率。加了讀數是因為幾何滑桿的中點是
10 倍而不是 50 倍——沒有數字就猜不出現在在哪。

### 舞者的隱藏與恢復

**「隱藏」在光衣卡片自己的標題列上，「叫回來」只在真的有人被隱藏時才出現。**

舊版是光衣那一列下面**再一整列** 50px 的方形開關，連同留白約 66px——而畫面上
最需要空間的正是光衣本身，且那一列在多數時候完全沒有作用（七位都顯示著，
誰都不會去點）。

⚠️ **恢復的入口不能放在被隱藏的那張卡片上。** 卡片一隱藏，長在它上面的按鈕
就跟著消失，使用者再也叫不回來——軌道的「眼睛」按鈕當初就是這樣被移除的。

⚠️ **`.dancer-hide` 一定要寫 `pointer-events: auto`。** 父層 `.dancer-label`
是 `pointer-events: none`（讓點擊穿過去選這位舞者），而那會一併關掉裡面所有
東西的命中判定——按鈕畫得出來、hover 也看得到，就是點不到。實測
`elementFromPoint` 在按鈕正中央回傳的是 `.armor-container`。

版面稽核第四項從「開關與光衣的中心對齊」改成「隱藏鈕在卡片範圍內」：
收進卡片之後對應是結構上保證的，要守的變成「有人把它改成絕對定位跑出去」。

### 對齊與分佈

三個純幾何的整理動作，運算在 **`utils/segments/arrange.js`**，入口在特效選單
（分隔線下面那三項）：起點對齊、長度統一、平均分佈。用拖曳都做得到但**做不準**
——拖曳吃 50ms 網格，肉眼對齊七條軌的起點要一條一條放大再微調。

基準一律取**選取範圍裡最早的那一段**（對齊到它的起點、長度取它的長度）。用
「第一筆選取」當基準的話，同一批選取會因為使用者從哪個角落開始框而得到不同
結果，而畫面上看不出基準換了。

⚠️ **平均分佈是逐軌的，另外兩個跨軌。** 不同軌上的段各自在自己的時間軸上，
把它們一起分佈只會全部疊在一起。所以每一條軌各自需要至少三段。

⚠️ **選取彼此重疊時整條放棄，不是讓後者蓋掉前者。** 同一條軌上兩段對齊到
同一個起點，要留哪一段？意圖本身有歧義，而靜靜吃掉一段在畫面上只是「怎麼
少了一塊」。回報哪幾條沒做並講出原因。落點與**未選取**的鄰居碰撞則照
`clearRange` 讓位，與貼上、換軌拖曳同一套。

⚠️ **對齊網格收在 `rebuild` 一個出口。** 平均分佈算出來的步長幾乎不會是 50 的
倍數，而且順序有講究：**先取整再檢查重疊**——反過來的話取整可能把兩段推成重疊，
而檢查已經過了。

⚠️ **每一段都停在原地時要回傳原陣列。** 少了這道判斷，一次沒有效果的對齊照樣
佔一格 undo，也照樣把那條軌的訂閱者全部喚醒。

### 框選

幾何在 `utils/segments/marquee.js`（純函式），事件與像素換算在
`components/audio/MarqueeSelect.jsx`。碰到色塊的**任何一部分**就選中，
不要求整段被框住——想選的通常是「這一段時間裡的東西」，而色塊長度不一。

⚠️ **時間軸上沒有真正的空白**：`buildTimelineBlocks` 讓色塊首尾相接涵蓋整條
`[0, duration)`，空隙也是一個 block（只是不帶 `segmentId`，DOM 上是
`data-gap="true"`）。所以「從空白處開始拉」實際上是從一個空隙 block 開始。
整條軌被蓋滿時沒有空隙可按，那時用 **Alt + 拖曳**。

⚠️ **拖曳結束後那一下 `click` 必須吃掉。** 每個 Timeline 都在 document 上掛了
「點到 block 以外就取消選取」的 handler，而 click 的 target 是 mousedown 與
mouseup 的**共同祖先**——跨軌框選時那是 `.timeline-container`，於是剛框好的
選取在同一個 tick 被清空。用時間戳擋，不要掛一次性 listener：mouseup 落在
視窗外時根本不會有 click，那個 listener 會留著把下一次真正的點擊吃掉。

⚠️ **Shift 加選的基準要在 mousedown 就存好**。Timeline 會在同一次 mousedown
把選取清空（點空隙 = 取消選取），等到 mouseup 再讀就只剩空的，Shift 框選會
退化成「每次都從頭選」——而畫面上只是「怎麼沒加進去」，不會有錯誤。

### 手勢（拖曳與 resize）

運算在 `utils/segments/gestures.js`，元件裡只剩像素換算與寫 DOM。

**「能移多遠」只有 `movableRange` 一份答案**：像素預覽拿它換算成像素，放開時
`moveSegments` 拿它決定最終落點。先前 Timeline 自己用像素重算一遍邊界，那正是
「拖到底了但放開後又跳一點」那類錯位的來源。最小間距與最小長度兩個常數同理，
只在那個檔案定義一次。

多選時整批共用**同一個位移量**（相對位置不變，樂句的節奏才不會跑掉），
可動範圍是每一段各自對「最近的未選取鄰居」的限制取交集。範圍**永遠包含 0**
——呼叫端可以自己傳一個大於 0 的 `gap`，而色塊允許首尾相接，那時算出來的
下界是正數；少了這道夾緊，拖 0 像素會把色塊自己彈開一格。

⚠️ **`MIN_BLOCK_GAP_MS` 是 0，不要改回 50。** 它曾經等於 `TICK_MS`，而兩者
相等會讓**最後一格永遠拖不到**：「與鄰居至少留一格」在一格對齊的網格上正好
把唯一剩下的那一步吃掉，於是隔著 50ms 的兩塊色塊，前面那塊往鄰居方向
`max` 算出來是 0——一格都推不動。使用者看到的是「拖曳被隱形的東西擋住」，
因為 50ms 在 1 倍率下只有 0.25px，而 `clearRange` 的 trim 一次普通的貼上
就會留下那麼寬的碎片。

舊值的用意是「別讓色塊不小心黏在一起」，但那個顧慮站不住腳：segment 模型
明確允許首尾相接，貼上與拖曳覆蓋本來就會產生相接的段——編輯器自己做得出
那個狀態卻不讓拖曳做。要恢復那個手感的正確做法是**吸附**（靠近時吸開，但
仍然允許使用者堅持貼齊），不是硬性下界。

邊界情況（撞到鄰居、越過 0、超過總長、被夾死、縮到最小、首尾相接、
表演長度還沒載入）在 `utils/segments/__tests__/gestures.test.js` 窮舉過。
真正的手感（幾何接線）只有 `npm run e2e` 的拖曳兩項驗得到，jsdom 量不到版面。

### 輸出前的把關：舞者沒有的部位不准亮

⚠️ **`isPartAllowed` 原本只用在「畫面上要不要讓你點」**（`ControlPanel.jsx` 與
`/edit` 的表格），輸出路徑一次都沒有引用過它。跨軌貼上把這個缺口變得踩得到：
落點是 `(舞者, 部位)` 的座標差推出來的，而唯一的檢查是「這個部位是不是一個
陣列」——光表是 7×22 的滿陣列，22 個部位全部為真。把七位舞者的 acc3 一起複製、
往下貼一格，資料就落在根本沒帶那件道具的人身上，而那種錯**完全沒有症狀**：
編輯器裡看得到色塊、上傳成功、版本清單正常，只有演出當天那盞不存在的燈不會亮。

現在有三道防線：

| 位置 | 做什麼 |
|---|---|
| `clipboard.js` 的 `planPaste` / `planOverwrite` | 落點不合法就整條丟掉，與「平移出光表範圍」同一套處理 |
| `table.js` 的 `moveSegmentsToTracks` | 拖曳換軌時目標不合法就整個放棄 |
| `buildPlayers.js` | 不合法的部位清掉顏色（最後一關） |

⚠️ **換軌的檢查一定要在「移除」之前。** `moveSegmentsToTracks` 是兩階段的
（先把段從來源移除、再插進目標），所以「插入那邊放棄」等於**段被刪掉了**
——來源已清空、落點沒接住，使用者看到的是「我拖了一下，色塊不見了」。

⚠️ **`buildPlayers` 清的是 RGB，不是整個欄位。** 黑色乘上任何亮度還是黑色，
留著低位元組（亮度 7 bit + 漸變旗標）就足以保證那盞燈不亮，而原本就暗的欄位
輸出**一個 bit 都不會變**。整個欄位歸零的話，每位舞者每一列的八個飾品欄位都會
從 254（黑、亮度 100%）變成 0——那是在沒有必要的情況下動到韌體契約，
golden 測試會整批變紅。

⚠️ **少貼幾條要講出來**（`applyPlans` 會跳提示）。擋掉而不講的話，畫面上只是
「怎麼少了幾條」，使用者不知道該去哪裡找。

合成 fixture 裡兩處把有顏色的飾品資料放在沒有那個部位的舞者身上（舞者 0 沒帶
道具、舞者 6 是匕首只有 14-18），那正是現在會被擋掉的資料——擺著的話那個
fixture 就測不到飾品的編碼了，所以改放到舞者 3（刀，14-21 全有），另外新增一個
專門鎖住把關行為的 fixture。真實光表的輸出沒有任何改變。

### 播放時跟著紅線捲動

判斷在 **`utils/audio/follow.js`**（`followScroll`，純函式），接線在
`waveform.jsx` 的 rAF 迴圈裡——和紅線走同一條路，每幀直接寫 DOM 不進 React。

⚠️ 舊版的捲動 effect 讀了 `currentTime`，但相依陣列是
`[zoomValue, canvasWidth, duration, scrollRef]`——**`currentTime` 不在裡面**，
所以它只在縮放改變的那一瞬間置中一次。1 倍率下看不出來（整場都在畫面上），
放大到 20 倍時紅線幾秒鐘就跑出視窗，而那正是使用者在對拍的時候。

⚠️ **不是「一直置中」。** 無條件跟隨會讓「播放中想看別的地方」變成拉走又被
拉回來，使用者根本捲不動。所以只在紅線快要離開視窗時推一頁（DAW 的做法），
平常完全不碰捲動位置。

⚠️ **使用者自己捲過就放手，下一次按播放才恢復。** 「這個 scroll 事件是誰發的」
靠比對**上一次我們自己捲到哪**，不要用布林旗標——捲動事件是非同步的而我們每
一幀都可能寫一次，旗標很容易對不上（我們寫兩次、事件只來一次，第二次就被當成
使用者捲的）。

⚠️ **已經捲到底時要回傳 `null`，不是回傳同一個數字。** 一首歌的最後幾秒紅線會
超出右緣但捲動位置已經到頂，不擋的話每一幀都寫一次 `scrollLeft`，那段時間使用者
完全捲不動畫面。

e2e 有三項互相對立的檢查（會捲 / 使用者捲走後不扯回去 / 重播恢復跟隨）：
一直置中的實作會過第一項但在第二項失敗，完全不跟的實作反過來，三項一起才描述
得出正確行為。兩個方向都做過破壞驗證。

### 編輯操作還缺的東西

按咬人的程度排。這些全部是**操作面**而不是功能面——能做的事都做得到，只是要繞路：

| 缺什麼 | 現況 | 為什麼咬人 |
|---|---|---|
| 直接拖曳移動 | 移動要先按 `M` 進模態、點一下開始追蹤、再點一下確認 | 同一個元件裡 resize 是直接操作而移動是模態的，兩種相反的互動哲學。`Timeline.jsx` 為此還要在 moveMode 時改 `overflow`、整組關掉 hover 偵測 |
| 鍵盤微調 | 方向鍵動的是**播放頭**，沒有任何一個鍵能動色塊 | 「再往後推一格」只能用滑鼠，而 1 倍率下一個像素約 30ms，推不準 |
| `Ctrl+D` / `Alt` 拖曳複製 | 重複一個樂句要 Ctrl+C、移動滑鼠、點擊 | 這是排燈最高頻的動作之一，而落點運算（`planPaste`）早就是唯一定義處了，等於一行 |
| 吸附到節拍 | 拖曳吸 50ms 網格，而拍點在 468.75ms | 格線畫出來了、使用者照著線對拍，但**永遠拖不到線上**。跑馬燈間隔也還是手打毫秒，其實想打的是「半拍」 |
| 選取的動詞 | 只有點、Shift 點（同軌）、框選 | 缺「全選這一軌」「選同色」「`Shift+W/S` 加選相鄰軌」 |
| 右鍵選單 | 全專案只有調色盤的最愛格有 `onContextMenu` | 154 條軌的時間軸上滑鼠永遠在工作的地方，而每一個動作都在畫面最上方 |
| 多段一起 resize | `resizedIdRef` 是單數 | 修齊七條軌的尾端只能繞道「長度統一」 |
| 相對亮度 | `Ctrl+1~9` 直接設 10%~90% | 調平衡時要的是「暗一點」，不是「設成 40%」 |
| 區間平移的範圍 | 三步驟精靈，而且 `executeTimeShift` 掃整張表 | 沒辦法只平移選取的那幾軌 |

⚠️ **吸附必須是 `gestures.js` 現有量化器的一個參數，不是第二條路徑。** 兩份量化邏輯
各寫一遍就會回到「拖到底了但放開後又跳一點」那類錯位——`movableRange` 成為唯一真相
當初就是為了收掉這件事。而且拍點不是 50 的倍數，吸附完還要 `roundToTick`，
兩步的順序有講究。

### 程式碼重構
1. 保持向後相容性
2. 增加適當的註解說明變更原因
3. 確保重構後符合程式碼品質標準

### 調整舞者人數或部位清單

**只需要改 `frontend/src/constants/parts.js`**（該檔案開頭有完整說明）：

- **改人數**：改 `PLAYER_COUNT` 一個數字。初始光表、`dancerVisibility`、
  ControlPanel 的全選欄位、People 渲染幾套光衣全部由它推導。
- **改部位**：在 `PARTS` 增刪一列（`{key, label, type}`）。`PART_COUNT` /
  `PART_KEYS` / `PART_LABELS` / `BODY_PART_COUNT` 都會跟著變。

有三件事**不會**自動跟上，`frontend/src/constants/__tests__/partsConfig.test.js`
會在改壞時指出是哪一項：

| 項目 | 為什麼要人工處理 |
|---|---|
| 韌體 ABI | `PART_KEYS` 的順序就是上傳每一列的欄位順序，韌體那端要同步改（`buildPlayers.golden.test.js` 會紅，那是提醒不是阻礙） |
| 光衣圖形 | 幾何在 `config/armorShapes.js`（一張表，索引 = 身體部位索引），新增部位要自己補一列座標 |
| 飾品索引 | `config/accessoryConfig.js` 的 `indices` 會隨身體部位增減而位移，要重新對過 |

改完跑 `cd frontend && npm test` 確認。

## MongoDB 的儲存方式

規則集中在 **`backend/storage.py`**（文件形狀、索引、保留策略的唯一定義處），
`main.py` 只負責「收到請求之後做什麼」。

**索引在兩個地方建立，同一份定義**：`mongo-init/01-init-data.js`（全新部署一開始
就有）與後端啟動時的 `ensure_indexes()`（既有部署補上）。這個資料庫原本**一個
索引都沒有**——每一次「載入最新版本」都是掃過該使用者的所有光表、全部載進記憶體、
排序、取第一筆，而一份密集光表的 `players` 實測 43KB。

| 集合 | 索引 | 服務哪些查詢 |
|---|---|---|
| `color` | `(user, update_time desc)` unique | 指定版本 / LATEST / 版本清單 / 計數 |
| `raw_json` | `(user, update_time desc)` unique | 同上 |
| `users` | `username` unique | 登入 |

⚠️ **`update_time` 不能改成 UTC。** 它同時是顯示字串、網址參數、**排序鍵**
（`sort` 直接對字串做，靠定寬格式讓字典序等於時間序）。改成 UTC 之後同一個瞬間
寫出來是 `04:00` 而舊資料是 `12:00`，於是**新存的版本排序上比舊的還早**，
`LATEST` 會回傳一份舊光表——而它確實回了一份合法的光表，畫面上看不出來。
真正的時間點另外存 `created_at`（BSON datetime、UTC）。

⚠️ **時間戳補到毫秒是為了唯一性，不是精度。** 連按兩下 Output 若產生兩份
`(user, update_time)` 相同的文件，`find_one` 回哪一份就沒有定義了——「載入某個
版本」變成擲骰子。毫秒只是把碰撞機率壓低，硬性保證是那個唯一索引；撞到時
`insert_show` 會回一個看得懂的錯誤而不是靜靜寫進去。

⚠️ **`color` 與 `raw_json` 必須成對存在**（`storage.insert_show`）。前者是韌體要
播的、後者是編輯器要載回來的，共用同一個 `update_time` 當版本編號。只寫成功一份
會留下「跑得動但打不開」或「打得開但跑不動」的版本，而清單上看起來完全正常。
單機 mongo 用不了交易，所以用補償：第二份失敗就把第一份刪掉。

⚠️ **驗不過就不要存。** `upload_full` 舊版在 Pydantic 驗證失敗時會走一段「保底
方案」——把**未驗證**的資料原樣塞進 `color` 然後回 200。驗證存在的唯一理由就是
擋掉那種資料。現在驗不過回 422、寫不進去回 503，前端會把原因顯示出來。

⚠️ **保留策略預設不刪任何東西。** `HISTORY_LIMIT` 環境變數大於 0 才啟用
（`storage.prune_history`）。舊版那段「超過 5 份就刪最舊的」真正刪除的那一行是
註解掉的，但**查詢還留著**——每次上傳都掃一次該使用者的全部光表然後什麼也沒做。

## Backend 管理

### MongoDB 備份系統
- 手動備份: `cd backend && ./mongo-backup.sh`
- 設定定時備份: `cd backend && ./setup-cron.sh`（每兩天凌晨 6:00）
- 互動式還原: `cd backend && ./mongo-backup.sh --restore`
- 快速還原最新備份: `cd backend && ./mongo-restore.sh --latest`
- 備份日誌: `tail -20 db/dump_data/backup.log`
- 完整說明: `backend/BACKUP_README.md`

### Docker 管理
- 開發環境啟動: `./start-dev.sh`
- 生產環境部署: `./run-deploy.sh`
- 容器狀態檢查: `docker compose -f docker-compose.dev.yml ps`
- 即時日誌: `docker compose -f docker-compose.dev.yml logs -f`
- 進入容器: `docker compose -f docker-compose.dev.yml exec <service> sh`

詳細操作請參考 `docs/backend-management.md`。

## 安全性注意事項

### 已修（2026-08-14）：權杖與密碼

⚠️ 舊版**權杖就是使用者名稱**：`/api/token` 回傳 `user.username`，而驗證是
`get_user(user_list, token)`——也就是任何人送 `Authorization: Bearer <某個帳號名>`
就通過，密碼完全不需要。帳號名稱不是秘密（它出現在網址、截圖、彼此喊人的訊息裡），
所以那不是「權杖不夠安全」，是**整條驗證等於不存在**。

現在 `backend/auth.py` 是唯一的定義處：

| | 作法 |
|---|---|
| 密碼 | bcrypt（cost 12）。舊的明文密碼**登入成功時就地換成雜湊**，不停機、不用遷移腳本、沒有人被鎖在外面 |
| 權杖 | HS256 簽章的 JWT，帶 `sub` 與 `exp`（預設 12 小時） |
| 秘鑰 | `AUTH_SECRET` 環境變數。沒設會臨時產生一把並印警告——**正式環境一定要設**，否則每次重啟大家都被登出 |
| CORS | `CORS_ORIGINS`（逗號分隔）。留空就用程式裡原本那份清單，所以不設也不會壞 |

⚠️ **不要為了方便放寬 `read_token`。** 舊版之所以是個大洞，正是因為它把
「查得到這個名字」當成驗證通過。簽章驗不過就是驗不過。

⚠️ 明文比對用 `secrets.compare_digest` 比的是 **bytes 不是 str**——後者遇到
非 ASCII 會直接丟 `TypeError`，密碼裡有中文的人會拿到 500 而不是「密碼錯誤」。
（這是 `backend/tests/test_auth.py` 抓到的，用一個中文的錯誤密碼就踩到。）

### 已修（2026-08-14）：音樂檔端點的路徑穿越

三支端點把網址裡的字串直接接進路徑（`f'{MUSIC_FILE_PATH}/{username}/{filename}'`），
而 `get_music` **連登入都不用**。實測 `/api/get_music/%2e%2e/secret.txt` 回 200
並吐出音樂根目錄外面那個檔案的內容——可以直接用的任意檔案讀取。上傳那支同理，
`file.filename` 由客戶端決定，`../../x` 會寫到目錄外面。

⚠️ **把斜線編碼起來（`..%2F`）會被路由擋掉，把點編碼起來（`%2e%2e`）不會。**
測試如果只寫 `%2F` 的版本會通過，但那是被路由擋的，等於什麼都沒驗到——
`backend/tests/test_paths.py` 開頭列了實測出來的對照表。

`backend/paths.py` 兩道防線：`safe_component()` 拒絕含 `/`、`\`、`..`、NUL 的
片段；`resolve_within()` 接完之後再用 `realpath` + `commonpath` 確認結果真的落在
根目錄底下。**看到不對的就拒絕，不要「清理」**——`....//` 把 `../` 刪一次
正好變成 `../`。

### 已修（2026-08-15）：憑證不再寫在版控裡

⚠️ **正式資料庫的 root 帳密原本在 repo 裡。** `.env.deployment`（`MONGO_USERNAME=root`
／`MONGO_PASSWORD=nycuee`）是被追蹤的檔案，`mongo-init/01-init-data.js` 開頭還寫死
了 `db.auth('root', 'nycuee')`——而這個 repo 是 public fork，等於公開發布。

現在：`.env.deployment` 移出版控（範本留在 `.env.deployment.example`），
`mongo-init` 改讀 `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`
（mongo 官方 image 的 entrypoint 會把它們放進 mongosh 的 `process.env`），
沒設就直接 throw。`run-deploy.sh` 找不到 env 檔時**停下來**而不是「使用預設設定」
繼續跑——舊版那條路會用空憑證起 mongo、用臨時秘鑰起後端，而畫面上看起來部署成功。

⚠️ **從 repo 移除 ≠ 收回。** 那組密碼已經公開過（git 歷史、GitHub 的 fork 與快取
都還在），**必須換掉**，不是改個檔案位置就沒事。

種子帳號的密碼也從明文換成 bcrypt 雜湊——那是最後一個還在**製造**新明文的地方
（程式那端早就改成 bcrypt，但 `verify_password` 為了相容舊資料連明文也認得，
所以完全不會有人發現）。

`docker-compose.prod.yml` 加了 `REQUIRE_AUTH_SECRET=1`：漏設 `AUTH_SECRET` 時後端
**啟動失敗**，而不是臨時產生一把之後每次重啟把所有人登出（那個症狀看起來像網站
不穩，不像設定漏了）。

### 建立帳號（`POST /api/register`）

登入頁有一個「建立帳號」模式（`pages/Login.jsx`，兩個模式共用同一張表單）。
成功之後**直接回權杖**，不必再打一次登入。

⚠️ **帳號名稱的字元集刻意很嚴**（`auth.validate_credentials`）：它同時是網址
片段（`/api/raw/{username}/LATEST`）、**檔案路徑片段**（`{MUSIC_FILE_PATH}/
{username}/`）與資料庫查詢鍵。`paths.safe_component` 是最後一道防線，不該是
唯一一道——與其讓 `..foo` 或含空白的帳號建起來、之後在某條路徑上出問題，
不如一開始就只收 `[A-Za-z0-9][A-Za-z0-9_.-]{2,31}`。

⚠️ **密碼上限 72 byte 不是刁難**：bcrypt **只看前 72 個 byte**，超過的部分直接
丟掉而且沒有任何錯誤。允許使用者設一個 100 字的密碼，他以為很安全而後面的字
完全沒作用。明確擋掉比默默截斷誠實（中文一個字 3 bytes，所以算的是 byte）。

⚠️ **重複帳號靠唯一索引擋，不是靠「先查再寫」。** 有先查（為了給一句好懂的
訊息），但兩個人同時註冊同一個名字會兩邊都通過檢查——而資料庫裡有兩個同名帳號
時，`find_one` 回哪一個是沒有定義的行為，密碼對不上的那位就登不進來了。

**邀請碼是必填的**，值放在 `REGISTER_CODE`。沒設不是「開放註冊」而是
**關閉註冊**（`/api/register` 回 503，帳號改由管理員手動建）。

⚠️ **漏設一個環境變數的後果不該是最寬鬆的那個狀態。** 舊版預設 fail-open，
而那條路壞掉時畫面上完全正常——註冊成功、登入成功、什麼異常都沒有，等到有人
發現時資料庫裡已經多了一批帳號。和 `REQUIRE_AUTH_SECRET=1` 讓漏設秘鑰時啟動
失敗是同一個理由。

⚠️ **邀請碼不要寫進版控。** 這個 repo 是 public fork，寫進 `.env.development`
或 `.env.example` 的那一刻它就不再是一道門了（和 `.env.deployment` 那組資料庫
帳密是同一個病因）。正式環境的值放 `.env.deployment`（已 gitignore），本機要
開註冊的話用一次性的環境變數就好——shell 的環境變數優先於 `--env-file`：

```bash
REGISTER_CODE=你的邀請碼 ./start-dev.sh
```

它擋的是**濫用**不是機密：讀取端點大多是公開的，多一個帳號洩漏不了東西，
真正的成本是有人可以無限開帳號並上傳光表佔掉資料庫。

### 密碼遷移的進度

遷移是懶惰的：`verify_password` 明文與 bcrypt 都認得，登入成功的當下才把明文
就地換成雜湊。好處是不停機、不必遷移腳本、沒有人被鎖在外面，代價是**你不知道
什麼時候遷移完**——從雜湊反推不出明文，所以「一次全部轉檔」做不到，那只能把
所有人的密碼重設掉。

```bash
cd backend && uv run python audit_passwords.py --list
```

唯讀，只印帳號名稱不印密碼（那個輸出會被貼進聊天室或截圖）。還有明文時 exit 1。

### 還沒處理

- 其他端點的輸入驗證（上傳的 payload 內容、query 參數的範圍）

⚠️ **`db/dump_data/**/users.bson` 裡有 7 組帳號的明文密碼，而這個 repo 是
public fork——那個檔案永遠不得 import 進 fixture、不得 commit。**
`frontend/scripts/import-mongo-fixtures.mjs` 的 `ALLOWED_COLLECTIONS` 白名單
（只允許 `raw_json` / `color`）是硬性防線，不要繞過。

詳細改進方案請參考 `docs/technical-analysis.md`。

## 學習建議

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

- **2026-09-27**：**CI 從「看起來有在檢查」變成真的會擋**。`pr-checks.yml` 改寫成
  `ci.yml`：拿掉所有 `continue-on-error`；ESLint 補上設定檔（ESLint 10 + hooks 規則，
  清掉 50 個錯誤，全是沒用到的變數與 import——其中 `ControlPanel` 訂閱了
  `currentTime` 卻沒用，播放時每一幀都被喚醒；`LoadData` 訂閱整張光表也沒用）；
  後端第一次在 CI 跑 pytest，並加 ruff 抓未定義的名稱；e2e 與版面稽核進 CI。
  `deploy.yml` 釘住 action 版本（原本是 `@master`）、加 `set -eu`、先 `tailscale ping`
  讓連線問題在第一步就講清楚、部署後確認後端有回應、不再先停站再建置。
  `run-deploy.sh` 部署前先檢查 `AUTH_SECRET` 與目錄權限。Node 統一 24。
  另修 `audit:bundle` 在 Windows 上路徑錯誤（`.pathname` 在路徑有空白時會變 `%20`）

- **2026-09-11**：**把稽核抓到的兩個缺陷修掉**。①**輸出前沒有人把關**：
  `isPartAllowed` 只用在「畫面上要不要讓你點」，而跨軌貼上的落點是座標差推出來
  的，於是燈可以落在沒帶那件道具的舞者身上、一路上傳成功而演出當天不會亮。
  補了三道防線（貼上的落點、拖曳換軌的目標、`buildPlayers` 的輸出），其中換軌
  那道**必須在移除之前**檢查——它是兩階段的，插入那邊放棄等於段被刪掉。
  `buildPlayers` 清的是 RGB 不是整個欄位，所以原本就暗的欄位輸出一個 bit 都沒變。
  ②**播放時時間軸不跟著紅線**：捲動 effect 讀了 `currentTime` 卻沒放進相依陣列。
  新增 `utils/audio/follow.js`，只在紅線快要離開視窗時推一頁、使用者自己捲過就
  放手。順手修掉 e2e 的 `clickArmorPart` 用「第 N 個有 fill 的元素」定位（帽子
  與領帶各有兩個形狀，`.nth(1)` 其實是帽簷不是臉；六個呼叫端剛好全傳 0 所以還
  沒中），以及刪掉 `src/model/` 底下四個被追蹤的 macOS 資源分叉。
  另外把 3D 模型取代平面人像的五個拍板決定寫進 `docs/3d-armor-plan.md`。
  測試 761 → 782，e2e 78 → 81（與 09-07 那批合流後的數字）

- **2026-09-07**：**拖曳被看不見的東西擋住**。使用者回報「拖移色塊有時候會被
  隱形的黑色色塊擋到」，查出來是**兩個缺陷相乘**：
  ① **`MIN_BLOCK_GAP_MS` 等於 `TICK_MS`**（都是 50），於是「與鄰居至少留一格」
  在一格對齊的網格上正好把唯一剩下的那一步吃掉——隔著 50ms 的兩塊色塊，
  前面那塊往鄰居方向算出來 `max` 是 0，一格都推不動。改成 0（模型本來就允許
  首尾相接，貼上與 trim 也一直在產生相接的段）。
  ② **極窄的色塊畫得出來但看不見**：50ms 在 282 秒的表演裡是 0.0177%，
  1 倍率下約 **0.25px**，而 `clearRange` 的 trim 一次普通的貼上就會留下那麼寬的
  碎片——它是真資料，`movableRange` 會把它當鄰居，於是擋住使用者的東西在畫面上
  不存在，也點不到。加 `min-width: 2px`，但**不能直接加在舊的 flex 排版上**
  （總寬超過 100%，flex 會把所有色塊等比壓縮，整列跟播放頭錯位），所以色塊改成
  **絕對定位**：每一塊的 `left` 與 `width` 各自獨立，撐大一塊不會移動任何其他塊。
  順帶讓 resize 預覽少掉一整段「反向縮放相鄰空隙以維持 flex 總寬」的補償。
  ③ 順手拿掉 `Timeline` 的 `zoomValue` prop——它只出現在解構裡，元件內**從來沒有
  被讀過**，而它每動一格縮放就變一次，154 個 `memo` 實例因此全部被喚醒。
  ⚠️ `blocks.js` 的空隙 block 仍然要留：它現在的理由是**框選的命中判定**
  （`data-gap`），不再是排版。
  三個都故意改回舊行為驗過（gap 改回 50 → 6 條紅、拿掉 min-width → 1 條紅）。
  測試 758 → 761，e2e 78/78、版面稽核兩種尺寸各 5 項全 0

- **2026-09-03**：**稽核編輯操作面**（沒有動程式，只記錄）。抓到兩個缺陷：
  ① **`isPartAllowed` 從來沒有守在輸出路徑上**——它只是「畫面上要不要讓你點」的
  判斷，而跨軌貼上的落點是座標差推出來的，於是燈可以落在根本沒帶那件道具的舞者身上，
  上傳成功、清單正常，演出當天不會亮；② **播放時時間軸不跟著紅線捲動**——effect 讀了
  `currentTime` 卻沒放進相依陣列，只在縮放時置中一次，放大之後紅線幾秒就跑出視窗。
  另外把操作面缺的九項列成一張表，最上面三項（直接拖曳取代 Move Mode、鍵盤微調、
  `Ctrl+D` 與 `Alt` 拖曳複製）共用同一批運算、不動資料模型，是下一批要做的。
  詳見「輸出前沒有人在把關」「播放時時間軸不跟著紅線」「編輯操作還缺的東西」三節。

- **2026-08-29**：**低配機器的卡頓：回收音訊、砍掉繞道與死碼**。量下來最大的
  記憶體項目是**解碼後的音訊**——立體聲 44.1kHz 每分鐘約 17MB，`musicsrc/`
  那十一首全部試聽過就是 800MB，而 `cache.buffers` 舊版只有離開編輯器才清。
  新增 `engine.keepOnly(files)` 依播放清單淘汰（峰值本來就這樣做了，只是沒
  通知引擎）。⚠️ 淘汰要在 early return 之前，否則「清空播放清單」反而什麼都
  沒放掉；⚠️ 解碼到一半被淘汰的不要塞回快取，否則它自己長回來。
  峰值順手改 `Float32Array`（一首省 0.8MB），persist 也不再轉回一般陣列。
  另外兩項是 CPU 而不是記憶體：`timelineBlocks` 從「dispatch 進 store 再讀
  回來」改成就地 `useMemo`（一次編輯少掉一輪全 store 通知），以及刪掉
  Timeline 裡三個維護一個**不存在的 `<canvas>`** 的 state（每次縮放白繪
  154 個元件）。
  ⚠️ 音訊回收的 e2e 第一版是假的——它拿「重新加入時有沒有抓音檔」當判準，
  但那次加回來的檔案本來就沒被快取過。破壞驗證照樣全綠才發現，改成比對
  **同一個檔案**的抓取次數。
  測試 751 → 758，e2e 77 → 78

- **2026-08-28（下午）**：**跑馬燈與對齊分佈**——兩個從專業軟體借來的功能。
  **跑馬燈**是燈光台（grandMA / Chamsys）最常用的效果：同一個色塊貼到七位舞者
  身上、每位往後推 100ms，就是一道光波沿著隊形跑過去。落點的地基本來就在
  （`planPaste` 是「二維座標差 + 時間平移」），相位只是多一項「名次 × phaseMs」，
  而滑鼠預覽會立刻變成階梯狀。⚠️ 名次依 `(舞者, 部位)` 排序不是選取順序；
  相位一律往後推，正負只決定波的方向（直覺寫法會讓負相位跑到游標之前）。
  **對齊與分佈**從向量繪圖工具借來：起點對齊、長度統一、平均分佈。
  ⚠️ 平均分佈逐軌、另外兩個跨軌；選取彼此重疊時整條放棄而不是靜靜吃掉一段。
  測試 735 → 751，e2e 74 → 77

- **2026-08-28**：**舞者開關收進卡片、縮放改成幾何級數**。
  光衣下面那一整列 50px 的舞者開關拿掉了（連同留白約 66px，而畫面上最需要
  空間的正是光衣）：「隱藏」收進每張卡片自己的標題列，「叫回來」只在真的有人
  被隱藏時才出現、平常一個像素都不佔。⚠️ 恢復的入口刻意在卡片外面——放在
  卡片上的話卡片一隱藏那個按鈕就跟著消失（軌道的眼睛按鈕當初就是這樣被移除的）。
  縮放的兩個症狀（`+` 太鈍、滑桿太跳）是**同一個根因**：控制項是線性的而縮放
  是幾何的。`+` 從每次 +0.05（1 → 100 要按 1980 次）改成 ×1.25（21 次），
  滑桿從線性 1..100 + `Math.floor`（一個像素約一倍，低倍率那端 1 直接跳 2）
  改成位置與 log(倍率) 成正比，並補上讀數（幾何滑桿的中點是 10 倍不是 50 倍，
  沒有數字猜不出來）。
  ⚠️ 踩到一個：`.dancer-label` 是 `pointer-events: none`，裡面的按鈕跟著點不到
  ——畫得出來、hover 也看得到，只是 `elementFromPoint` 回傳的是卡片本身。
  測試 717 → 729，e2e 66 → 74（縮放故意改回線性驗過，12 則裡 9 則變紅）

- **2026-08-27（下午）**：**貼上用滑鼠預覽，選色要等使用者確定**。
  複製模式下游標指到哪，落點的虛線框就畫在哪，按左鍵就貼在框的位置——舊流程
  要「先點一個目標色塊選起來再按 Ctrl+V」，貼到空白處沒有東西可以點，而且按
  下去之前完全看不到會貼到哪。預覽與實際落點走**同一份運算**，有測試直接比對
  `landingSpans` 與 `planPaste`（不一致的症狀是「框畫在 A、貼下去在 B」）。
  調色器改成 uncontrolled + 監聽原生 `change`：React 的 `onChange` 綁的是
  `input`，而 `<input type="color">` 拖過色域的每一格都會發 `input`——舊版
  等於「滑鼠滑過色盤哪裡，色塊就變成哪個顏色」，而且**每個中間色都寫進光表、
  各佔一格 undo**。順帶修掉複製模式的提示橫幅蓋住 header 的 Load/Edit/Logout
  （版面稽核抓不到它，因為它只在複製模式下才出現）。
  測試 704 → 717，e2e 64 → 66（兩邊都故意改回舊行為驗過，全部變紅）

- **2026-08-27**：**選取跨軌之後，每一個操作都跟著跨軌**。框選早就能一次選到
  七位舞者身上的同一個樂句，但幾乎每個操作都在 `multiSelectedBlocks[0]` 那一條
  就收斂了——選了七條只有一條會動，而且不報錯、沒提示。補齊的有亮度、漸變、
  頻閃、剪下、放最愛色、導航的邊界時間、複製貼上與拖曳。唯二本來就做對的
  （刪除、改色）各自手寫了一遍同樣的迴圈，一併收進 `utils/segments/table.js`。
  拖曳同時支援兩種跨軌：**水平**是整批共用同一個位移量（樂句搬完仍然對得齊），
  **垂直**是把色塊拖到別條軌上（落點覆蓋，與貼上同一套碰撞規則）。
  ⚠️ 三個「壞掉時看不出來」的地方寫進了上面那一節：`segmentId` 為 `null` 的
  選取不能濾掉（它表達的是「在編哪一條軌」）、貼上用座標差而拖曳用列數差
  （剪貼簿會跨越工作集切換）、換軌時要先全部移除再全部插入（來源與目標會重疊）。
  測試 689 → 704，e2e 62 → 64（兩項都故意把跨軌改回單軌驗過，全部變紅）

- **2026-08-21**：**邀請碼改成必填，而且沒設是關起來不是打開**。`/api/register`
  在 `REGISTER_CODE` 沒設時回 503（「請找管理員開帳號」）而不是放行——舊版的
  「沒設 = 開放註冊」是 fail-open 的，漏設一個環境變數的後果是任何知道網址的人
  都能在資料庫裡開帳號，而那條路壞掉時畫面上完全正常（註冊成功、登入成功、
  什麼異常都沒有）。整串空白也算沒設（不 strip 的話 `REGISTER_CODE=" "` 會變成
  一組空白邀請碼）。前端那一欄從「選填」改成必填並先擋空值——後端一樣會擋，
  但要繞一趟網路才換到「邀請碼不正確」，而使用者其實是根本沒填。
  ⚠️ **碼本身不進版控**：這個 repo 是 public fork，寫進 `.env.development` 的
  那一刻它就不再是一道門（和 `.env.deployment` 那組資料庫帳密同一個病因）。
  正式環境填在 `.env.deployment`，本機用 `REGISTER_CODE=xxx ./start-dev.sh`。
  順帶修掉登入頁的錯誤訊息不會跟著使用者的輸入更新——填好邀請碼之後
  「請填寫邀請碼」還掛在那一欄底下，欄位是滿的而訊息說它是空的。
  e2e 61 → 62。後端測試 85 → 87 passed

- **2026-08-16**：**登入頁可以自己建立帳號**（`POST /api/register` + Login 頁的
  註冊模式）。建完直接回權杖，不必再打一次登入表單。帳號名稱的規則刻意很嚴——
  它同時是網址片段、**檔案路徑片段**與資料庫查詢鍵，`safe_component` 是最後一道
  防線不該是唯一一道。密碼下限 8 字、**上限 72 byte**（bcrypt 只看前 72 個 byte，
  超過的默默丟掉，讓人以為自己設了很長的密碼）。重複帳號靠 `users.username` 的
  唯一索引擋而不是「先查再寫」（後者中間有空窗，兩人同時註冊會兩邊都過）。
  `REGISTER_CODE` 沒設就是開放註冊，設了就要填邀請碼。（2026-08-21 改成必填，
  見下一條）
  ⚠️ 這條路徑**永遠不會產生明文密碼**，有測試守著——整個專案花了很多力氣才把
  明文清掉，而 `verify_password` 連明文也認得，寫回明文的話登入完全正常、
  沒有任何症狀。
  順帶修掉登入頁的兩件事：錯誤從 `alert` 改成行內顯示（註冊的失敗原因有好幾種，
  彈窗會蓋住表單而且按掉就消失），Enter 鍵改用原生的 `<form onSubmit>`（舊版掛在
  document 上、相依於每次 render 重建的 handler，等於每次 render 拆一次裝一次）。
  e2e 58 → 61（其中一項擋住「標題與送出鈕文字都是登入」造成的選擇器歧義——
  實測就是這樣紅的）。後端測試 65 → 85 passed

- **2026-08-15（深夜三）**：**憑證不再寫在版控裡**。查密碼明文儲存的狀況時發現
  更嚴重的一層：**正式資料庫的 root 帳密就在 repo 裡**——`.env.deployment`
  （`MONGO_PASSWORD=nycuee`）是被追蹤的檔案，`mongo-init` 開頭還寫死了
  `db.auth('root', 'nycuee')`，而這個 repo 是 public fork。已把 env 檔移出版控
  （範本留 `.env.deployment.example`）、`mongo-init` 改讀環境變數且沒設就 throw、
  `run-deploy.sh` 找不到 env 檔改成停下來（舊版會「使用預設設定」繼續跑，用空
  憑證起 mongo、用臨時秘鑰起後端，而畫面上看起來部署成功）。
  ⚠️ **移出 repo 不等於收回**，那組密碼必須換掉。
  另外：種子帳號的密碼從明文換成 bcrypt 雜湊（最後一個還在**製造**新明文的地方，
  因為 `verify_password` 連明文也認得所以一直沒人發現）；
  `docker-compose.prod.yml` 加 `REQUIRE_AUTH_SECRET=1` 讓漏設秘鑰時**啟動失敗**，
  而不是每次重啟把所有人登出（那個症狀看起來像網站不穩）；新增
  `backend/audit_passwords.py` 查還有幾個帳號沒完成懶惰遷移（唯讀、只印帳號名稱）。
  後端測試 59 → 65 passed

- **2026-08-15（深夜二）**：**MongoDB 的儲存方式**。這個資料庫原本**一個索引都
  沒有**——每次「載入最新版本」都是掃過該使用者的所有光表、載進記憶體、排序、
  取第一筆（一份密集光表的 `players` 實測 43KB）。規則收成 `backend/storage.py`，
  索引在 `mongo-init` 與後端啟動時各建一次（同一份定義，分別服務全新部署與
  既有部署）。另外修掉四個「壞掉時看不出來」的地方：① `upload_full` 在 Pydantic
  驗證失敗時會把**未驗證的資料**原樣塞進 color 再回 200，而驗證存在的唯一理由
  就是擋掉那種資料；② 兩份文件分別 try/except 卻**不管結果一律回 success**，
  只寫成功一份會留下「跑得動但打不開」的版本；③ 時間戳只到秒又沒有唯一索引，
  連按兩下 Output 產生兩份 `(user, update_time)` 相同的文件，之後 `find_one` 回
  哪一份是沒有定義的；④ 前端 `handleOutput` 在**送出之前**就把「尚未儲存」關掉，
  上傳失敗時沒有人設回來——橫幅消失、關分頁的提醒也不再出現，畫面說已儲存而
  伺服器上什麼都沒有。順帶拿掉兩支端點裡「撈出所有版本、數一數、然後什麼也不做」
  的全表掃描（真正的刪除那行是註解掉的），分塊端點改用 `$slice` 在伺服器端切
  （舊版每次都把整份光表撈出來再取 10 筆），`timelist` 加上分頁上限與投影。
  保留策略做成 `HISTORY_LIMIT`，**預設 0 = 什麼都不刪**。
  ⚠️ `update_time` 刻意維持本地時間字串：它是排序鍵，改 UTC 會讓新版本排在舊版本
  前面，`LATEST` 回傳舊光表而畫面上完全正常。後端測試 37 → 59 passed

- **2026-08-15（深夜）**：**節拍格線（A3 的前半）**。速度掛在歌上而不是掛在時間上
  （`clip.bpm` / `beatAnchor` / `beatsPerBar`，運算在 `utils/audio/tempo.js`）——
  歌單可以重排，絕對時間的速度表在對調兩首歌的瞬間就整片對到別首歌，而畫面上不會
  有任何異常。使用者拍板同一音檔不變速、最細到四分之一拍、三連音略過，所以不需要
  速度區段，一首歌一組欄位就夠。密度由「相鄰兩條至少 10px」推導，縮小時逐層退回
  半拍、整拍、小節，連小節線都擠在一起時整片不畫。**吸附刻意還沒做**——韌體吃 50ms
  格子而 128 BPM 一拍 468.75ms，吸附完還要 roundToTick，最多再挪 25ms，所以「看得到
  拍在哪」本身的價值高於手感吸附；先用一陣子再決定要不要動 `gestures.js`。
  踩到兩個：`BeatGrid` 一開始整片看不到，因為軌道容器有一層不透明底色（把底色搬到
  `.main-controlPanel` 才有地方墊）；格線的 React key 只用時間，接縫重疊時兩首歌在
  **同一毫秒**各有一條線，React 不只是警告而是**留下上一個狀態的節點**——e2e 數到
  126 條（該是 121）、小節線 18 條（該是 16），key 帶上 clipId 才對。
  順帶把版面稽核的折行檢查從提示擴大到控制項標籤：實測「每小節」在播放清單裡被折成
  一個字一行（50px vs 25px），而它「有出現」所以裁切檢查抓不到。
  e2e 56 → 58。測試 622 → 657 passed

- **2026-08-15（晚）**：**多曲銜接的複查**，抓到兩個「畫面看起來完全正常」的錯誤。
  ① **移除最後一首之後它自己長回來**：`music_filename` 是清單的投影，但空清單時
  reducer 保留了舊檔名，於是讀取端的 `migrateClips` 把「沒有 clip 但有
  music_filename」判成還沒遷移的舊單曲專案，幫忙生一個回來——投影必須是全域的，
  空清單投影出來是空字串。只移除到剩一首的測試完全看不到（e2e 補了這個邊界，
  故意改回去驗過會指出「1 首・30000ms」）。② **遷移出來的 clip 用隨機 id**，
  而 `useAudioClips` 是三個呼叫端各跑一次的，同一個舊專案在波形、播放清單、接縫
  標記眼裡是三個不同的 clip；改成由檔名推導的決定性 id。
  另外修掉四件事：清單清空時載入 effect 只是 early return，引擎手上還留著上一份
  clip、duration 與波形都是舊的（按播放會播到剛移除的那首）；接縫滑桿每一格像素
  都 dispatch，而那會讓 `stitchPeaks` 跑 20 萬桶乘上歌數（改成停下來才寫，
  和逐軌行高把手同一個做法）；`renameClip` 沒變也回傳新陣列，讓呼叫端的
  「沒變就不 dispatch」失效；歌單改動不算「尚未儲存」（用歌單本身的欄位當簽章，
  避開解碼後寫回長度造成的假陽性）。順手把 `sameClipTimeline` 從元件搬進
  `clips.js`（它是領域問題不是渲染細節）、外部 JSON 進來時補齊缺的欄位、
  刪掉沒有人用的 `clipIndexAt` 與 `isDerived`，並補上三條 lazy 路由的煙霧測試
  ——`/`、`/dashboard`、`/model` 在切 chunk 之後沒有任何測試走過。
  e2e 50 → 56。測試 615 → 622 passed

- **2026-08-15（下午）**：**初始 JS 從 1817 收到 475 KB**（gzip 547 → 156）。
  用 sourcemap 逐套件統計之後發現 **746 KB 是 `/model` 那一頁的 `three` 與
  `@google/model-viewer`**——排燈的人從頭到尾不會打開那一頁；`Home.jsx` 另外有
  一行完全沒用到的 `import { set } from "lodash"`（72 KB）。分割線畫在**路由**上
  （`App.jsx` 的 `lazy`）而不是靠 `manualChunks` 手動分組，路由本來就是「現在
  需要哪些程式碼」的天然邊界。`ShortcutModal` 也切出去（整套 markdown 轉譯器
  155 KB）並改成沒打開就不 render——只寫 lazy 但無條件 render 的話 chunk 照樣
  會被抓。`Home` 刻意不切，它是唯一的熱路徑。新增 `npm run audit:bundle` 守著
  這個數字（實測把 `/model` 改回 eager 會 exit 1）。順帶量到 `dist/` 有 **91 MB
  的 mp3**（十一首示範曲，其中一首是商業歌曲而這個 repo 是 public fork）——
  不影響載入速度，但每次部署都要搬，記進 todo 的 B4。

- **2026-08-15**：**多曲銜接**。音訊時間軸從「一個 `music_filename`」升級成一串
  clip（`utils/audio/clips.js` + `hooks/useAudioClips.js` + `Playlist.jsx`），
  五、六首歌接續播放、接縫可以重疊做交叉淡入淡出。使用者排的是**順序**，起訖
  時間由 `resequence` 推導——換掉第三首時後面每一首自己跟著移。播放引擎早就是
  clip 時間軸（一次排完整場、每個 clip 各自一個 gain node），所以這次只補了資料
  模型與 UI，排程一行沒改。波形改畫**整場**：峰值逐檔快取，`stitchPeaks` 依位置
  拼成一條，重疊處取兩首的較大值。UI 是可收合的——排燈時幾乎不會動歌單，常駐六列
  等於用最貴的版面放最少用的功能。踩到三個順序問題：接縫直接用 `overlapMs` 的話，
  很短的歌會整首被蓋掉甚至讓清單的時間順序反過來（改成逐條夾在兩首之內）；
  `updateMusicFilename` 無條件重設清單的話，多曲專案載入時先 dispatch 的那一下
  會把後面幾首丟掉；`applyMeasuredLengths` 沒有「沒變就回傳原 reference」的話，
  「量長度 → dispatch → 重新載入」會轉成無窮迴圈。
  順帶修掉一個全站的靜默 bug：`.tooltip` 和 Bootstrap 撞名而且比它早載入，
  於是 `white-space: nowrap` **從來沒有生效過**——每一則提示都照宿主的寬度折行
  （34px 的按鈕配 8 個字實測 48×96）。靠邊的規則也從來沒對上過（少算了一層
  `.leftupcorner`），修好折行之後那則提示立刻跑出畫面被稽核抓到。
  版面稽核第三項加上折行檢查（拿高度跟行高比，故意改回去驗過會指出 19 則）。
  e2e 45 → 50。測試 542 → 615 passed

- **2026-08-14（深夜四）**：**Phase 6 兩項功能**。**框選**：拉一個矩形選取跨軌的
  多個色塊（幾何在 `utils/segments/marquee.js`，事件在 `MarqueeSelect.jsx`）。
  多段一起拖早就做好了，但選取只能 `Shift+click` 一個一個點且跨不了軌——
  同一個樂句在七位舞者身上各有一段時要點十幾下。踩到兩個順序問題：拖曳後
  瀏覽器補的 `click` 會被 outside-click handler 判成「點在 block 外面」而清空
  剛框好的選取；Shift 的加選基準必須在 mousedown 就存好（Timeline 會在同一次
  mousedown 清空選取）。**頻閃改成 metadata**：`seg.effect = {type,period}`，
  展開只發生在壓平輸出與播放預覽，畫面上一直是一個可拖曳、可改色的色塊。
  舊版是破壞性的——套下去色塊就被換成 N 個小塊，想挪半拍要全部選起來（中間
  有空隙，連選會斷）、想改間隔只能刪掉重放。順帶把顏色的基本運算拆到
  `utils/segments/rgba.js` 避免 `color.js` ↔ `effects.js` 的循環相依。
  e2e 37 → 43。測試 412 → 455 passed
- **2026-08-14（深夜三）**：**工具列換行處理與調色盤重做**。播放控制那一組有 647px
  寬，1280 下必定換行，而它落在第二排的**最左邊**——正下方是空的軌名欄，看起來像
  一排跟誰都沒關係的控制項掛在那裡。改成 `margin-left: auto` 靠右：排得下時貼齊
  時間軸右緣，排不下時第二排從右邊接續第一排的末端。它前面那條分隔線一併拿掉——
  換行之後那條線會變成第一排末端一條懸空的短線，而自動留白換行仍然成立。
  調色盤三個**行為**問題（排版解決不了的那種）：① 點最愛色的預設是**覆蓋**，
  而模式切換是一支 `<input type="range" step="1">"`，沒人會發現那是開關；
  ② 亮度只有六段（`(parseInt(A*10)±2)/10`），而 `Ctrl+1~9` 早就在設 10%~90%；
  ③ 空格補成白色，跟「存了白色」長得一模一樣。分別換成 `使用/存色` 二選一
  （預設使用、空格一律存）、1% 一格的滑桿、`null` + 虛線框。新增「最近使用」
  一排（reducer 自動記、依色相去重）。順手修掉快捷鍵 7/8 會繞回第 1/2 格的靜默錯誤，
  以及 `TransparentButton.css` 裡一條套到全站的裸 `*` 選擇器（該元件整個刪除）。
  e2e 33 → 37。測試 393 → 412 passed
- **2026-08-14（深夜二）**：**左右兩欄逐列對齊**。使用者畫線指出「同色的地方要
  對齊」——講的是軌名列與時間軸的**每一列**要在同一條水平線上，不是左右邊緣的 x。
  實測 1600 下整欄差 25px（右邊多一條時間刻度尺，左欄沒讓）、1280 下差 49px
  （工具列在那個寬度換兩行）。寫死一個高度只對得了一種寬度，所以改成量第一列的
  落差再補（`align()` + ResizeObserver）。版面稽核第四項加上逐列比對。
- **2026-08-14（深夜）**：**下半部三排對齊**。工作集列、工具列、軌名列的內容
  左緣先前是 12 / 6 / 1，工作集列的右緣停在 1600 而其他停在 1595，左側軌名欄
  （15% = 240px）還和播放器（從 235px 開始）重疊 5px。收成 `.control-panel` 的
  `--gutter-w` / `--row-inset` 兩個變數之後三排一致。版面稽核第五項加上「各排
  內容左緣」——容器比較抓不到這個，三排的容器都從 0 開始，差別在各自的內縮
  （故意把內縮改成 30px 驗過，稽核會指出差 18px）。
- **2026-08-14（晚）**：**道具搬到人旁邊，右欄收成純調色盤**。飾品燈原本在右側
  一個獨立側欄裡，離所屬的舞者好幾百像素遠，播放時看不出「這位舞者的刀亮了」；
  現在畫在同一張光衣卡片裡與人並排，顏色一樣走 `getColorAt`，播放時整個人連同
  手上的東西一起亮。身體部位本來就能在光衣上點，右側不需要再列一份清單，
  於是右欄從「調色盤 168 + 飾品側欄 200 = 376px」收成單一 200px。
  調色盤改橫排（調色器與 HEX／亮度並排、最愛色一列六格）——直排時它自己就 272px，
  而這一欄在 1280×800 下只有 220px。版面稽核抓到 header 在 1280 寬被擠到溢出
  （六顆按鈕放不下，flex 不自己裁切，最後一顆跑到右欄底下被蓋住），修法是讓右欄
  從 header 下方才開始、header 拿回整個寬度，解耦而不是調數字。
  光衣卡片的寬度改成先分好再縮放圖形（`flex: 1 1 0`）：與道具並排之後 SVG 在
  flex row 裡沒有固有寬度，舊的「由內容撐開」會讓它塌成一條線或溢出卡片。
  e2e 31 → 33。測試 393 passed

- **2026-08-14（下午）**：**軌道行高可調**。高度從「`100 / 軌道數 %`，超過 7 條
  改寫死 14%」換成使用者指定的像素（`utils/tracks.js`）。舊模型有兩個問題：
  加一條軌會把其他每一條壓矮，以及左右兩欄各自算自己的百分比——容器高度只要
  有一點差，捲到下面軌名就對到隔壁那條軌，而畫面上完全看不出來。現在兩欄吃
  同一個數字，對齊是結構上保證的（e2e 直接量兩邊的 `getBoundingClientRect`）。
  工作集列加行高滑桿，軌名列左緣加逐軌把手（拖曳中只改 DOM、放開才 dispatch），
  低於 64px 自動收起上下移與刪除。e2e 27 → 31。測試 395 passed
- **2026-08-14**：**工作集**。`showPart` 從一個沒有名字的陣列升級成具名軌道組
  （`utils/worksets.js` + `hooks/useWorksets.js` + `WorksetBar.jsx`），可以命名、
  存起來、一鍵切換。新增時預設複製目前這一組——多數新組是從現有的微調而來
  （「上半身」是從「全身」拿掉腿和鞋），從空白開始要重加十幾條。
  既有的四個寫入端一行都沒改：`updateShowPart` 的 payload 形狀不變，
  只是 reducer 把它寫進目前那一組。舊 persist 資料由 outbound transform 收成
  「未命名」，靠形狀辨認不看版本號，順便丟掉已移除的 `hidden` 欄位。
  另外移除軌道的眼睛按鈕——它把軌道設成 `opacity: 0` 但**照樣佔滿高度**，
  變成看不見也點不到的空白帶，而且 persist 裡存了 `hidden: true` 的話使用者
  除了刪掉那條軌之外沒辦法讓它回來（按鈕就在那條看不見的列上）。
  e2e 24 → 27。測試 385 passed
- **2026-08-13（深夜）**：**光表區對齊與光衣重畫**。上下兩塊的右緣先前一個停在
  1427、一個停在 1595（欄寬散在三個 CSS 檔各寫各的），右上角空出 168px 的缺口。
  收成 `.homepage` 的三個變數之後兩塊都是 0..1595，版面稽核加第五項守住。
  光衣的幾何抽到 `config/armorShapes.js`：`Armor.jsx` 從 14 段重複 JSX（圖形一份、
  選取高亮一份，鞋子的高亮框因此比鞋子高 10px）變成一張表驅動的 141 行；
  `viewBox` 原本 480 高而內容只到 348，**底下空了 130px**，收緊後同一張卡片裡的
  光衣大了三成且置中；圓角改由短邊推導、帽子拆成兩個圓角矩形、加了舞台地板線、
  舞者標籤從浮在頭上的膠囊改成卡片的標題列（SVG 不必再往下平移 35px 讓位）、
  目前編輯裝備的那位舞者卡片會亮邊框。點部位改用 `data-part` 指名——先前單元測試
  與 e2e 都用「第 N 個有 fill 的元素」，帽子與領帶各有兩個形狀之後會靜默點錯。
  測試 356 passed
- **2026-08-13（晚）**：**Phase 6 起步：多個色塊一起搬**。`gestures.js` 新增
  `movableRange`（能移多遠的單一真相）與 `moveSegments`，`moveSegment` 收成它的
  單元素版本。Timeline 的像素預覽改問同一個函式——先前它自己用像素重算一遍邊界，
  那是「拖到底又跳一點」的來源；兩份重複的拖曳 commit 邏輯（其中一份多一個守衛，
  於是兩條路徑行為不同）也收成一份。順手修掉兩個洞：色塊首尾相接時拖 0 像素會
  自己彈開 50ms（範圍沒夾住 0）、表演長度還沒載入時 `duration` 是 undefined 會讓
  NaN 流進位移把 start/end 寫壞。另外擋下「會讓光表縮小的 commit」——四個呼叫端
  都拿 hook 給的表當基準，而它在資料還沒載入時是空陣列，整場表演會被靜默清空。
  e2e 22 → 24。測試 354 passed
- **2026-08-13**：**Phase 5g 完成，黑色哨兵從執行路徑消失**。刪掉
  `withKeyframeAdapter.js` / `useKeyframeActionTable.js` /
  `insertColorKeyframes.js` / `LEGACY_BLACK_SENTINEL_MS`，以及選取項目上的
  `blockIndex`——現在 `multiSelectedBlocks` 只帶 `{armorIndex, partIndex, segmentId}`。
  最後兩個轉接橋使用者原生化：audioplayer 的調色盤／最愛色改走
  `insertColorSegment`，`EditActionTable` 從關鍵格表格改寫成 segment 表格
  （start / end / 兩端顏色 / linear），本地那份 JSON 深拷貝歷史換成全域 undo。
  補上時抓到兩個真的 bug：調色盤 effect 少了「顏色沒變就回傳原陣列」的判斷會
  **無限重繪**（舊版靠 immer 的結構共享矇混過去）；`EditActionTable.css` 有裸的
  `button` / `table` 選擇器，一 import 就把首頁標題撐出容器 1237px。
  e2e 新增 `/edit` 兩項（20 → 22）。測試 336 passed
- **2026-08-12（晚）**：**UI 設計系統**。CSS 寫死顏色 **287 → 0**（新增
  `styles/tokens.css` 42 個 token + `tokens.test.js` 防腐測試）。編輯器介面
  全面無彩色化：波形去綠、舞者標籤去藍、未儲存橫幅去橘，色塊選取改白色雙層
  ring（舊版橘色撞到橘色色塊就改判青色，只擋得住一種顏色）。光衣加描邊並站上
  黑卡——部位的 fill 帶 alpha 而 alpha 是 LED 亮度，墊底盤會讓低亮度的顏色
  系統性偏亮。色塊新增亮度角標（「鮮紅 30%」與「暗紅 100%」合成後像素完全相同）。
  按鈕收成四階層、工具列分五組、16 則提示改繁中並刪掉 8 個寫死座標。
  新增時間刻度尺（密度由「相鄰標籤至少 60px」推導）。調色盤 debug 整數換成
  HEX 欄位、最愛色 4 → 6 格。測試 292 passed
- **2026-08-12**：**UI 版面修正**。用瀏覽器實測稽核（`npm run audit:layout`）
  抓到 9 處控制項被蓋住：Edit/Logout 被「尚未儲存」橫幅整個蓋住、音樂選單被
  擠到畫面外 x=−16 蓋住左側工具列、舞者開關浮在光衣上蓋掉 12 個部位、光衣 SVG
  （寫死 480px）溢出容器蓋住整條工具列、調色盤各區互疊。根因都是
  `position: absolute` + 寫死像素座標，改成 flex 排版後 1600×950 與 1280×800
  兩種尺寸都是 0 問題。另修好登入後立刻重新整理會被彈回首頁（persist 有 2 秒
  debounce，新增 `flushPersist()`）與 Ctrl/Shift+數字快捷鍵被防彈跳吃掉。
  新增 `npm run e2e`（17 項功能驗收）與 `npm run audit:layout`
- **2026-08-10**：**人數與部位數集中化**。`constants/parts.js` 成為唯一來源
  （`PLAYER_INDICES` / `PART_INDICES` / `isAccessoryPart` / `createEmptyActionTable`），
  取代散落 5 個檔案的 9 處 `Array.from({length: 7})` 與寫死的身體/飾品分界 `14`。
  新增 `partsConfig.test.js` 當安全網（光衣 SVG 覆蓋率、飾品索引範圍、
  `dancerVisibility` 形狀）。實測改成 9 人全綠、拿掉一個身體部位會被準確指出。
  操作方式見上方「調整舞者人數或部位清單」。測試 183 passed
- **2026-08-09（晚）**：**效能稽核與優化**。三項實測影響最大的問題：
  ① persist 每次編輯序列化 72.9ms（`serialize: false` 後 0.5ms，主因是
  `Float32Array` 被 JSON 化成 5.3MB）；② undo 用 `JSON.stringify` 深度比較
  （53ms → O(1) reference）；③ 訂閱粒度太粗（新增 `useKeyframePartTimeline` /
  `useKeyframeArmorTimelines`，一次編輯只重算 1/154 條 Timeline、1/7 個 Armor）。
  另修好 Phase 4 引入的回歸：no-op 編輯會佔掉一格 undo。測試 168 passed
- **2026-08-09（下午）**：**Phase 4 完成** —— store 的 `data.actionTable` 改存 segments。
  新增遷移入口 `utils/migration/loadProjectData.js`（五條載入路徑統一、靠形狀辨認格式）、
  轉接橋 `utils/segments/withKeyframeAdapter.js` + `hooks/useKeyframeActionTable.js`
  （逐部位 reference 快取，既有寫入者零邏輯改動）；persist key bump `root` → `root_v2`。
  測試 150 passed，閘門測試全 fixture 結構性差異 0
- **2026-08-09**：`refract` 分支完成重構 Phase 0–3。測試從 0 建到 125；audioplayer.jsx 從 1,992 行拆到 368 行（`components/audio/` 下 6 個新元件 + `hooks/useKeyboardShortcuts.js`）；segment 轉換器與 Phase 4 閘門測試就位
- **2026-05-06**：修復區塊剪下失敗與紅線視覺偏移（blockIndex 語意統一、currentTime 同步、stale closure 消除、duration 溢出防護），更新 `docs/frontend-rendering-optimization.md`
- **2026-05-04**：前端效能優化（rAF 三層分離、React.memo、persist 剝離、middleware 禁用），新增 `docs/frontend-rendering-optimization.md`
- **2026-05-03**：重整 docs/ 目錄，新增資料流管道與後端管理文檔，更新 CLAUDE.md 架構圖與引用
- **2025-08-20**：建立專案記憶檔案，針對 C++ 背景開發者優化 README.md
- **專案狀態**：開發版本，包含已知安全性問題待修復

## 色塊資料模型重構計畫（2026-08-08 修訂版）

> 詳細執行步驟、16 項更正、風險表與 checklist 見 [todo.md](todo.md)。本章節記錄設計動機與已拍板的決策，
> 讓未來的協作者（與 Claude）一進專案就能看到方向。
> 4 月版規劃已於 2026-08-08 重新稽核修訂（upstream 前進 39 個 commit 後多項假設過時）。

### 為什麼要改

目前 `actionTable[armor][part] = [{time, color, linear}, ...]` 是「關鍵格 + 黑色哨兵」模型。
為了表達「色塊在此結束、不要漸變到下一段」，必須在前後塞純黑斷點，導致：

- `insertArray` 的 5 分支黑點判斷 + 魔術數字 `blackthreshold = 10ms` 重複了 **4 份**
  （[Armor.jsx](frontend/src/components/Armor.jsx)、[audioplayer.jsx](frontend/src/components/audio/audioplayer.jsx)
  `insertFavoriteColorArray`、[AccessoryPanel.jsx](frontend/src/components/AccessoryPanel.jsx)、已死的 Item.jsx）
- W/S/A/D 與 handleGoLeft/Right 必須「自動跳過黑色」；點到黑色 block 會清空選取
- 拖曳/resize 一個色塊要同步搬 2-N 個 keyframe + 鄰居黑點（Timeline.jsx Move Mode / resize commit）
- `removeDuplicateBlackBlocks`、`ensureBlackBefore` 等清理函式存在的唯一理由就是黑點
- 「色塊」不是資料模型的一級物件，框選/多選拖曳/量化等 DAW 風功能幾乎做不到

根因：**資料形狀沒有顯式表達色塊邊界**，整份程式碼一直在從「關鍵格序列 + 鄰居黑色」反推色塊在哪。

### 新模型（已拍板）

```js
actionTable[armor][part] = [
  { id, start, end, colorStart: {R,G,B,A}, colorEnd: {R,G,B,A}, linear, effect? },
  ...
]
```

**核心決策（2026-08-08 最終版）：**

| 項目 | 決策 |
|---|---|
| segment 之間 | **可以有間隔**，間隔 = LED 關閉（黑）——黑色不再是資料 |
| 黑色哨兵 | **徹底消滅**（使用者拍板）：`blackthreshold` / -10ms 從專案完全消失；f9489cf 的「黑點豁免 50ms 對齊」特例隨遷移作廢 |
| 時間單位 | 可調常數 `TICK_MS = 50`（`constants/time.js`），所有 `start`/`end` 對齊網格 |
| 放色預設長度 | `DEFAULT_SEGMENT_MS = 1000`（1 秒） |
| 漸變語意 | 段內漸變 — `colorStart → colorEnd` 在 `[start, end]` 內線性插值 |
| 拖曳碰撞策略 | **trim** — 新 segment 蓋到舊 segment 時，被覆蓋部分裁掉（可能 split 成兩段） |
| 部位 | **22 個**（14 身體 + 8 飾品 acc0-7），`isPartAllowed` 閘門不變 |
| 後端 | **完全不變** — 前端只走 `upload_full`；mongo schema、韌體 PlayerData 路徑原樣 |
| raw_data | 可改（前端黑盒子）：直接存 `{schemaVersion: 2, actionTable: segments}` |
| 輸出等價標準 | **結構化 diff**（非 byte-equal，見 `utils/export/structuredDiff.js`）：所有列 time 完全相同；差異只允許出現在線性漸變**內部**取樣點（黑點 g−10→g 的插值分母微調所致）。**真實 production 全庫實測（336 份光表、54 萬關鍵格）：結構性差異 0、最大通道差 2**；預設容許 16。其他任何差異 = bug |
| 不變式 | segment 排序、不重疊、`start/end % TICK_MS === 0`、`end > start` |
| segment 識別 | 穩定 `id`（`crypto.randomUUID()`），供多選、複製貼上、undo diff |
| 型別 | 核心做成 generic `Segment<T>`，`utils/segments/core.js` 不 import 色彩（多軌鋪路） |

### 遷移策略（adapter 橋，取代 4 月版混合期）

1. **Phase 0**：vitest + `buildPlayers` 抽出 + golden fixtures（真實本地備份/mongo 指定 timestamp/合成邊界）+ 結構化 diff 比對器——專案零測試，此為動 shape 前提
2. **Phase 2**：轉換器 `keyframesToSegments`（黑點上網格後丟棄）/ `segmentsToKeyframes`（空隙在網格點熄滅），round-trip 冪等 + 全 fixture 結構化 diff 全綠 = 閘門
3. **Phase 4 單一原子 PR**：store 換 segments；舊寫入者包 `withKeyframeAdapter`、舊渲染讀 memoized `selectKeyframes`，既有程式碼零改動；三條載入路徑（redux-persist / 遠端 raw_data / IndexedDB 本地備份）走單一遷移入口；persist key bump（root→root_v2）保 deploy 回滾
4. **Phase 5（5a–5g 全部完成）**：逐寫入者 segment 原生化並拆橋。放色、工具列、
   效果選單、複製貼上、區間平移、拖曳與 resize 全部改成直接操作 segments。
   5g 收尾刪掉 `blackSentinel.js`、`withKeyframeAdapter.js`、
   `useKeyframeActionTable.js`、`insertColorKeyframes.js`、`LEGACY_BLACK_SENTINEL_MS`
   與選取項目上的 `blockIndex`——**黑色哨兵與陣列索引在執行路徑上完全消失**，
   keyframe 只剩壓平輸出時存在（`segmentsToKeyframes`）
5. **Phase 6**：blink 改 `seg.effect` metadata（壓平才展開）、框選、多 segment 拖曳、對齊節拍

### 注意事項

- **零 re-render 拖曳路徑必須保留**（詳見 `docs/frontend-rendering-optimization.md`）：手勢期間 direct-DOM transform、commit 恰好一次 dispatch、undo 合併一筆。
  Phase 5f 之後手勢的**運算**抽到 `utils/segments/gestures.js` 成為純函式
  （`moveSegment` / `resizeSegment`），元件裡只剩像素換算與寫 DOM——
  兩邊必須共用同一組常數，否則會出現「拖到底了但放開後又跳一點」
- actionTable 容器統一為巢狀 **array**
- 韌體輸出欄位順序（hat..acc7）是 ABI，用測試鎖定
- `GET /api/raw/{u}/LATEST` 查錯 collection 的 bug 已修（2026-08-12）

## 長期願景：多軌音訊（DAW 風）

未來目標是讓**音軌也像色塊一樣可拖曳、可拼貼多個音軌**，修改音樂時不用重新上傳整首。

### 為何寫進這份檔案
這個願景反向影響 segment 重構的介面設計（todo.md Phase 7 記錄的不得反悔事項）：
- segment 核心必須是 generic `Segment<T>`，`utils/segments/core.js` 永不 import 色彩程式碼
- Timeline 拖曳/resize/多選手勢邏輯做成可複用 hook
- raw_data 的 `schemaVersion` envelope 未來可長出 `tracks` 陣列，後端零改動
- audioplayer 拆件（Phase 3）不得把單一 `sourceNode` 假設更深綁進新元件

### 音訊 segment 草案
```js
audioTracks = [
  {
    id, name,
    segments: [
      { id, start, end, sourceFile, sourceOffset, volume, fadeIn, fadeOut },
      ...
    ]
  },
  ...
]
```
與燈光 segment **幾乎同構**，只差 payload 欄位。

### 與目前的距離

單一 `sourceNode` 的假設已經沒有了：引擎現在是一條 clip 時間軸，一次排完整場、
每個 clip 各自一個 gain node、解碼結果逐檔快取（見「播放清單」一節）。所以「一軌
上接續多首歌」已經做好了，缺的只有**多條軌同時混音**——`audioTracks` 是在
`clips` 外面再包一層，把 `setClips` 換成 `setTracks` 並讓 `scheduleFrom` 走每一軌。
clip 的欄位（`sourceOffset` / `gain` / `fadeIn` / `fadeOut`）已經照草案留好了。

### 與後端的關係
- 後端音檔池（`MUSIC_FILE_PATH=/music`）維持不變
- 韌體不關心音訊（只吃 PlayerData），`color` collection 路徑完全不變
- 「專案 ↔ 音軌 ↔ 音檔池」關聯塞進 raw_data 的 v2 envelope（`tracks` 陣列），後端不解析
