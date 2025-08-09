# Lightdance 專案

這是一個全端網頁應用程式，提供一個平台來設計與控制光舞。它包含一個 React 前端、一個 FastAPI 後端，並使用 MongoDB 作為資料庫。整個專案透過 Docker Compose 進行容器化管理。

## 技術棧

*   **前端**: [React](https://reactjs.org/)
*   **後端**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
*   **資料庫**: [MongoDB](https://www.mongodb.com/)
*   **網頁伺服器**: [Nginx](https://www.nginx.com/)
*   **資料庫管理**: [Mongo Express](https://github.com/mongo-express/mongo-express)
*   **容器化**: [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

## 開始使用

請依照以下步驟來啟動並運行此專案。

### 環境要求

您只需要在您的電腦上安裝好 Docker 以及 Docker Compose。
*   [安裝 Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 安裝與運行

1.  **Clone 專案** (如果您是從 git repository 下載)
    ```sh
    git clone <your-repository-url>
    cd lightdance
    ```

2.  **執行部署腳本**
    此腳本會自動停止舊容器、建立新的映像檔，並在背景啟動所有服務。
    ```sh
    sh deploy.sh
    ```

## 如何使用

當所有服務成功啟動後，您可以透過以下連結存取應用程式的不同部分：

*   **前端網頁**: [http://localhost](http://localhost)
*   **後端 API**: [http://localhost:8000/docs](http://localhost:8000/docs) (FastAPI 自動產生的 API 文件)
*   **Mongo Express 資料庫管理介面**: [http://localhost:8081](http://localhost:8081)

## 專案結構

```
lightdance/
├── backend/         # FastAPI 後端應用程式
├── frontend/        # React 前端應用程式
├── mongo-init/      # MongoDB 初始化腳本
├── nginx/           # Nginx 設定檔
├── docker-compose.yml # 定義所有服務與它們的關係
├── deploy.sh        # 部署專案的腳本
└── README.md        # 您正在閱讀的檔案
```
