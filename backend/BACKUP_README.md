# MongoDB 自動備份系統

本專案已配置完成 MongoDB 的自動備份系統，以下是完整的使用說明。

## 🎯 系統概覽

- **備份頻率**: 每兩天凌晨 6:00 自動執行
- **備份範圍**: 完整的 `test` 資料庫（包含 users、color、music、pico、raw_json 等集合）
- **保留政策**: 保留最近 30 天的備份檔案（約 15 個備份）
- **備份位置**: `../db/dump_data/`
- **日誌記錄**: `../db/dump_data/backup.log` 和 `../db/dump_data/cron.log`

## 📁 檔案結構

```
lightdance/
├── backend/
│   ├── mongo-backup.sh          # 主要備份腳本
│   ├── mongo-restore.sh         # 快速還原腳本
│   ├── setup-cron.sh           # 定時任務設定腳本
│   └── BACKUP_README.md         # 本說明檔案
└── db/
    └── dump_data/
        ├── backup.log                           # 詳細日誌
        ├── cron.log                            # 定時任務日誌
        └── mongodb_backup_YYYYMMDD_HHMMSS/     # 備份檔案目錄
            └── test/                           # 資料庫備份檔案
                ├── users.bson
                ├── color.bson
                ├── music.bson
                ├── pico.bson
                ├── raw_json.bson
                └── *.metadata.json
```

## 🚀 使用方法

### 設定自動備份

```bash
# 進入 backend 目錄
cd backend

# 設定定時任務（每兩天凌晨 6:00）
./setup-cron.sh
```

### 手動備份

```bash
# 進入 backend 目錄
cd backend

# 立即執行備份
./mongo-backup.sh

# 測試備份設定（不實際備份）
./mongo-backup.sh --test

# 查看可用備份列表
./mongo-backup.sh --list
```

### 資料還原

```bash
# 進入 backend 目錄
cd backend

# 互動式還原（推薦）
./mongo-backup.sh --restore

# 或使用快速還原腳本
./mongo-restore.sh

# 還原最新的備份
./mongo-restore.sh --latest
```

## 📊 監控和維護

### 查看備份狀態

```bash
# 查看最近的備份日誌
tail -20 ../db/dump_data/backup.log

# 查看定時任務執行日誌
tail -20 ../db/dump_data/cron.log

# 檢查目前的 cron 設定
crontab -l | grep mongo-backup
```

### 檢查備份檔案

```bash
# 列出所有備份
ls -la ../db/dump_data/mongodb_backup_*/

# 檢查特定備份的內容
ls -la ../db/dump_data/mongodb_backup_20250822_181758/test/
```

## ⚙️ 設定參數

在 `mongo-backup.sh` 中可以調整以下參數：

```bash
DATABASE_NAME="test"           # 要備份的資料庫名稱
MONGO_USERNAME="root"          # MongoDB 使用者名稱  
MONGO_PASSWORD="nycuee"        # MongoDB 密碼
RETENTION_DAYS=30              # 備份保留天數
```

## 🔧 故障排除

### 常見問題

1. **備份失敗 - 容器未運行**
   ```bash
   # 檢查 MongoDB 容器狀態
   docker ps | grep mongo
   
   # 啟動容器
   docker compose -f docker-compose.dev.yml up -d mongo
   ```

2. **備份失敗 - 認證錯誤**
   ```bash
   # 測試連接
   ./mongo-backup.sh --test
   ```

3. **查看詳細錯誤**
   ```bash
   # 查看完整日誌
   cat ../db/dump_data/backup.log
   ```

### 手動清理

```bash
# 手動刪除超過 30 天的備份
find ../db/dump_data -name "mongodb_backup_*" -type d -mtime +30 -exec rm -rf {} \;
```

## 📈 系統優勢

- **自動化**: 無需人工干預的定時備份
- **安全性**: 完整的資料庫備份，包含所有集合和索引
- **空間管理**: 自動清理過期備份，節省磁碟空間  
- **易於使用**: 簡單的命令列介面和互動式還原
- **詳細記錄**: 完整的備份和還原日誌
- **Docker 整合**: 與現有 Docker 環境完美整合

## 🔄 定期維護建議

1. **每週檢查**: 確認備份是否正常執行
2. **每月驗證**: 測試備份還原功能
3. **容量監控**: 定期檢查 `../db/dump_data` 目錄大小
4. **日誌輪替**: 定期清理過大的日誌檔案

---

如有任何問題，請檢查 `../db/dump_data/backup.log` 中的詳細日誌資訊。