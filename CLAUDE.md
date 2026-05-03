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

# 檢查端口占用
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
巢狀結構：`actionTable[armorIndex][partIndex] = [{time, color: {R,G,B,A}, linear}]`
- armorIndex: 0-6（舞者編號），partIndex: 0-21（22 個身體部位，含 8 個配件 LED）
- time: 毫秒，linear: 0（固定色）/ 1（線性過渡）

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

### 文件檔案
- **`README.md`**：專案說明文件（已針對 C++ 開發者優化）
- **`docs/technical-analysis.md`**：詳細技術分析報告（架構、API、安全問題、改進路線圖）
- **`docs/configuration.md`**：完整配置說明（環境變數、API 端點、部署模式）
- **`docs/data-flow-pipeline.md`**：從編輯器到資料庫的完整資料流說明
- **`docs/backend-management.md`**：MongoDB 備份與 Docker 管理操作指南
- **`docs/network-architecture-refactor-plan.md`**：網路路由架構重構計畫
- **`docs/shortcuts.md`**：鍵盤快速鍵速查表，前端 Home 頁面可透過 Shortcuts 按鈕查看
- **`docs/troubleshooting-login-500.md`**：MongoDB 連線 500 錯誤 SOP

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

### 程式碼重構
1. 保持向後相容性
2. 增加適當的註解說明變更原因
3. 確保重構後符合程式碼品質標準

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

- **2026-05-03**：重整 docs/ 目錄，新增資料流管道與後端管理文檔，更新 CLAUDE.md 架構圖與引用
- **2025-08-20**：建立專案記憶檔案，針對 C++ 背景開發者優化 README.md
- **專案狀態**：開發版本，包含已知安全性問題待修復