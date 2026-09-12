# Backend 管理操作指南

本文件涵蓋 LightDance 後端服務的日常管理操作，包括 MongoDB 備份還原、Docker 容器管理、日誌查看及故障排除。

> **進階參考**：完整的備份系統說明請見 `backend/BACKUP_README.md`，Shell 腳本語法教學請見 `backend/SHELL_SCRIPT_GUIDE.md`。

## 1. MongoDB 資料庫備份與還原

備份系統由三個腳本組成，位於 `backend/` 目錄下。

### 系統設定

- **備份頻率**：每天凌晨 6:00 自動執行（透過 systemd）
- **備份範圍**：`test` 資料庫（users、color、music、pico、raw_json 集合）
- **保留政策**：最近 30 天的備份（約 15 個）
- **備份位置**：`db/dump_data/`
- **日誌檔案**：`db/dump_data/backup.log`、`db/dump_data/cron.log`

### 設定自動備份

```bash
cd backend
./setup-cron.sh
```

此腳本會檢查是否已存在備份任務，並互動式確認是否覆蓋。

### 手動備份

```bash
cd backend

# 立即執行備份
./mongo-backup.sh

# 測試備份設定（不實際備份，僅測試 MongoDB 連線）
./mongo-backup.sh --test

# 列出所有可用備份
./mongo-backup.sh --list
```

### 資料還原

```bash
cd backend

# 互動式還原（會列出所有備份供選擇）
./mongo-backup.sh --restore

# 快速還原最新備份
./mongo-restore.sh --latest

# 互動式還原（透過輔助腳本）
./mongo-restore.sh
```

### 監控備份狀態

```bash
# 查看最近的備份日誌
tail -20 db/dump_data/backup.log

# 查看定時任務執行日誌
tail -20 db/dump_data/cron.log

# 檢查目前的 cron 設定
crontab -l | grep mongo-backup
```

### 常用參數修改

在 `backend/mongo-backup.sh` 中可調整：

```bash
DATABASE_NAME="test"        # 資料庫名稱
MONGO_USERNAME="root"       # MongoDB 使用者
MONGO_PASSWORD="nycuee"     # MongoDB 密碼
RETENTION_DAYS=30           # 備份保留天數
```

## 2. Docker 容器管理

### 開發環境

```bash
# 一鍵啟動（推薦）
./start-dev.sh

# 查看所有容器狀態
docker compose -f docker-compose.dev.yml ps

# 查看即時日誌（所有服務）
docker compose -f docker-compose.dev.yml logs -f

# 查看特定服務日誌
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend-dev
docker compose -f docker-compose.dev.yml logs -f mongo

# 停止所有服務
docker compose -f docker-compose.dev.yml down

# 停止並清除 volumes（完全重置）
./stop-dev.sh

# 重建並啟動（修改 Dockerfile 或依賴後使用）
docker compose -f docker-compose.dev.yml up --build -d
```

### 生產環境

```bash
# 部署到生產環境
./run-deploy.sh

# 停止生產環境
./disable-deploy.sh

# 手動管理生產容器
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml down
```

### 進入容器內部

```bash
# 進入後端容器
docker compose -f docker-compose.dev.yml exec backend sh

# 進入 MongoDB 容器
docker compose -f docker-compose.dev.yml exec mongo bash

# 進入前端容器
docker compose -f docker-compose.dev.yml exec frontend-dev sh
```

## 3. Healthcheck 與服務驗證

### 後端健康檢查

```bash
# 基本健康檢查
curl http://localhost:8000/api/

# 預期回應：{"Hello":"World"}

# 從容器內部檢查
docker compose -f docker-compose.dev.yml exec backend wget -qO- http://localhost:8000/api/
```

### MongoDB 連線檢查

```bash
# 從後端容器測試 MongoDB 連線
docker compose -f docker-compose.dev.yml exec backend python3 -c "
from pymongo import MongoClient
import os
client = MongoClient(os.getenv('MONGO_CONNECT_URI'))
print('MongoDB 連線成功:', client.server_info()['version'])
"

# 進入 mongo shell
docker compose -f docker-compose.dev.yml exec mongo mongosh -u root -p nycuee
```

### Mongo Express (Web 管理介面)

開發環境中可透過瀏覽器存取：**http://localhost:8081**

可用於直接查看/編輯 MongoDB 文件，無需命令列操作。

### 端口占用檢查

```bash
lsof -i :3000   # 前端 (Vite dev server)
lsof -i :8000   # 後端 (FastAPI / Uvicorn)
lsof -i :27017  # MongoDB
lsof -i :8081   # Mongo Express
```

## 4. 日誌管理

### 應用程式日誌

```bash
# 專案根目錄的 logs/ 目錄
ls -la logs/
# ├── act.log              # action 操作日誌
# ├── frontend-dev.log     # 前端開發伺服器日誌
# └── frontend-install.log # npm install 日誌
```

### Docker 容器日誌

```bash
# 即時追蹤所有服務
docker compose -f docker-compose.dev.yml logs -f --tail=50

# 僅顯示後端錯誤
docker compose -f docker-compose.dev.yml logs backend --tail=100 2>&1 | grep -i error

# 匯出日誌至檔案
docker compose -f docker-compose.dev.yml logs > debug_$(date +%Y%m%d).log
```

### 備份日誌

```bash
# 備份執行日誌
tail -50 db/dump_data/backup.log

# 定時任務日誌
tail -50 db/dump_data/cron.log
```

## 5. 故障排除快速參考

| 問題 | 參考資源 |
|------|---------|
| MongoDB 連線失敗 / 登入 500 錯誤 | `docs/troubleshooting-login-500.md` |
| 開發/生產環境 API 路由不一致 | `docs/network-architecture-refactor-plan.md` |
| 環境變數設定問題 | `docs/configuration.md` |
| 完整架構分析與安全問題 | `docs/technical-analysis.md` |

### 常見快速修復

```bash
# 完全重置開發環境
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build -d

# 清除前端 node_modules 快取
docker volume rm lightdance_frontend_node_modules

# MongoDB 資料目錄權限問題（Linux/macOS）
sudo chown -R 1000:1000 db/
```

## 6. 開發環境架構總覽

```
docker-compose.dev.yml 服務：

┌─────────────────────────────────────────────────────┐
│  frontend-dev        │  Vite dev server             │
│  (node:20-alpine)    │  Port 3000                   │
│                      │  /api → proxy to backend:8000│
├──────────────────────┼──────────────────────────────┤
│  backend             │  Uvicorn + FastAPI            │
│  (python:3.11-alpine)│  Port 8000                   │
│                      │  APP_RELOAD=true (hot reload) │
├──────────────────────┼──────────────────────────────┤
│  mongo               │  MongoDB 8.x                 │
│  (mongo:latest)      │  Port 27017                  │
│                      │  Data: ./db/ (bind mount)     │
├──────────────────────┼──────────────────────────────┤
│  mongo-express       │  Web DB admin UI             │
│  (mongo-express)     │  Port 8081                   │
└──────────────────────┴──────────────────────────────┘

網路：lightdance-dev-network (bridge)
服務間以 container name 互相解析（如 backend:8000, mongo:27017）
```
