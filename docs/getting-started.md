# 在一台全新的電腦上把開發環境跑起來

這份文件寫給第一次接觸這個專案的人。照著做完，你會在自己的電腦上得到：

| 網址 | 是什麼 |
|---|---|
| http://localhost:3000 | 編輯器（改前端程式碼存檔就會自動重新整理） |
| http://localhost:8000/docs | 後端 API 文件（FastAPI 自動產生，可以直接在頁面上試打） |
| http://localhost:8081 | 資料庫管理介面（mongo-express，可以直接看 MongoDB 裡的資料） |

登入帳號是 **`testuser` / `testpassword`**（開發用的種子帳號，只存在你自己的電腦上）。

整個環境跑在 Docker 裡：前端、後端、資料庫各是一個容器。你**不需要**在自己電腦上
裝 Python、MongoDB，連 Node.js 都只有要跑測試時才需要。可以把 Docker 想成「把編譯器、
函式庫、執行環境一起打包好的交叉編譯工具鏈」——大家用同一套，就不會有「我這邊可以跑」
的問題。

---

## 1. 要先裝的東西

| 軟體 | 用途 | 必要？ |
|---|---|---|
| [Git](https://git-scm.com/) | 抓程式碼。**Windows 版會附帶 Git Bash**，下面的 `.sh` 腳本要用它來跑 | 必要 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 跑整個環境。Windows 安裝時請選 **WSL 2** 後端 | 必要 |
| [Node.js 20 以上](https://nodejs.org/) | 只有要跑前端測試（`npm test` / `npm run e2e`）時才需要 | 選用 |
| [uv](https://docs.astral.sh/uv/) | 只有要跑後端測試時才需要 | 選用 |

裝完 Docker Desktop 之後**打開它**，等左下角顯示 Engine running。開一個終端機確認：

```bash
docker --version
docker compose version
```

兩個都有印出版本號就可以往下走。

> **Windows 使用者**：下面所有 `./xxx.sh` 的指令請在 **Git Bash** 裡執行（開始功能表搜尋
> 「Git Bash」）。PowerShell 跑不了 `.sh` 檔。
>
> **Linux 使用者**：如果 `docker` 指令要 `sudo`，請把自己加進 `docker` 群組
> （`sudo usermod -aG docker $USER`，然後登出再登入）。

---

## 2. 抓程式碼

```bash
git clone <repository-url> lightdance
cd lightdance
```

repo 裡有十一首示範用的音樂（`frontend/src/components/audio/musicsrc/`，約 100 MB），
所以第一次 clone 會比一般專案久一點。

> 如果你是在 **WSL 的 bash**（不是 Git Bash）裡操作，clone 之前先下
> `git config --global core.autocrlf input`。否則 Windows 的換行符號會讓 `.sh` 腳本
> 出現 `$'\r': command not found`。Git Bash 沒有這個問題。

---

## 3. 啟動

```bash
./start-dev.sh
```

⚠️ **這支腳本一開始會停掉你電腦上「所有」正在跑的 Docker 容器**，不只是這個專案的。
如果你有其他專案的容器在跑，請先存好它們的工作。

**第一次啟動會比較久**（大約 3～10 分鐘，看網路速度）：要下載 Node、Python、MongoDB
的映像檔，建置後端，還要在容器裡跑一次 `npm install`。腳本最多會等 10 分鐘。之後再啟動
就只要幾十秒。

看到這段就代表成功了：

```
🎉 全端開發環境已成功啟動！
```

打開 http://localhost:3000 ，用 `testuser` / `testpassword` 登入。

**停止**：在跑腳本的那個終端機按 `Ctrl+C`。

### 腳本跑不起來時

`start-dev.sh` 做的事就只是下面這一行。腳本有問題時可以自己下（這行在 PowerShell
裡也能跑）：

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development up --build
```

停止用：

```bash
docker compose -f docker-compose.dev.yml --env-file .env.development down
```

---

## 4. 確認每一個部分都正常

| 檢查 | 預期結果 |
|---|---|
| `docker compose -f docker-compose.dev.yml ps` | 四個容器（`frontend-dev`、`backend-dev`、`mongo-dev`、`mongo-express-dev`）都是 `Up`，而且 `mongo-dev` 的時間**不會一直歸零**（一直歸零代表它在反覆重啟，見第 7 節） |
| 打開 http://localhost:8000/api/ | 回傳 `{"Hello":"World"}` |
| 登入 http://localhost:3000 | 進得去編輯器，看得到七套光衣和時間軸 |
| 在編輯器選一首示範曲 | 波形畫得出來、按空白鍵會播放 |
| 放一個色塊，按 Output | 沒有跳出錯誤，而且 http://localhost:8081 裡 `test` → `color` 多了一筆 |

五項都過，環境就沒有問題了。

---

## 5. 資料存在哪裡

| 資料 | 位置 | 備註 |
|---|---|---|
| 資料庫 | repo 裡的 `db/` 資料夾 | 已經 gitignore。**刪掉它等於清空資料庫**，下次啟動會重新建立 `testuser` |
| 上傳的音樂 | repo 裡的 `music_file/<帳號>/` | 已經 gitignore |
| 示範音樂 | `frontend/src/components/audio/musicsrc/` | 在版控裡，不用後端也能播 |
| 編輯中的光表 | 瀏覽器的 IndexedDB | 換瀏覽器或清除網站資料就不見了；按 Output 才會存進資料庫 |

⚠️ **種子帳號 `testuser` 只會在 `db/` 是空的時候建立一次**（`mongo-init/01-init-data.js`）。
如果你是從別人那裡複製了整個 `db/` 資料夾，那個帳號就不會存在，登入會失敗。
**不要直接複製別人的 `db/` 資料夾**。要真實資料的話走第 6 節的匯入流程。

---

## 6.（選用）匯入真實的光表與音樂

剛裝好的資料庫是空的。想用真實的表演資料來開發（測手感、測效能、看既有的表演長什麼樣），
請跟專案維護者要一份資料包。資料包是一個 `ld-data-日期.tgz` 檔，打包方式寫在
[`data-handoff.md`](./data-handoff.md)。

拿到之後**先啟動環境**（第 3 節），然後在 repo 根目錄開 **Git Bash**（Windows）或一般終端機
（macOS / Linux）執行下面的步驟。

> 為什麼 Windows 一定要用 Git Bash：下面的指令在單引號裡面包了雙引號，
> Windows PowerShell 5.1 傳參數給外部程式時會把內層的雙引號吃掉，指令會用奇怪的方式失敗。

### 6.1 解開資料包

```bash
tar xzf ld-data-20260924.tgz      # 換成你拿到的檔名
ls ld-dump/test                   # 應該看到 color.bson、raw_json.bson 等檔案
```

### 6.2 還原資料庫

```bash
docker cp ld-dump mongo-dev:/tmp/ld-dump

docker exec mongo-dev sh -c 'mongorestore \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --drop --nsInclude "test.*" /tmp/ld-dump'

docker exec mongo-dev rm -rf /tmp/ld-dump
```

- 帳號密碼是容器自己的環境變數，不用手打（單引號讓 `$...` 在容器**裡面**才展開）。
- `--drop` 會先清掉資料包裡有的那幾個集合（`color`、`raw_json`）再寫入。
  **帳號（`users`）不在資料包裡，所以不會被動到**，`testuser` 照樣能登入。

### 6.3 放音樂

資料包裡如果有 `ld-music/` 資料夾（裡面一個帳號一個資料夾），把它的內容複製到 repo 的
`music_file/` 底下：

```bash
mkdir -p music_file
cp -r ld-music/* music_file/
```

不用重新啟動，後端是直接讀那個資料夾的。

### 6.4 建立對應的帳號

光表和音樂都是跟著帳號名稱存的，而編輯器**只看登入者自己的**：Dashboard 只列出
登入者名下的光表，音樂也只從 `music_file/<登入者>/` 讀。所以用 `testuser` 登入是
看不到 `eesa1` 的光表的。

要看某位使用者（例如 `eesa1`）的光表，就在本機建一個同名的帳號，
**密碼沿用 `testpassword`**：

```bash
docker exec mongo-dev sh -c 'mongosh \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet test --eval "
    db.users.insertOne({
      username: \"eesa1\",
      password: db.users.findOne({username: \"testuser\"}).password,
      disabled: false
    })"'
```

這段是把 `testuser` 的密碼雜湊複製一份給新帳號，所以兩個帳號的密碼一樣。
這個帳號只存在你的電腦上，跟正式伺服器上那個帳號的真正密碼無關。

### 6.5 用完之後

資料包裡是其他同學的創作，還有商業歌曲。**不要 commit 進 git**（這個 repo 是公開的），
解開的 `ld-dump/`、`ld-music/` 和 `.tgz` 用完就刪掉：

```bash
rm -rf ld-dump ld-music ld-data-*.tgz
```

---

## 7. 常見問題

| 症狀 | 原因與處理 |
|---|---|
| `Docker 未在運行中` | Docker Desktop 沒開，或開了但 Engine 還在啟動。等左下角顯示 running |
| `port is already allocated` | 3000 / 8000 / 8081 / 27017 被別的程式佔住。Windows 用 `netstat -ano \| findstr :3000` 找出 PID；macOS / Linux 用 `lsof -i :3000` |
| 登入時出現 500 | 幾乎都是 MongoDB 在反覆重啟（Windows + WSL 上的檔案權限問題）。照 [`troubleshooting-login-500.md`](./troubleshooting-login-500.md) 處理 |
| 登入時出現 `Incorrect username or password` | `db/` 不是空的時候種子帳號不會建立（見第 5 節）。確定裡面沒有要留的資料的話，先停止環境，刪掉 `db/` 再啟動 |
| 編輯器一直載入不了、一直被彈回首頁 | 開發伺服器的狀態亂掉了，不是程式碼的問題。`docker compose -f docker-compose.dev.yml restart frontend-dev` |
| 前端一直顯示舊的畫面／套件版本不對 | 容器裡的 `node_modules` 快取過時了：`docker volume rm lightdance_frontend_node_modules`，再啟動一次 |
| 建立帳號時說「這個站台沒有開放自行註冊」 | 預設就是關閉的。本機要開的話：`REGISTER_CODE=隨便一個字串 ./start-dev.sh`，註冊時填同一個字串 |
| 改了 `.env.development` 沒效果 | 環境變數只在容器建立時讀一次，要停掉再啟動 |

看日誌的方法：

```bash
docker compose -f docker-compose.dev.yml logs -f              # 全部
docker compose -f docker-compose.dev.yml logs -f backend      # 只看後端
docker compose -f docker-compose.dev.yml logs mongo --tail=50 # 資料庫最後 50 行
```

---

## 8.（選用）跑測試

改程式碼之前最好先確認測試在你的電腦上是全綠的，這樣之後紅了就知道是自己改出來的。
這一節要用到主機上的 Node.js 20+ 和 uv。

### 前端單元測試

```bash
cd frontend
npm install          # 裝在主機上，跟容器裡那份 node_modules 是分開的
npm test
```

### 瀏覽器驗收（e2e）

測試腳本會攔截所有 `/api` 請求並回傳假資料，所以**只需要前端在 3000 埠上跑著**，
Docker 環境開著就可以了：

```bash
cd frontend
npx playwright install chromium   # 只有第一次要
npm run e2e                       # 功能驗收
npm run audit:layout              # 版面稽核
npm run audit:bundle              # JS 大小預算（自己會 build，不需要 3000 埠）
```

截圖會存在 `frontend/e2e/shots/`。

⚠️ 不要在主機上用 `npm run dev` 當日常開發環境。`vite.config.js` 把 `/api` 轉發到
`http://backend:8000`，那是 Docker 內部網路才認得的名字，在主機上會連不到後端。
日常開發用第 3 節的 Docker 環境就好。

### 後端測試

```bash
cd backend
uv sync
uv run pytest
```

---

## 9. 接下來讀什麼

1. [`README.md`](../README.md)：資料模型為什麼是「色塊」而不是「關鍵格」，這一點先搞懂，
   後面大半的程式碼才看得懂
2. [`data-flow-pipeline.md`](./data-flow-pipeline.md)：按下 Output 之後資料怎麼變成韌體的格式
3. [`shortcuts.md`](./shortcuts.md)：編輯器的快捷鍵
4. 根目錄的 `CLAUDE.md`：每個模組的設計理由和踩過的坑，改哪一塊之前先讀那一節
