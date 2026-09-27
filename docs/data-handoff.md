# 交接資料：新成員需要什麼、怎麼從伺服器打包

這份文件寫給**專案維護者**（有伺服器 SSH 權限的人）。新成員照
[`getting-started.md`](./getting-started.md) 跑起來的環境是一個空的資料庫加上十一首
示範曲，**光靠 repo 就能開發**。這份文件說明哪些額外的資料值得給、哪些絕對不能給，
以及怎麼從正式伺服器上安全地打包出來。

---

## 1. 給什麼、不給什麼

| 項目 | 給不給 | 說明 |
|---|---|---|
| 程式碼、`.env.development`、示範曲 | 不用另外給 | 都在 repo 裡 |
| 光表資料（`color`、`raw_json` 兩個集合） | **建議給** | 真實表演的資料。拿來測手感、測效能（真實光表比合成資料密得多）、看既有的表演 |
| 對應的音樂檔（伺服器上的 `music_file/<帳號>/`） | **建議給** | 光表只記檔名。沒有音檔的話光表載得進來，但沒有波形、不能播 |
| 帳號（`users` 集合） | ❌ **不給** | 還沒登入過新版的帳號，密碼**仍然是明文**（懶惰遷移，見 `CLAUDE.md`；`cd backend && uv run python audit_passwords.py --list` 查得到還剩幾個）。就算全部換成雜湊也不該給。新成員在自己電腦上另建同名帳號就好（`getting-started.md` 第 6.4 節） |
| 伺服器上的 `.env.deployment` | ❌ **不給** | 正式資料庫的 root 帳密、權杖秘鑰 `AUTH_SECRET`、邀請碼 `REGISTER_CODE`。本機開發用 repo 裡的 `.env.development` 就夠了 |
| 伺服器上的 `db/` 資料夾 | ❌ **不給** | 那是 MongoDB 的原始檔案，裡面包含 `users`，而且跟 MongoDB 的版本綁在一起，換一台電腦不一定打得開 |
| 夜間備份 `db/dump_data/mongodb_backup_*` | ❌ **不直接給** | 格式可以用，但裡面有 `users.bson`。用第 3 節的方式重新匯出 |
| 正式站的帳號 | 視需要 | 要在正式站上操作的話，私下給邀請碼讓他自己註冊，不要把你的帳號借他 |

打包的原則是**用白名單，不用黑名單**：明確列出要匯出 `color` 與 `raw_json`，而不是
「匯出全部、排除 `users`」。以後資料庫多了新的集合，白名單不會不小心把它帶出去。
（`frontend/scripts/import-mongo-fixtures.mjs` 的 `ALLOWED_COLLECTIONS` 也是同一個做法。）

---

## 2. 最後會得到什麼

一個檔案 `ld-data-日期.tgz`，解開之後是：

```
ld-dump/
  test/
    color.bson             ← 韌體播放用的資料
    color.metadata.json
    raw_json.bson          ← 編輯器載回來的原始光表
    raw_json.metadata.json
ld-music/                  ← 選用
  eesa1/
    xxx.mp3
  ...
```

新成員拿到之後照 `getting-started.md` 第 6 節匯入。

---

## 3. 在伺服器上打包

以下指令都在**伺服器的 shell** 裡執行。整個過程**只讀取**正式資料，不會修改任何東西。

### 3.1 連上伺服器，找到部署的資料夾

```bash
ssh <你的帳號>@<伺服器位址>
```

確認 MongoDB 容器叫什麼名字：

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
```

用 `docker-compose.prod.yml` 部署的話它叫 **`mongo`**（不是 `mongo-express`）。
下面的指令都假設是這個名字，不一樣的話自己換掉。

**接下來的指令都要在 repo 的根目錄執行**（看得到 `db/`、`music_file/`、`run-deploy.sh`
的那一層，**不是** `db/` 裡面）。不記得 repo 放在哪裡的話，這一行會直接切過去——
它問容器「掛在 `/data/db` 的是主機上哪個資料夾」，然後切到那個資料夾的上一層：

```bash
cd "$(dirname "$(docker inspect mongo --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Source}}{{end}}{{end}}')")"
ls    # 應該看得到 db、music_file、run-deploy.sh
```

⚠️ 不要在 `db/` 裡面操作：那是 MongoDB 自己的資料目錄，後面匯出的 `ld-dump/`
會被複製進去，而且 `music_file/` 在上一層，第 3.4 步會找不到。

### 3.2 先看一下有哪些人、各有幾份光表

```bash
docker exec mongo sh -c 'mongosh \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --quiet test --eval "
    db.color.distinct(\"user\").forEach(u =>
      print(u, db.color.countDocuments({user: u})))"'
```

資料庫的帳號密碼是容器自己的環境變數，**不用手打**，也就不會留在 shell 歷史紀錄裡。
外層的單引號讓 `$MONGO_...` 在容器**裡面**才展開。

用這份清單決定要給全部，還是只給某幾個人的（第 3.3 節有兩種做法）。

### 3.3 匯出光表

**全部使用者：**

```bash
docker exec mongo sh -c 'rm -rf /tmp/ld-dump && for c in color raw_json; do
  mongodump \
    -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db test --collection "$c" --out /tmp/ld-dump || exit 1
done'
```

**只匯出某幾位使用者**（資料量比較小，也不會把不相關的人的作品交出去）：

```bash
docker exec -e Q='{"user":{"$in":["eesa1","eesa2"]}}' mongo sh -c '
rm -rf /tmp/ld-dump && for c in color raw_json; do
  mongodump \
    -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db test --collection "$c" --query "$Q" --out /tmp/ld-dump || exit 1
done'
```

把 `"eesa1","eesa2"` 換成你要的帳號。查詢條件用 `-e Q=...` 傳進去，
是為了避開 `$in` 裡的 `$` 被 shell 當成變數吃掉。

兩種做法都會印出類似 `done dumping test.color (123 documents)` 的訊息。
**如果印出 `0 documents`**，多半是帳號名稱打錯了。

從容器裡複製出來，再清掉容器裡的暫存：

```bash
docker cp mongo:/tmp/ld-dump ./ld-dump
docker exec mongo rm -rf /tmp/ld-dump
```

**確認沒有帶到帳號資料**（這一步不要省）：

```bash
ls ld-dump/test/
test ! -e ld-dump/test/users.bson && echo "OK: 沒有 users"
```

只應該看到 `color` 與 `raw_json` 開頭的四個檔案，新版的 `mongodump` 還會多一個
`prelude.json`（只記錄工具版本與匯出設定，沒有使用者資料）。

### 3.4 收集音樂檔（選用）

先看看有哪些、多大：

```bash
du -sh music_file/*
```

把要給的人的資料夾**整個**複製出來（帳號那一層要留著）：

```bash
mkdir -p ld-music
cp -r music_file/eesa1 music_file/eesa2 ld-music/
ls ld-music                       # 應該看到 eesa1/ eesa2/，不是一堆 mp3
```

⚠️ 不要寫成 `cp music_file/eesa1/* ld-music/`。後端讀音樂的路徑是
`music_file/<帳號>/<檔名>`，少了帳號那一層，對方照著上手文件放好之後編輯器會找不到音樂，
而且對方也無從得知那些歌是誰的。

遇到 `Permission denied` 的話（檔案是容器用 root 身分寫的），在 `cp` 前面加 `sudo`，
然後 `sudo chown -R $USER ld-music` 把擁有者改回自己。

⚠️ 音樂裡有商業歌曲。只給需要的人，而且不要放到任何公開的地方。

### 3.5 打包並清掉伺服器上的暫存

```bash
tar czf ld-data-$(date +%Y%m%d).tgz ld-dump ld-music   # 沒有收音樂的話拿掉 ld-music
ls -lh ld-data-*.tgz
rm -rf ld-dump ld-music
```

先不要登出，下一步下載完再回來刪掉 `.tgz`。

---

## 4. 下載到自己的電腦

在**你自己的電腦**上開一個新的終端機（Windows 的 PowerShell 也有內建 `scp`）：

```bash
scp <你的帳號>@<伺服器位址>:<repo 在伺服器上的路徑>/ld-data-20260924.tgz .
```

SSH 不是 22 埠的話加 `-P <埠號>`（大寫 P）。

下載完回到伺服器那個視窗，把打包檔刪掉：

```bash
rm ld-data-*.tgz
```

---

## 5. 交給新成員

- 用**只限特定人存取**的方式傳（例如 Google Drive 分享給指定帳號），不要用公開連結，
  也**不要 commit 進 git**。這個 repo 是公開的，而這份資料裡有其他同學的作品和商業歌曲。
- 附上兩件事：
  1. [`getting-started.md`](./getting-started.md) 第 6 節（匯入步驟）
  2. **資料包裡有哪些帳號名稱**（第 3.2 節印出來的那份清單）。新成員要在本機建同名帳號
     才看得到那個人的光表，編輯器只列登入者自己名下的東西。

repo 的 `.gitignore` 已經排除了 `ld-dump/`、`ld-music/`、`ld-data-*.tgz`，
就算有人在 repo 根目錄解壓縮，這些檔案也不會被 `git add .` 帶進去。

---

## 6. 出問題時

| 症狀 | 原因與處理 |
|---|---|
| `Authentication failed` | 容器的環境變數跟資料庫實際的 root 密碼對不上。MongoDB 只在**第一次建立資料庫時**讀那組環境變數，之後改 `.env.deployment` 不會改到資料庫裡的密碼。改成手動輸入：把 `docker exec` 改成 `docker exec -it`，並把 `-p "$MONGO_INITDB_ROOT_PASSWORD"` 整段拿掉——只給 `-u` 的話它會提示你輸入密碼（不顯示、不留紀錄；匯出兩個集合會問兩次） |
| `mongodump: not found` | 選到的不是 MongoDB 容器（例如 `mongo-express`）。回第 3.1 節重新確認名字 |
| `docker: permission denied` | 你的帳號不在 `docker` 群組。每一行 `docker` 前面加 `sudo` |
| 匯出來是 `0 documents` | 帳號名稱打錯，或 `-e Q=...` 的引號被改壞了。先用第 3.2 節的指令確認名稱 |
