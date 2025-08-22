# 🕺 LightDance 燈光舞蹈控制系統

> **專為電機工程系學生設計的燈光編舞 Web 應用程式**  
> 由國立陽明交通大學電機工程學系學生開發維護

![Tech Stack](https://img.shields.io/badge/Tech-React%20%7C%20FastAPI%20%7C%20MongoDB-blue)
![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED?logo=docker)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)

## 📋 專案概述

LightDance 是一個**全端 Web 應用程式**，讓使用者透過直觀的瀏覽器介面設計和控制 LED 燈光舞蹈表演。如果您有 **C++ 程式設計經驗**，可以把這個專案想像成：

| Web 開發概念 | C++ 開發類比 | 說明 |
|-------------|-------------|------|
| **前端 (Frontend)** | GUI 應用程式 (Qt/GTK) | 負責使用者介面和互動邏輯 |
| **後端 (Backend)** | 核心邏輯處理模組 | 處理商業邏輯和資料處理 |
| **資料庫** | 檔案 I/O + 資料結構 | 持久化資料儲存，比檔案更強大 |
| **API** | 函數介面 | HTTP 請求就像函數呼叫 |
| **容器化** | 跨平台編譯 | 確保程式在不同環境都能執行 |

## ✨ 核心功能

- 🎨 **燈光編排設計**：透過 Web 介面創建燈光編舞序列
- 🎵 **音樂同步整合**：上傳音樂檔案並同步燈光模式
- 👥 **多使用者支援**：使用者認證和個人工作空間管理
- 📱 **即時預覽**：設計時即時預覽燈光序列和 3D 效果
- 🔄 **熱重載開發**：修改程式碼時自動重新載入（類似某些 IDE 的即時編譯）
- 🚀 **一鍵部署**：使用 Docker Compose 自動化部署

## 🏗️ 系統架構

```
使用者瀏覽器 (Client)
    ↓ HTTP 請求
┌─────────────────────────────────────────┐
│         Nginx 反向代理 (Port 80)         │  ← 類似路由器/負載平衡器
│         靜態檔案服務 + 請求分發           │
└─────────────┬───────────────┬───────────┘
              │ /api/*        │ /*
              ↓               ↓
    ┌─────────────────┐ ┌─────────────────┐
    │   FastAPI       │ │  React 前端     │
    │  (Port 8000)    │ │ (Dev:Port 3000) │  ← 開發時獨立運行
    │                 │ │ (Prod:Nginx服務) │  ← 生產時由Nginx服務
    │  業務邏輯處理    │ │  使用者介面      │
    └─────────┬───────┘ └─────────────────┘
              ↓ 資料庫查詢
    ┌─────────────────────┐
    │   MongoDB           │  ← 類似資料檔案，但更智慧
    │   (Port 27017)      │
    │   文件式資料庫       │
    └─────────────────────┘
```

## 🛠 技術棧詳解

| 元件 | 技術 | C++ 開發者的理解方式 |
|-----|------|-------------------|
| **前端** | [React 18](https://reactjs.org/) | 類似 Qt/GTK，負責 GUI 和使用者互動 |
| **後端** | [FastAPI](https://fastapi.tiangolo.com/) | 類似主程式，處理邏輯和資料處理 |
| **資料庫** | [MongoDB](https://www.mongodb.com/) | 類似結構化檔案系統，但支援複雜查詢 |
| **反向代理** | [Nginx](https://www.nginx.com/) | 類似網路路由器，分發請求到正確服務 |
| **容器化** | [Docker Compose](https://docs.docker.com/compose/) | 類似 Makefile，但管理整個執行環境 |

## 🚀 快速開始

### 1. 環境需求

```bash
# 檢查 Docker 是否已安裝（必要）
docker --version
docker-compose --version

# 如未安裝 Docker：
# Windows/Mac: https://docs.docker.com/desktop/
# Linux: sudo apt install docker.io docker-compose
```

### 2. 專案啟動（推薦方式）

```bash
# 1. 下載專案
git clone <repository-url>
cd lightdance

# 2. 一鍵啟動開發環境
./start-dev.sh
```

**啟動後可存取的服務：**
- 🎨 **主應用程式**：[http://localhost:3000](http://localhost:3000)
- 📚 **API 文件**：[http://localhost:8000/docs](http://localhost:8000/docs) (類似函數說明文件)
- 🗄️ **資料庫管理**：[http://localhost:8081](http://localhost:8081)

### 3. 手動啟動（了解詳細過程）

如果您想了解每個步驟或自動腳本失敗：

```bash
# 1. 查看環境配置
cat .env.development

# 2. 啟動所有服務（類似 make all）
docker compose -f docker-compose.dev.yml --env-file .env.development up --build

# 3. 停止所有服務（類似清除編譯結果）
docker compose -f docker-compose.dev.yml down
```

## 📁 專案結構解析

```
lightdance/
├── 🎨 frontend/                # 前端程式碼 (類似 GUI 部分)
│   ├── src/
│   │   ├── components/         # UI 組件 (類似自定義控制項)
│   │   ├── pages/             # 頁面組件 (類似不同的視窗)
│   │   ├── config/            # API 配置 (類似標頭檔)
│   │   └── redux/             # 狀態管理 (類似全域變數管理)
│   ├── package.json           # 依賴管理 (類似 Makefile)
│   └── Dockerfile             # 容器建置指令
├── ⚡ backend/                 # 後端程式碼 (類似主邏輯)
│   ├── main.py                # 主程式進入點
│   ├── pyproject.toml         # Python 專案配置
│   └── Dockerfile             # 容器建置指令
├── 🗄️ mongo-init/              # 資料庫初始化腳本
├── 🔀 nginx/                   # 反向代理設定
├── 🎵 music_file/              # 音樂檔案儲存資料夾
├── 📊 db/                      # 資料庫檔案 (類似資料檔)
├── ⚙️ 配置檔案
│   ├── docker-compose.dev.yml # 開發環境編排
│   ├── docker-compose.prod.yml# 生產環境編排
│   ├── .env                   # 主要環境變數
│   └── .env.development       # 開發環境覆蓋設定
├── 🚀 執行腳本
│   ├── start-dev.sh           # 開發環境一鍵啟動
│   ├── stop-dev.sh            # 停止開發環境
│   └── run-deploy.sh          # 生產環境部署
└── 📚 說明文件
    ├── README.md              # 本檔案
    ├── docs/                  # 技術文檔資料夾
    │   ├── technical-analysis.md # 詳細技術分析
    │   └── configuration.md      # 完整配置說明
```

## 🔧 開發指南

### 對 C++ 開發者的重要概念

1. **熱重載 (Hot Reload)**
   - 類似某些 IDE 的「邊改邊執行」功能
   - 修改前端程式碼時會自動重新載入頁面
   - 修改後端程式碼時會自動重啟 API 服務

2. **RESTful API**
   ```cpp
   // 在 C++ 中您可能這樣呼叫函數：
   User user = getUserById(123);
   
   // 在 Web API 中對應的是：
   GET http://localhost:8000/api/users/123
   ```

3. **異步處理**
   - 類似 C++ 的多執行緒程式設計
   - 可以同時處理多個 HTTP 請求
   - Python 的 `async/await` 類似 C++ 的 `std::async`

4. **狀態管理**
   - 前端的 Redux 類似全域變數管理
   - 確保整個應用程式的資料一致性

### 常用開發指令

```bash
# 檢視所有服務狀態 (類似 ps 指令)
docker compose -f docker-compose.dev.yml ps

# 檢視服務日誌 (類似 debug 輸出)
docker compose -f docker-compose.dev.yml logs -f

# 檢視特定服務日誌
docker compose -f docker-compose.dev.yml logs -f frontend-dev
docker compose -f docker-compose.dev.yml logs -f backend

# 進入容器內部 (類似 debug 模式)
docker exec -it lightdance-frontend-dev-<username> /bin/sh
docker exec -it lightdance-backend-dev-<username> /bin/bash

# 重建特定服務 (類似重新編譯)
docker compose -f docker-compose.dev.yml up --build frontend-dev
```

## ⚙️ 環境配置

### 環境變數系統

專案使用分層環境配置，類似 C++ 的條件編譯：

```bash
.env                 # 主配置 (生產環境預設值)
.env.development     # 開發環境覆蓋 (#ifdef DEBUG 的概念)
.env.deployment      # 部署環境特定配置
```

**主要配置選項：**

```bash
# 專案設定
PROJECT_PREFIX=lightdance        # 容器名稱前綴
DEV_MODE=true                   # 開發模式開關

# 資料庫認證
MONGO_USERNAME=root
MONGO_PASSWORD=nycuee

# 服務端口
FRONTEND_PORT=3000              # 前端開發伺服器
API_PORT=8000                   # 後端 API
MONGO_EXPRESS_PORT=8081         # 資料庫管理介面

# API 端點 (自動配置)
REACT_APP_API_BASE_URL=http://localhost:8000/api
```

### 開發模式 vs 生產模式

| 模式 | 前端 | 後端 | 資料庫 | 特色 |
|-----|------|------|--------|------|
| **開發** | React Dev Server (3000) | 熱重載啟用 | 暴露 27017 端口 | 即時程式碼更新，Ctrl+C 停止 |
| **生產** | Nginx 服務 (80) | 最佳化建置 | 僅內部存取 | 效能最佳化 |

## 🐛 故障排除

### 常見問題與解決方案

1. **Docker 容器啟動失敗**
   ```bash
   # 檢查 Docker 服務狀態
   docker info
   
   # 查看詳細錯誤日誌
   docker compose -f docker-compose.dev.yml logs
   
   # 重新建置並啟動
   docker compose -f docker-compose.dev.yml down
   docker compose -f docker-compose.dev.yml up --build
   ```

2. **端口被占用錯誤**
   ```bash
   # 檢查端口使用情況
   lsof -i :3000  # 前端端口
   lsof -i :8000  # 後端端口
   lsof -i :27017 # 資料庫端口
   
   # 修改 .env.development 檔案中的端口設定
   # 或者停止占用端口的程序
   ```

3. **前端編譯錯誤**
   ```bash
   # 清除 Node.js 快取並重新安裝依賴
   docker compose -f docker-compose.dev.yml down
   docker volume rm lightdance_frontend_node_modules
   docker compose -f docker-compose.dev.yml up --build
   ```

4. **資料庫連接失敗**
   ```bash
   # 檢查資料庫容器狀態
   docker compose -f docker-compose.dev.yml ps mongo
   
   # 檢查環境變數設定
   grep MONGO .env.development
   
   # 重啟資料庫服務
   docker compose -f docker-compose.dev.yml restart mongo
   ```

5. **API 請求失敗**
   ```bash
   # 檢查後端服務健康狀態
   curl http://localhost:8000/
   
   # 查看 API 文件
   open http://localhost:8000/docs
   
   # 檢查後端日誌
   docker compose -f docker-compose.dev.yml logs -f backend
   ```

## 📚 學習資源

### 對 C++ 開發者的建議學習路徑

1. **Web 開發基礎概念**
   - **HTTP 協定**：類似網路 socket 程式設計，但更高階
   - **JSON 格式**：類似 XML 或結構體序列化，但更輕量
   - **RESTful API**：標準化的函數呼叫介面設計

2. **前端技術 (JavaScript/React)**
   - **JavaScript**：動態語言，語法類似 C，但更靈活
   - **React**：組件化開發，類似物件導向的 GUI 設計
   - **狀態管理**：類似全域變數管理，但更結構化

3. **後端技術 (Python/FastAPI)**
   - **Python 基礎**：語法比 C++ 簡潔，但概念相通
   - **FastAPI**：處理 HTTP 請求的框架，類似網路伺服器編程
   - **異步程式設計**：類似多執行緒，但用協程實現

4. **資料庫 (MongoDB)**
   - **NoSQL 概念**：文件式儲存，類似 JSON 檔案但支援查詢
   - **CRUD 操作**：Create, Read, Update, Delete，基本資料操作

### 推薦學習資源

- **Docker 容器技術**：[Docker 官方教學](https://docs.docker.com/get-started/)
- **React 前端框架**：[React 官方教學](https://reactjs.org/tutorial/tutorial.html)
- **FastAPI 後端框架**：[FastAPI 官方文件](https://fastapi.tiangolo.com/tutorial/)
- **MongoDB 資料庫**：[MongoDB 基礎教學](https://docs.mongodb.com/manual/tutorial/getting-started/)
- **Python 程式語言**：[Python 官方教學](https://docs.python.org/3/tutorial/)

## 🔬 深入分析

> 💡 **進階閱讀**：完整的技術分析和架構設計說明請參考 [`docs/technical-analysis.md`](docs/technical-analysis.md) 檔案

該檔案包含：
- 詳細的架構分析和設計決策
- 安全性問題識別和改進建議
- 效能最佳化策略
- 未來發展規劃和技術債務

## 🤝 開發貢獻

### 程式碼品質標準

根據專案要求，程式碼應遵循以下優先順序：
1. **可讀性** - 程式碼要讓其他開發者容易理解
2. **可維護性** - 便於未來修改和擴展
3. **可擴展性** - 支援功能增加和系統擴展
4. **易懂** - 邏輯清晰，註解適當
5. **簡潔** - 在滿足以上條件下保持簡潔

### 提交 Pull Request 前檢查清單

- [ ] 本地測試通過（前端和後端都能正常運行）
- [ ] 程式碼風格符合專案慣例
- [ ] 新增功能有適當的註解說明
- [ ] 提交訊息清楚描述變更內容
- [ ] 考慮了對現有功能的影響

## 🔒 安全性注意事項

> ⚠️ **重要警告**：此專案目前為開發版本，包含以下安全性問題需要在正式部署前修復：

1. **密碼儲存**：目前使用明文儲存，需實施 bcrypt 或 Argon2 加密
2. **Token 機制**：目前的 Token 過於簡單，需要實施 JWT (JSON Web Token)
3. **輸入驗證**：需要加強對使用者輸入的驗證和過濾
4. **CORS 設定**：目前設定過於寬鬆，需要限制允許的來源

**詳細的安全改進方案請參考 [`docs/technical-analysis.md`](docs/technical-analysis.md) 檔案第五章節。**

## 📞 技術支援

如果您在開發過程中遇到問題：

1. **檢查日誌輸出**：`docker compose -f docker-compose.dev.yml logs -f`
2. **查閱技術文檔**：[`docs/`](docs/) 資料夾 (包含詳細的故障排除和技術分析)
3. **聯絡開發團隊**：國立陽明交通大學電機工程學系
4. **查看服務狀態**：使用 `docker ps` 確認所有容器正常運行

---

## 🎯 總結

LightDance 專案為 C++ 背景的開發者提供了一個絕佳的 Web 開發學習機會。透過：

- **容器化技術**確保環境一致性
- **完整的前後端分離架構**
- **詳細的中文文件和註解**
- **一鍵啟動的開發環境**

您可以專注於學習 Web 開發的核心概念，而不必擔心複雜的環境配置問題。

**祝您開發愉快！** 🎉

---

*本專案由國立陽明交通大學電機工程學系學生開發維護，歡迎學習和貢獻。*