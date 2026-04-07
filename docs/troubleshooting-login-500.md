# 登入 500 錯誤故障排除 SOP

## 問題描述

使用者在 `http://localhost:3000/login` 登入時,輸入正確的帳號密碼後,收到 **500 Internal Server Error**。

## 問題原因

**根本原因**: MongoDB 容器因為檔案權限問題反覆崩潰重啟,導致後端無法連線到資料庫。

**技術細節**:
- MongoDB 8.2 版本在 Windows + WSL + Docker 環境下,`/data/db/_tmp/spilldb/` 資料夾會出現權限問題
- 錯誤訊息: `Operation not permitted` 當嘗試打開 `WiredTiger.wt` 檔案
- 這導致 MongoDB 不斷崩潰重啟,後端連線時返回 `Connection refused`

---

## 故障排除步驟 (SOP)

### 步驟 1: 確認問題是 MongoDB 連線問題

```bash
# 檢查容器狀態
docker compose -f docker-compose.dev.yml ps

# 檢查 MongoDB 是否頻繁重啟 (STATUS 顯示 "Up X seconds")
# 如果 mongo-dev 的運行時間很短 (< 30 秒) 且持續變化,表示在重啟
```

**預期結果**: 如果 MongoDB 容器的 STATUS 顯示 "Up 5 seconds" 或類似很短的時間,且每次檢查都在重啟,則確認是 MongoDB 問題。

### 步驟 2: 檢查 MongoDB 錯誤日誌

```bash
# 查看 MongoDB 日誌中的錯誤
docker compose -f docker-compose.dev.yml logs mongo --tail=100 | grep -E "(error|Error|ERROR|Fatal|fatal|FATAL)"
```

**預期結果**: 如果看到以下錯誤,確認是權限問題:
```
"Operation not permitted"
"__posix_open_file:885:/data/db/_tmp/spilldb/WiredTiger.wt"
"Fatal assertion"
"aborting after fassert() failure"
```

### 步驟 3: 檢查後端連線錯誤

```bash
# 查看後端日誌
docker compose -f docker-compose.dev.yml logs backend --tail=50
```

**預期結果**: 應該看到類似錯誤:
```
pymongo.errors.ServerSelectionTimeoutError: mongo:27017: [Errno 111] Connection refused
```

---

## 解決方案

### 方案 A: 使用 Docker Volume (推薦)

這個方法可以避免 Windows 檔案系統權限問題。

#### 1. 修改 `docker-compose.dev.yml`

找到 `mongo` 服務的 `volumes` 設定,將:

```yaml
volumes:
  # 將資料庫檔案保存在本地的 ./db 資料夾
  - ./db:/data/db
  - ./mongo-init:/docker-entrypoint-initdb.d
```

改為:

```yaml
volumes:
  # 使用 Docker volume 儲存資料庫
  - mongo_data:/data/db
  - ./mongo-init:/docker-entrypoint-initdb.d
```

#### 2. 在檔案底部的 `volumes` 區段加入:

```yaml
volumes:
  frontend_node_modules:
  mongo_data:  # 新增這一行
```

#### 3. 重新啟動服務

```bash
# 停止所有服務並清除舊資料
docker compose -f docker-compose.dev.yml down -v

# 重新啟動
docker compose -f docker-compose.dev.yml --env-file .env.development up -d --build

# 等待 30 秒讓 MongoDB 完全啟動
sleep 30

# 檢查 MongoDB 狀態
docker compose -f docker-compose.dev.yml logs mongo --tail=20
```

**優點**:
- ✅ 避免 Windows 檔案系統權限問題
- ✅ 效能更好
- ✅ 更符合 Docker 最佳實踐

**缺點**:
- ❌ 資料儲存在 Docker volume 中,不能直接在 Windows 檔案系統查看

---

### 方案 B: 清除並重建本地 db 資料夾

如果你需要在本地檔案系統查看資料庫檔案,使用這個方法。

#### 1. 完全停止並清除服務

```bash
cd "d:\Coding\NYCU\light dance\Github\lightdance"

# 停止所有容器並清除 volumes
docker compose -f docker-compose.dev.yml down -v

# 備份舊的資料庫資料夾 (可選)
mv db db_backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null || rm -rf db

# 刪除 _tmp 資料夾的內容
rm -rf db/_tmp/*
```

#### 2. 重新啟動服務

```bash
# 使用 start-dev.sh 啟動
./start-dev.sh
```

**注意**: 這個方法在 Windows + WSL 環境下可能會**再次遇到相同問題**,因為根本原因是 MongoDB 8.2 與 Windows 檔案系統的相容性問題。

---

### 方案 C: 降級 MongoDB 版本 (終極解決方案)

如果方案 A 和 B 都無法解決,可以降級 MongoDB 到 7.x 版本。

#### 1. 修改 `docker-compose.dev.yml`

找到 `mongo` 服務,將:

```yaml
mongo:
  image: mongo
```

改為:

```yaml
mongo:
  image: mongo:7.0
```

#### 2. 重新啟動

```bash
docker compose -f docker-compose.dev.yml down -v
rm -rf db
docker compose -f docker-compose.dev.yml --env-file .env.development up -d --build
```

---

## 驗證修復成功

### 1. 檢查 MongoDB 穩定運行

```bash
# 等待 30 秒
sleep 30

# 檢查容器狀態 - mongo-dev 應該顯示 "Up X minutes" (至少 1 分鐘)
docker compose -f docker-compose.dev.yml ps

# 檢查 MongoDB 日誌 - 應該看到 "Waiting for connections"
docker compose -f docker-compose.dev.yml logs mongo --tail=20
```

### 2. 檢查後端連線成功

```bash
# 應該看到 "Pinged your deployment. You successfully connected to MongoDB!"
docker compose -f docker-compose.dev.yml logs backend --tail=30
```

### 3. 驗證資料庫中有測試帳號

```bash
docker exec mongo-dev mongosh --quiet -u root -p nycuee --authenticationDatabase admin --eval "db.getSiblingDB('test').users.find().toArray()"
```

**預期輸出**:
```json
[
  {
    _id: ObjectId('...'),
    username: 'testuser',
    password: 'testpassword',
    disabled: false
  }
]
```

### 4. 測試登入功能

1. 開啟瀏覽器訪問: http://localhost:3000/login
2. 輸入:
   - 使用者名稱: `testuser`
   - 密碼: `testpassword`
3. 點擊登入

**預期結果**: 成功登入,沒有 500 錯誤

---

## 預防措施

### 1. 監控 MongoDB 健康狀態

在 `docker-compose.dev.yml` 的 `mongo` 服務加入 healthcheck:

```yaml
mongo:
  image: mongo:7.0  # 或使用 volume 的 mongo 最新版
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 40s
  # ... 其他配置
```

### 2. 修改 backend 的 depends_on 使用健康檢查

```yaml
backend:
  depends_on:
    mongo:
      condition: service_healthy  # 等待 MongoDB 健康才啟動
```

### 3. 定期備份資料庫

```bash
# 匯出資料庫
docker exec mongo-dev mongodump -u root -p nycuee --authenticationDatabase admin --out /tmp/backup

# 複製到本地
docker cp mongo-dev:/tmp/backup ./mongo_backup_$(date +%Y%m%d)
```

---

## 常見問題 FAQ

### Q1: 為什麼 MongoDB 在 Windows 上會有權限問題?

**A**: Windows 的檔案系統 (NTFS) 與 Linux 的權限模型不同。當 Docker Desktop for Windows 使用 WSL2 掛載 Windows 資料夾時,某些 Linux 檔案操作可能會失敗。MongoDB 8.x 的新功能 (spilldb) 特別容易觸發這個問題。

### Q2: 使用 Docker Volume 後,我的資料在哪裡?

**A**: Docker volume 儲存在 WSL2 的檔案系統中:
```bash
# 在 WSL 中執行
docker volume inspect lightdance_mongo_data

# 資料通常在: /var/lib/docker/volumes/lightdance_mongo_data/_data
```

### Q3: 我可以從舊的 db 資料夾遷移到 Docker Volume 嗎?

**A**: 可以,步驟如下:

```bash
# 1. 停止服務
docker compose -f docker-compose.dev.yml down

# 2. 建立臨時容器掛載 volume
docker run --rm -v lightdance_mongo_data:/data/db -v "$(pwd)/db":/backup alpine sh -c "cp -r /backup/* /data/db/"

# 3. 啟動服務
docker compose -f docker-compose.dev.yml up -d
```

### Q4: start-dev.sh 會自動處理這個問題嗎?

**A**: 不會。`start-dev.sh` 只負責啟動服務,不會自動修復 MongoDB 權限問題。你需要手動執行上述解決方案。

---

## 快速修復指令 (一鍵執行)

如果你趕時間,可以直接執行這些指令 (使用方案 A - Docker Volume):

```bash
# 進入專案目錄
cd "d:\Coding\NYCU\light dance\Github\lightdance"

# 停止並清除所有服務
docker compose -f docker-compose.dev.yml down -v

# 備份並刪除 db 資料夾
mv db db_backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null || rm -rf db

# 重新啟動
docker compose -f docker-compose.dev.yml --env-file .env.development up -d --build

# 等待啟動
echo "等待服務啟動..."
sleep 40

# 檢查狀態
echo "=== 容器狀態 ==="
docker compose -f docker-compose.dev.yml ps

echo -e "\n=== MongoDB 日誌 ==="
docker compose -f docker-compose.dev.yml logs mongo --tail=10

echo -e "\n=== 後端日誌 ==="
docker compose -f docker-compose.dev.yml logs backend --tail=10

echo -e "\n=== 測試帳號 ==="
docker exec mongo-dev mongosh --quiet -u root -p nycuee --authenticationDatabase admin --eval "db.getSiblingDB('test').users.find().toArray()"

echo -e "\n✅ 如果看到 testuser 帳號,請前往 http://localhost:3000/login 測試登入"
```

---

## 參考資料

- [MongoDB on Windows with Docker - Known Issues](https://github.com/docker-library/mongo/issues/74)
- [WSL2 File Permissions](https://learn.microsoft.com/en-us/windows/wsl/file-permissions)
- [Docker Volumes vs Bind Mounts](https://docs.docker.com/storage/volumes/)

---

**文件版本**: 1.0
**最後更新**: 2026-01-07
**維護者**: LightDance 開發團隊
