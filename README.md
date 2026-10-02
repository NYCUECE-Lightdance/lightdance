# LightDance

NYCU 電機系的燈光舞蹈編排系統。七位舞者身上各穿一套 LED 光衣，每套 22 個可獨立控制的部位，這個 Web 應用程式就是用來畫出「第幾秒、哪個人、哪個部位、什麼顏色」的那張表，然後把它壓平成韌體吃得下的格式送進 MongoDB。

## 先看這個：怎麼跑起來

需要 Docker 與 Git，其餘什麼都不用裝。全新電腦從零開始的完整步驟（Windows 要用 Git Bash、
第一次啟動要等多久、怎麼匯入真實的光表、常見問題）在 [`docs/getting-started.md`](docs/getting-started.md)。

```bash
git clone <repository-url>
cd lightdance
./start-dev.sh
```

跑起來之後用 `testuser` / `testpassword` 登入。編輯器在 [localhost:3000](http://localhost:3000)，API 文件在 [localhost:8000/docs](http://localhost:8000/docs)，資料庫管理介面在 [localhost:8081](http://localhost:8081)。要停就 Ctrl+C，或另開一個終端機下 `docker compose -f docker-compose.dev.yml down`。

`start-dev.sh` 做的事情就是帶著 `.env.development` 去跑 `docker compose up --build`，所以腳本壞掉時你可以自己下：

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development up --build
```

## 這東西實際上在做什麼

使用者在瀏覽器裡對著七套光衣點顏色，每一次點擊都會在對應部位的時間軸上放一個**色塊**。色塊有起點、終點、起始色與結束色，中間可以線性漸變。表演的完整資料就是一個三層結構：`actionTable[舞者][部位][色塊清單]`。

按下 Output 的時候，前端把這張表壓平成韌體的格式再上傳。壓平的規則是**每 50ms 一格**（`TICK_MS`），每一列包含一個時間格號與 22 個部位的顏色，顏色打包成 32-bit 整數：

$$\text{packed} = (R \ll 24)\ |\ (G \ll 16)\ |\ (B \ll 8)\ |\ ((\alpha_7 \ll 1)\ |\ \text{linear})$$

最低那一個 bit 是漸變旗標，往上七個 bit 是亮度。所以一列就是 `time` 加上 22 個欄位，**欄位順序就是韌體的 ABI**——`constants/parts.js` 裡 `PART_KEYS` 的順序不可以隨便調換，韌體那端是照位置解的。這件事有 golden test 鎖著，改到會直接紅燈。

上傳一次會同時寫兩個 collection：`color` 存壓平後的播放資料給韌體讀，`raw_json` 存編輯器的原始 JSON 供下次載入。後端只負責收下來存進去，不解析內容。

## 資料模型：為什麼是色塊而不是關鍵格

這是整個專案最值得先搞懂的一件事，因為它解釋了程式碼裡大半的設計。

最初的模型是「關鍵格 + 黑色哨兵」：時間軸上存的是一連串 `{time, color}` 的點，燈就從一個點的顏色一路亮到下一個點。問題是這樣沒辦法表達「這塊到這裡結束，不要漸變到下一段」——唯一的辦法是在結束前 10ms 硬塞一個純黑的點當作句號。

那個 10ms 的黑點滲透到所有地方。放色要判斷前後鄰居是不是黑的才知道要補幾個哨兵，那段五分支的邏輯被複製了四份；鍵盤導航要「自動跳過黑色」否則會選到句號；拖曳一個色塊得同步搬移兩到 N 個點加上鄰居的黑點；還得有 `removeDuplicateBlackBlocks` 這種函式定期打掃。根因是**資料形狀沒有把色塊的邊界寫出來**，整份程式碼都在從「點的序列加上鄰居是不是黑色」反推色塊在哪裡。

現在的模型直接把色塊當成一級物件：

```js
actionTable[armor][part] = [
  { id, start, end, colorStart, colorEnd, linear },
  ...
]
```

段與段之間**可以有間隔，間隔就是熄滅**。黑色不再是資料，只是「這裡沒有段」的渲染結果。壓平回韌體格式時，空隙前會在網格整點補一個黑點——所以韌體看到的東西完全沒變，這件事有一整組等價測試在守。

每個色塊有穩定的 `id`。這點很重要：先前用陣列索引當識別，連續踩了三次同一類 bug——索引在鄰居被刪除或色塊被切開時會指向別人，而且不會報錯，只會靜靜地選錯東西。

## 架構

開發與生產的路由方式不一樣，這點常常搞混人。開發時 Vite dev server 跑在 3000，`/api` 由它 proxy 到 8000 的 FastAPI；生產時 Nginx 吃 80，靜態檔案直接由它服務，`/api` 才轉發給後端。

```
開發：瀏覽器 → Vite (3000) ──/api proxy──→ FastAPI (8000) → MongoDB (27017)
生產：瀏覽器 → Nginx (80) ──/api 轉發──→ FastAPI (8000) → MongoDB (27017)
                    └── React build 的靜態檔案
```

`docker-compose.dev.yml` 起四個服務：`frontend-dev`、`backend`、`mongo`、`mongo-express`。前後端都掛了 volume 做熱重載，改程式碼不用重建 image。

前端的狀態放在 Redux，並用 redux-persist 存進 IndexedDB。persist 設了 `serialize: false`——光表資料很大而且含 `Float32Array`，走 JSON 序列化每次編輯要 73ms，關掉之後剩 0.5ms。另外有一份走 localforage 的本地備份，30 天自動清理。

## 目錄裡有什麼

前端的 `src/components/audio/` 是編輯器的主體。`audioplayer.jsx` 現在只是外殼（狀態容器加版面組合），有快捷鍵的功能一律拆成 hook 放邏輯、元件放 UI，這樣按鈕和鍵盤共用同一組函式，不會出現「按鈕修好了但快捷鍵還是舊行為」。`hooks/useKeyboardShortcuts.js` 是全站唯一的 keydown 註冊點。

`src/utils/audio/` 是音訊的核心，同樣一個檔案一件事：`peaks.js` 算波形峰值、`clock.js` 是「現在播到第幾毫秒」的唯一算法、`clips.js` 是播放清單的形狀與不變式、`engine.js` 收掉所有 Web Audio 狀態。`engine.js` **刻意不是 hook 也不認得 React**——這樣才能拿一個假的 AudioContext 在 jsdom 裡驗排程，而「你把這個 source 排在第幾秒」在真瀏覽器裡問不到。

`src/utils/segments/` 是資料模型的核心。`core.js` 刻意不 import 任何跟顏色有關的東西——長期目標是讓音軌也用同一套段落模型做多軌剪貼，所以核心必須對 payload 無知。`convert.js` 是新舊格式的雙向轉換器，載入舊資料時會用到。

`src/styles/tokens.css` 是全站**唯一**可以出現寫死顏色的地方，其他 CSS 一律 `var()` 引用。有測試掃描所有 CSS 把違規的抓出來，目前是 0 處。這條規則的理由很現實：在收斂之前 14 個 CSS 檔裡有 287 個寫死的顏色值、同一個灰有 25 個副本，想把背景調暗一階要改 25 個地方，漏一個就花掉。

後端的 `backend/main.py` 負責「收到請求之後做什麼」，資料怎麼存在 `storage.py`、登入與權杖在 `auth.py`、檔案路徑的防線在 `paths.py`，Pydantic 模型在 `models.py`。`backend/` 底下另外有一組 MongoDB 備份腳本，`BACKUP_README.md` 有完整說明。

## 依負責範圍，從哪一個檔案讀起

先讀完這份 README 的資料模型，再依自己負責的範圍挑一份。每一份開頭都寫了它為什麼存在、以前壞過什麼：

| 範圍 | 先讀 | 讀完會知道 |
|---|---|---|
| 3D 模型 | `docs/3d-armor-plan.md` | 用 3D 取代平面人像已經拍板的決定，以及換掉之後哪些東西必須保留（22 個部位的對應、點部位選軌、播放時取色） |
| 日常維修 | `frontend/src/components/audio/audioplayer.jsx` | 編輯器的每個功能從哪裡接進來、每個快捷鍵對到哪個函式——使用者回報問題時從這裡找得到該修哪個檔案 |
| 渲染與效能 | `frontend/src/utils/audio/engine.js` | 音訊的解碼快取與回收、多首歌怎麼無縫接起來、為什麼它刻意不是 React hook |
| 複製貼上、跨軌 | `frontend/src/utils/segments/clipboard.js` | 貼上的落點怎麼算（跨軌的座標平移、跑馬燈相位、舞者沒有的部位不准貼） |
| 拖曳、吸附、節拍 | `frontend/src/utils/segments/gestures.js` | 拖曳與 resize 能移多遠的唯一答案，以及網格對齊（`tick` 參數）在哪裡——吸附要從這裡延伸 |
| 資料庫 | `backend/storage.py` | 一份光表存進去長什麼樣、索引、為什麼 `update_time` 不能改 UTC、為什麼兩個集合要成對寫入 |
| 部署與資安 | `docker-compose.prod.yml` | 正式環境的秘密怎麼流進容器、哪些埠對外開放 |

改到哪個模組之前，再去 `CLAUDE.md` 讀對應的那一節——它很長，不適合從頭讀，但每一節都記了那個模組踩過的坑。

## 驗收

檢查分兩層，放在哪一層的判斷標準是：**把整個編輯器的畫面重做、功能全部改掉，這項檢查會不會因此變紅？**

**第一層：CI，每個 PR 自動跑，失敗就不能合併**（`.github/workflows/ci.yml`）。只放不管功能怎麼改、失敗都代表真的壞了的東西：建不起來、未定義的變數或 hook 用錯順序、上傳給韌體的格式變了、權杖驗證或路徑穿越的防線被削弱。改功能或改介面不會讓它變紅——CI 一有誤報，大家很快就學會無視紅叉。

```bash
cd frontend && npm run lint && npm run test:contract && npm run build
cd backend  && uv run ruff check . && uv run pytest tests/test_auth.py tests/test_paths.py
```

**第二層：完整驗收，在 GitHub 的 Actions 頁面手動觸發，不擋合併**（`full-check.yml`）。這些寫死了「現在的功能與畫面」，大改版之後變紅是正常的，代表測試要跟著改。發 dev → main 的 PR（也就是部署）之前跑一次。

單元測試跑 vitest，分成 node 環境的純函式與 jsdom 環境的元件冒煙測試：

```bash
cd frontend
npm test          # 782 項
cd backend && uv run pytest    # 全部後端測試
```

但 jsdom 沒有版面也送不出真實的鍵盤事件序列，所以另外有兩支 Playwright 腳本補這一段。它們把 `/api/**` 全部攔截回假資料，**後端不用跑**：

```bash
npm run dev            # 另一個終端機
npm run e2e            # 81 項功能驗收
npm run audit:layout   # 版面稽核（5 項）
npm run audit:bundle   # 初始 JS 的大小預算（自己跑一次 build，不需要 dev server）
```

這兩支不是裝飾。實測抓到過單元測試全綠但實際完全不能用的東西：Ctrl+數字被防彈跳吃掉（因為 `Control` 自己那一下 keydown 佔掉了名額，所有 Ctrl+數字在瀏覽器上按不動，但 jsdom 測試直接送最終那一下所以全過）、按鈕階層被 Bootstrap 的 `.btn` 蓋掉、17 則工具提示有 12 則被 `overflow` 裁光——被裁掉的提示不會報錯，hover 就是什麼都不出現。

版面稽核問瀏覽器五個問題：每個可互動元素的中心點 `document.elementFromPoint()` 回傳的是不是它自己（不是就代表被蓋住，使用者點不到），有沒有元素溢出容器，有沒有提示或標籤被祖先的 `overflow` 裁掉**或被折行**，成對的元素有沒有對齊（包含左側軌名列與右側時間軸的**逐列**比對——那一項偏掉的話捲到下面軌名就對到隔壁那條軌，而畫面上完全看不出來），以及各塊的邊緣與各排內容的左緣有沒有對齊。1600×950 與 1280×800 各跑一次。

`audit:bundle` 守的是另一個只會往上爬的數字：開編輯器要下載多少 JS。曾經爬到 1817 KB，其中 746 KB 是 `/model` 那一頁的 3D 函式庫——排燈的人從頭到尾不會打開那一頁。切成路由層 lazy 之後是 475 KB，超過預算就 exit 1。

如果跑 e2e 時看到「編輯器一直載入不了」或「一直被彈回首頁」，**先重開 `npm run dev` 再判斷**。連續改一堆 CSS 之後 vite 的 HMR 狀態會累積到 `/home` 載不起來，那是開發伺服器的問題不是程式碼的問題。

## 要改人數或部位清單的話

只需要改 `frontend/src/constants/parts.js`。改人數就是改 `PLAYER_COUNT` 一個數字，初始光表、舞者顯示開關、全選欄位、要渲染幾套光衣全部由它推導；改部位就是在 `PARTS` 增刪一列。

有三件事不會自動跟上，`constants/__tests__/partsConfig.test.js` 會在改壞時指出是哪一項：韌體 ABI（`PART_KEYS` 的順序就是上傳每一列的欄位順序，韌體那端要同步改），光衣圖形（幾何在 `config/armorShapes.js`，一張表、索引就是身體部位索引，新增部位要自己補一列座標），以及飾品索引（`config/accessoryConfig.js` 的 `indices` 會隨身體部位增減而位移）。

## 常用指令

```bash
docker compose -f docker-compose.dev.yml ps            # 服務狀態
docker compose -f docker-compose.dev.yml logs -f       # 即時日誌
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml exec backend sh
docker volume rm lightdance_frontend_node_modules      # 清前端快取
./run-deploy.sh                                        # 生產環境部署
cd backend && ./mongo-backup.sh                        # 手動備份資料庫
```

## 常見問題

連接埠被占用就用 `lsof -i :3000`（前端）、`:8000`（後端）、`:27017`（資料庫）找出來是誰，或者去 `.env.development` 改掉。前端編譯出怪錯誤通常是 node_modules 的 volume 髒了，停掉之後 `docker volume rm lightdance_frontend_node_modules` 再啟動。

登入拿到 500 的話是 MongoDB 連線問題，`docs/troubleshooting-login-500.md` 有完整的排查 SOP，不要瞎猜。

## 安全性

原本那四個洞已經補掉了。密碼改成 bcrypt（cost 12），舊的明文在**登入成功的當下就地換成雜湊**，所以不停機、不用遷移腳本、沒有人被鎖在外面——代價是你不知道什麼時候遷移完，`backend/audit_passwords.py --list` 可以查（唯讀，只印帳號名稱）。權杖改成 HS256 簽章的 JWT；先前的權杖**就是使用者名稱**，也就是送 `Authorization: Bearer <某個帳號名>` 就通過，密碼完全不需要——帳號名稱不是秘密，所以那不是「權杖不夠強」，是整條驗證等於不存在。CORS 收到 `CORS_ORIGINS` 環境變數。另外修掉三支音樂端點的路徑穿越（`/api/get_music/%2e%2e/secret.txt` 實測回 200 並吐出音樂根目錄外面的檔案，而且連登入都不用），防線收在 `backend/paths.py`。

正式部署時有兩個環境變數不能漏：`AUTH_SECRET`（`docker-compose.prod.yml` 設了 `REQUIRE_AUTH_SECRET=1`，漏設會**啟動失敗**而不是臨時產生一把，因為後者的症狀是每次重啟把所有人登出，看起來像網站不穩），以及 `REGISTER_CODE`（沒設不是開放註冊而是**關閉**註冊，`/api/register` 回 503）。這兩個都是同一個原則：漏設一個環境變數的後果不該是最寬鬆的那個狀態。

⚠️ **`.env.deployment` 裡那組 MongoDB root 帳密曾經被 commit 進這個 public fork。** 檔案已經移出版控，但**移出版控不等於收回**——git 歷史、GitHub 的 fork 與快取都還在，那組密碼必須換掉。同理，`db/dump_data/**/users.bson` 裡有七組帳號的明文密碼，那個檔案永遠不得 commit、不得 import 進測試 fixture（`frontend/scripts/import-mongo-fixtures.mjs` 的白名單只允許 `raw_json` 與 `color`，不要繞過）。

還沒處理的：

- **那組外洩的密碼還寫在兩個被追蹤的檔案裡**：`.env.development` 與 `backend/.env.local` 的 `root` / `nycuee`。正式環境換掉密碼之前，這兩個檔案等於還在公開它。
- **正式環境的資料庫管理介面不用登入**：`docker-compose.prod.yml` 的 mongo-express（8081）設了 `ME_CONFIG_BASICAUTH: false`，而且用 root 帳密連資料庫；後端的 8000 也直接對外開放、繞過 Nginx。從校外連不到，校內連不連得到要確認。
- `frontend/src/components/audio/musicsrc/` 有一首商業歌曲，而這個 repo 是公開的（`todo.md` 的 B4）。
- 其他端點的輸入驗證（上傳 payload 的內容、query 參數的範圍，`todo.md` 的 C3b）。

## 輸出前的把關

有一類錯是這個專案最怕的：**壞掉時畫面上完全看不出來**。最典型的是「燈亮在不存在的道具上」——跨軌貼上的落點是 `(舞者, 部位)` 的座標差推出來的，所以把七位舞者的道具燈一起複製、往下貼一格，資料就會落在根本沒帶那件道具的人身上。編輯器裡看得到色塊、上傳成功、版本清單正常，只有演出當天那盞不存在的燈不會亮，而且沒有人查得出原因。

所以貼上的落點、拖曳換軌的目標、以及最後壓平成韌體格式的那一步，三個地方都會問 `isPartAllowed`。擋掉幾條會跳提示——擋掉而不講的話，畫面上只是「怎麼少了幾條」。細節與那三道防線各自的陷阱寫在 CLAUDE.md 的「輸出前的把關」一節。

## 文件

`docs/` 底下依主題分開放，索引在 `docs/README.md`。第一次上手看 `getting-started.md`，從編輯器到資料庫的完整資料流看 `data-flow-pipeline.md`，前端效能與渲染細節看 `frontend-rendering-optimization.md`，UI 設計系統的決策與施工回顧看 `ui-design-plan.md`，鍵盤快捷鍵看 `frontend/public/shortcuts.md`（編輯器裡按 Shortcuts 按鈕看到的就是這一份），MongoDB 備份與 Docker 操作看 `backend-management.md`。

## 開發流程

各自在自己的分支上開發，PR 到 `dev`；`dev` 穩定之後再 PR 到 `main`。**合併進 `main` 就會自動部署到正式伺服器**（`.github/workflows/deploy.yml`：Tailscale → SSH → `run-deploy.sh`），也可以在 Actions 頁面手動觸發。`run-deploy.sh` 在動到任何東西之前會先檢查 `AUTH_SECRET` 與網站目錄的寫入權限，不過就停下來，這時正式站還是舊版、照常運作。

commit message 的第一行用類型前綴：`[feat]:`、`[fix]:`、`[docs]:`（半形括號，緊接冒號）。

寫程式碼的時候註解用中文、命名用英文，而且註解要說明**為什麼**這樣做，不要複述程式碼在做什麼。品質的優先順序是可讀性 > 可維護性 > 可擴展性 > 簡潔。
