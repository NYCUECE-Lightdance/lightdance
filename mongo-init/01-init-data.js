/*
 * ⚠️ **憑證一律從環境變數來，不要寫死在這個檔案裡。**
 *
 * 這裡原本是 `db.auth('root', 'nycuee')` 與 `pwd: 'testpassword'` ——而這個
 * 檔案在版控裡、repo 是 public fork，等於把正式資料庫的 root 密碼公開發布。
 *
 * mongo 官方 image 的 entrypoint 會把 MONGO_INITDB_ROOT_USERNAME /
 * MONGO_INITDB_ROOT_PASSWORD 放進 mongosh 的 process.env，所以直接讀就好；
 * 兩個 docker-compose 都已經把它們接到 ${MONGO_USERNAME} / ${MONGO_PASSWORD}。
 */
const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME;
const rootPass = process.env.MONGO_INITDB_ROOT_PASSWORD;

if (!rootUser || !rootPass) {
  throw new Error(
    'mongo-init：MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD 沒有設定。' +
      '請在 .env 裡設 MONGO_USERNAME 與 MONGO_PASSWORD。'
  );
}

// Authenticate as the root user in the admin database
db = db.getSiblingDB('admin');
db.auth(rootUser, rootPass);

// Switch to the application's database
db = db.getSiblingDB('test');

/*
 * 應用程式連線用的帳號。密碼同樣走環境變數（APP_DB_PASSWORD），沒設就退回
 * root 的密碼——單機部署下兩者本來就在同一份 .env 裡，多一個變數只是讓
 * 「應用程式的權限」與「資料庫管理員」分得開。
 */
db.createUser({
  user: process.env.APP_DB_USERNAME || 'testuser',
  pwd: process.env.APP_DB_PASSWORD || rootPass,
  roles: [
    { role: 'readWrite', db: 'test' }
  ]
});

/*
 * 開發用的種子帳號。
 *
 * ⚠️ **密碼欄位存的是 bcrypt 雜湊，不是明文。**
 *
 * 這裡原本直接寫 `"password": "testpassword"`，於是每一個全新部署一起來就有
 * 一個明文密碼躺在資料庫裡——而 `backend/auth.py` 那邊為了相容舊資料，明文
 * 也是驗得過的，所以完全不會有人發現。程式那端已經改成 bcrypt 並且會在登入
 * 成功時把舊的明文就地換掉（懶惰遷移），這裡是最後一個還在**製造**新明文的
 * 地方。
 *
 * mongo shell 沒有 bcrypt，所以雜湊是事先算好貼進來的：
 *
 *   python -c "import bcrypt; print(bcrypt.hashpw(b'你的密碼', bcrypt.gensalt(12)).decode())"
 *
 * 下面這串對應的密碼是 `testpassword`。它是**開發用的**，值本來就寫在這個
 * 檔案裡、進得了公開的 repo——正式環境請自己建帳號，不要沿用這一組。
 */
db.users.insertOne({
    "username": "testuser",
    "password": "$2b$12$IpMGl8JYBTkeewTajv6rvO1NpEewPQrLkmZOlMf5vUT09dLm8O/3a",
    "disabled": false
});

db.createCollection('color');
db.createCollection('raw_json');

/*
 * 索引。
 *
 * 這個資料庫原本一個索引都沒有，於是每一次「載入最新版本」都是
 * 「掃過這個使用者的所有光表、全部載進記憶體、排序、取第一筆」。一份密集光表
 * 的 players 實測 43KB，存了幾十版之後每次開 Dashboard 都要搬好幾 MB。
 *
 * (user, update_time) 這一組同時服務四種查詢：指定版本、LATEST、某使用者的
 * 版本清單、上傳時的計數。
 *
 * unique 是為了擋掉「同一個時間戳兩份文件」——那會讓 find_one 回哪一份變成
 * 沒有定義的行為。後端啟動時也會跑一次 ensure_indexes（backend/storage.py），
 * 兩邊是同一份定義；這裡寫著是為了讓全新部署一開始就有，不必等服務起來。
 */
db.color.createIndex({ user: 1, update_time: -1 }, { unique: true });
db.raw_json.createIndex({ user: 1, update_time: -1 }, { unique: true });

// 帳號名稱是登入的鍵。沒有唯一索引的話資料庫允許兩個同名帳號存在，
// 而 find_one 只會回其中一個——密碼對不上的那位使用者會登不進來
db.users.createIndex({ username: 1 }, { unique: true });