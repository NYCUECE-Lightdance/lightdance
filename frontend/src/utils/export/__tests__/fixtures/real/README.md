# 真實資料 Fixtures

這個目錄放**真實 production 光表**匯出的測試資料。放進來的 `.json` 會被
`fixtures/index.js` 自動載入，成為 golden 測試的一部分。

合成 fixture（`../synthetic.js`）保證邊界覆蓋，但只有真實資料能保證我們沒有
漏掉現場才會出現的資料形狀。**keyframe → segment 重構前，這裡至少要有每位
production 使用者各一筆。**

## 檔案格式

```json
{
  "name": "real-2026-show-dancer-all",
  "description": "2026 成發完整光表，含頻閃與漸變",
  "actionTable": {
    "0": {
      "0": [
        { "time": 0, "color": { "R": 0, "G": 0, "B": 0, "A": 1 }, "linear": 0 }
      ]
    }
  }
}
```

`name` 與 `description` 可省略（會用檔名代替）。**只需要 `actionTable`**，不要
放 `music_filename` 以外的個資或 token。

## 方法一：從瀏覽器本機備份匯出（推薦）

編輯器每次按 Output 都會在 IndexedDB 留一份備份。在**已載入光表的編輯器分頁**
打開 DevTools Console，貼上：

```js
// 列出所有本機備份
const store = localforage.createInstance({
  name: "LightDanceBackupDB",
  storeName: "backups",
});
await store.keys();

// 匯出指定一筆（把 KEY 換成上面列出的 key）
const backup = await store.getItem("KEY");
const fixture = {
  name: "real-請改成有意義的名字",
  description: "請描述這份光表",
  actionTable: backup.data.actionTable,
};
copy(JSON.stringify(fixture, null, 2)); // 已複製到剪貼簿，貼成 .json 檔即可
```

若 console 沒有 `localforage` 全域變數，改用原生 IndexedDB 或直接在
Application → IndexedDB → LightDanceBackupDB 面板複製內容。

## 方法二：從 MongoDB 撈 raw_json

⚠️ **不要用 `/api/raw/{user}/LATEST`** — 該端點目前查錯 collection
（`backend/main.py:243` 查的是 `collection_color`），回傳的資料沒有 `raw_data`。
請用明確 timestamp：

```bash
# 先列出可用的時間戳
curl -s http://<host>/api/timelist/<username> | jq '.list[].update_time'

# 用明確 timestamp 取 raw_data，抽出 actionTable
curl -s http://<host>/api/raw/<username>/<update_time> \
  | jq '{name: "real-<username>-<update_time>", description: "mongo raw_json", actionTable: (.raw_data | fromjson | .actionTable)}' \
  > real-<username>.json
```

## 方法三：從 mongodump 備份匯入（已內建工具）

若手上有 `mongo-backup.sh` 產生的備份目錄（含 `raw_json.bson` / `color.bson`）：

```bash
cd frontend

# 1. 列出備份中所有光表與形狀統計，用來挑選
node scripts/import-mongo-fixtures.mjs --dump <mongodump目錄> --list

# 2. 匯出（--with-color 會一併存下當時餵給韌體的輸出，供端到端測試比對）
node scripts/import-mongo-fixtures.mjs --dump <mongodump目錄> \
  --pick "<帳號>@<時間戳>" --name real-rich-show --with-color
```

**帳號名稱預設會匿名化**成 `userA` / `userB` / …（本目錄現有的三筆即是）。
理由：fixture 會進入公開 repo，而帳號名稱是登入識別碼，本專案目前又是密碼明文儲存
（見 CLAUDE.md 安全章節）。時間戳保留，仍可回備份追溯來源。
確定不需要時才加 `--keep-usernames`。

挑選建議：

- 優先挑 **`--list` 顯示「配對 ✓」** 的資料，才能做端到端驗證
- 形狀比體積重要——看漸變數、缺 linear 數、離網格黑點數、非整數時間數
- ⚠️ **不要挑 2026-01-06 以前的資料**做端到端比對：當時的匯出邏輯與現行版本不同，
  比對必然失敗（詳見 `buildPlayers.production.test.js` 的說明）
- 🔒 工具以白名單只讀 `raw_json` / `color`，**永遠不會碰 `users.bson`**（內含明文密碼）

## 加入之後

```bash
cd frontend
npm run test:update-golden   # 重新產生基準（會包含新 fixture）
npm test                     # 確認全綠
```

產生的 `golden.json` 與 fixture 一起 commit。之後任何改動只要讓輸出偏離基準就會紅燈。
