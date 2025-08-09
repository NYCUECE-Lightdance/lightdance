# 專案容器化與自動化部署規劃 (Project Plan)

本文檔旨在規劃如何將當前的多個專案（前端、後端 API 等）整合到一個統一的 Git 託管庫中，並為未來的 GitHub Actions 自動化部署打下堅實的基礎。

## 核心策略：單一託管庫 (Monorepo)

對於目前的專案規模和未來的自動化目標，我們採納 **單一託管庫 (Monorepo)** 的策略。這意味著所有相關的程式碼，包括前端、後端和設定檔，都將存放在同一個 GitHub 託管庫中。

### 選擇 Monorepo 的主要優勢

1.  **原子化的提交 (Atomic Commits)**：需要同時修改前後端的功能，可以透過一次提交完成，保持版本歷史的清晰與一致性。
2.  **簡化的 CI/CD 流程**：只需在一個託管庫中設定 GitHub Actions 工作流程，即可同時建置和部署所有服務，大大簡化了自動化流程。
3.  **一致的開發與部署環境**：確保本地開發（使用 Docker Compose）和線上部署的結構完全一致，有效避免「本機正常，線上異常」的問題。
4.  **易於管理**：所有程式碼集中存放，便於個人或小型團隊進行查找、修改和重構。

---

## 執行計畫

### 步驟 1：規劃理想的目錄結構

為了實現清晰、可擴展的管理，我們將採用以下目錄結構來組織託管庫：

```
/ (Git Repo Root)
├── .github/
│   └── workflows/
│       └── deploy.yml          # 未來的 GitHub Actions 自動化腳本
│
├── backend/                    # 所有後端 FastAPI 相關的程式碼
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
│
├── frontend/                   # 前端專案 (例如 @repo/lightdance)
│   ├── Dockerfile              # <-- 新增：前端的 Dockerfile
│   ├── public/
│   ├── src/
│   └── package.json
│
├── nginx/
│   └── default.conf            # Nginx 設定檔 (可選，也可整合進前端 Dockerfile)
│
├── mongo-init/                 # MongoDB 初始化腳本
│   └── 01-init-data.js
│
├── music_file/                 # 上傳的音樂檔案 (此目錄應被 .gitignore 忽略)
│
├── db/                         # MongoDB 的資料庫檔案 (此目錄應被 .gitignore 忽略)
│
├── .gitignore                  # Git 忽略清單
├── docker-compose.yml          # 核心的 Docker Compose 設定檔
└── README.md                   # 專案說明文件
```

### 步驟 2：處理初始資料庫 (Database Seeding)

為了讓任何人都能輕鬆地 `git clone` 並運行專案，我們不直接將資料庫檔案 (`db/`) 納入版本控制。取而代之，我們使用初始化腳本在資料庫首次啟動時自動載入初始資料。

1.  **建立初始化腳本 (`mongo-init/01-init-data.js`)**：
    ```javascript
    // 連接到 admin 資料庫進行身份驗證
    // 用戶名和密碼需與 docker-compose.yml 中設定的 ROOT 帳密一致
    db = db.getSiblingDB('admin');
    db.auth('root', 'nycuee');

    // 切換到應用程式要使用的資料庫 'test'
    db = db.getSiblingDB('test');

    // 建立 'users' 集合並插入一筆初始用戶資料
    db.users.insertOne({
        "username": "testuser",
        "password": "testpassword",
        "disabled": false
    });

    // 建立其他應用程式需要的空集合
    db.createCollection('color');
    db.createCollection('raw_json');
    db.createCollection('pico');
    db.createCollection('music');
    ```

### 步驟 3：前端建置容器化與 `docker-compose.yml` 調整

為了實現真正的一鍵啟動與環境一致性，我們將前端的建置流程完全容器化。

1.  **為前端建立 `Dockerfile`**：
    在 `frontend/` 目錄下建立一個 `Dockerfile`，採用 **多階段建置 (Multi-stage Build)** 策略。這能確保最終的 Nginx 映像檔只包含編譯好的靜態檔案，體積小且安全。
    ```dockerfile
    # /home/user/repo/frontend/Dockerfile

    # --- 第 1 階段：建置階段 (Build Stage) ---
    FROM node:18-alpine AS build
    WORKDIR /app
    COPY package*.json ./
    RUN npm install
    COPY . .
    RUN npm run build

    # --- 第 2 階段：生產階段 (Production Stage) ---
    FROM nginx:alpine
    COPY --from=build /app/build /usr/share/nginx/html
    EXPOSE 80
    CMD ["nginx", "-g", "daemon off;"]
    ```

2.  **調整 `docker-compose.yml`**：
    修改 `nginx` 服務，使其不再依賴本地端預先建置好的檔案，而是直接使用 `frontend/Dockerfile` 來建置一個包含所有前端資源的獨立映像檔。

    ```yaml
    # docker-compose.yml (更新後範例)
    version: '3.1'

    services:
      nginx:
        # 不再使用官方 image，而是 build 我們自己的前端 image
        build: ./frontend
        container_name: nginx
        # volumes 已不再需要，因為所有檔案都在 image 內部了
        ports:
          - 80:80
        depends_on:
          - fast-api

      fast-api:
        build: ./backend # build context 指向後端程式碼目錄
        ports: 
          - 8000:8000
        volumes:
          - ./backend:/app # 掛載後端程式碼以利開發
          - ./music_file:/app/music_file # 掛載音樂資料夾
        restart: unless-stopped
        depends_on:
          - mongo
        environment:
          - MONGO_CONNECT_URI=mongodb://root:nycuee@mongo:27017/

      mongo:
        image: mongo
        restart: always
        environment:
          MONGO_INITDB_ROOT_USERNAME: root
          MONGO_INITDB_ROOT_PASSWORD: nycuee
        ports:
          - 27017:27017
        volumes: 
          - ./db:/data/db
          - ./mongo-init:/docker-entrypoint-initdb.d
          
      mongo-express:
        image: mongo-express
        restart: always
        ports:
          - 8081:8081
        environment:
          ME_CONFIG_MONGODB_ADMINUSERNAME: root
          ME_CONFIG_MONGODB_ADMINPASSWORD: nycuee
          ME_CONFIG_MONGODB_URL: mongodb://root:nycuee@mongo:27017/
          ME_CONFIG_BASICAUTH: false
        depends_on:
          - mongo
    ```
    **核心優勢**：透過此修改，`docker compose up --build` 將成為一個完整的、自給自足的啟動指令，無需任何手動前置作業，大大提升了開發體驗和部署的可靠性。

### 步驟 4：建立一個強大的 `.gitignore` 檔案

```gitignore
# .gitignore

# Python 相關
__pycache__/
*.pyc
.env
.env.example
venv/
*.egg-info/

# Node.js 相關
node_modules/
build/
dist/
.npm/
*.log

# Docker 相關
.docker/

# 執行期間產生的資料 (絕不納入版本控制)
music_file/
db/

# IDE 與作業系統產生的檔案
.vscode/
.idea/
.DS_Store
```

### 步驟 5：未來展望 - 基於映像檔的 GitHub Actions 自動化部署

新的容器化策略使我們的 CI/CD 流程更佳簡潔和標準化。部署的核心是 **不可變的 Docker 映像檔**，而非同步原始碼。

未來的 `deploy.yml` 工作流程將更新為：

1.  **觸發 (Trigger)**：設定在程式碼推送到 `main` 分支時自動觸發。
2.  **建置與推送任務 (Build & Push Job)**：
    *   Checkout 託管庫的最新程式碼。
    *   登入 Docker Hub 或其他容器映像庫。
    *   使用 `docker compose build` 同時建置 `nginx` (前端) 和 `fast-api` (後端) 服務的映像檔。
    *   為映像檔打上唯一的標籤 (例如 Git SHA)。
    *   將 `your-repo/nginx:git-sha` 和 `your-repo/fast-api:git-sha` 推送到容器映像庫。
3.  **部署任務 (Deploy Job)**：
    *   此任務將依賴於「建置與推送」任務的成功完成。
    *   透過 SSH 安全地連線到您的伺服器。
    *   在伺服器上，拉取最新的 `docker-compose.yml` 檔案 (可透過 `git pull` 或 `scp` 傳輸)。
    *   執行 `docker compose pull`，它會自動拉取 `docker-compose.yml` 中定義的最新版映像檔。
    *   最後在伺服器上執行 `docker compose up -d --remove-orphans`，以平滑地方式使用新的映像檔重新啟動服務。

這種完全基於映像檔的部署流程，讓版本控制、部署和回滾都變得極為可靠和簡單。

---

## 詳細檔案結構整理步驟

在初始化 Git 託管庫之前，我們需要先將現有的檔案和資料夾整理成目標結構。

1.  **整理後端服務 (`fast-api`)**
    *   `mv /home/user/docker/app /home/user/repo/backend`

2.  **整理前端專案 (`lightdance`)**
    *   `mv /home/user/repo/lightdance /home/user/repo/frontend`

3.  **整理 Nginx 設定**
    *   `mv /home/user/docker/nginx /home/user/repo/`

4.  **整理根目錄檔案與資料**
    *   `mv /home/user/docker/docker-compose.yml /home/user/repo/`
    *   `mv /home/user/docker/music_file /home/user/repo/`
    *   `mv /home/user/docker/db /home/user/repo/`

5.  **建立資料庫初始化目錄**
    *   `mkdir /home/user/repo/mongo-init`
    *   (接著在此目錄中建立 `01-init-data.js` 檔案)

6.  **清理**
    *   完成以上步驟後，`/home/user/docker` 目錄下的相關內容都已被移動，可以安全地進行清理。
    *   `rm -rf /home/user/docker`