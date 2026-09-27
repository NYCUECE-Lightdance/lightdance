# Nginx 在此專案中的角色與設定詳解

本文檔旨在說明 Nginx 在此 Docker Compose 環境中所扮演的具體角色，以及如何透過設定檔實現其功能。

## Nginx 的兩大核心功能

在此專案中，Nginx 主要負責以下兩項關鍵任務：

1.  **提供前端網站 (React App)**：當使用者透過瀏覽器訪問您的服務時，由 Nginx 將建置好的 React 前端應用程式介面呈現給他們。
2.  **擔任 API 的反向代理 (Reverse Proxy)**：當前端應用程式需要與後端溝通時 (例如使用者登入、讀取資料庫內容)，Nginx 會將這些 API 請求轉發給在另一個容器中運行的 FastAPI 服務。

---

## 實現細節分析

### 1. Docker Compose (`docker-compose.yml`)

`docker-compose.yml` 檔案中與 `nginx` 服務相關的設定是整個架構的基礎：

```yaml
services:
  nginx:
    image: nginx
    container_name: nginx
    volumes:
      - ./www:/home/www
      - ./nginx/:/etc/nginx/conf.d
    ports:
      - 80:80
    depends_on:
      - fast-api
```

-   `image: nginx`：指定使用官方的 Nginx 映像檔來建立服務容器。
-   `ports: - 80:80`：將主機的 80 連接埠 (標準 HTTP 流量入口) 映射到 Nginx 容器的 80 連接埠。這是讓外部流量能夠進入 Nginx 的關鍵。
-   `volumes:`：這是 Nginx 取得其設定檔和網站內容的來源。
    -   `./www:/home/www`：將主機的 `./docker/www` 資料夾**掛載**到容器內的 `/home/www`。Nginx 會從此處讀取並提供前端的靜態檔案 (HTML, CSS, JS)。
    -   `./nginx/:/etc/nginx/conf.d`：將主機的 `./docker/nginx/` 資料夾掛載到容器內 Nginx 預設讀取設定檔的路徑。我們的 `default.conf` 就放在這裡。
-   `depends_on: - fast-api`：確保 `nginx` 服務會在 `fast-api` 服務啟動之後才啟動，避免將請求轉發到一個尚未就緒的後端。

### 2. Nginx 設定檔 (`nginx/default.conf`)

這個檔案是 Nginx 的大腦，它定義了如何處理不同類型的請求。

```nginx
server {
    listen 80;
    server_name 140.113.160.136 localhost;

    # 功能 2: API 反向代理
    location ~ ^/(token|users|timelist|items|raw|...) {
        proxy_pass http://fast-api:8000;
        # ... 其他 proxy header 設定 ...
    }

    # 功能 1: 提供前端網站
    location / {
        root /home/www;
        index index.html;
        try_files $uri /index.html;
    }
}
```

-   **`location / { ... }` (提供前端靜態檔案)**
    -   此區塊是**預設規則**，處理所有未被其他 `location` 規則匹配的請求。
    -   `root /home/www;`：設定網站檔案的根目錄。
    -   `try_files $uri /index.html;`：這是單頁應用 (SPA) 的核心設定。Nginx 會先嘗試尋找與請求路徑完全對應的檔案 (如 `/static/main.js`)。如果找不到，它不會回傳 404 錯誤，而是回傳 `/index.html`，讓前端的 React Router 接管路由，從而實現流暢的頁面切換。

-   **`location ~ ^/(token|...) { ... }` (API 反向代理)**
    -   `location ~` 表示此規則使用**正規表示式**來匹配請求路徑。
    -   `^/(token|users|...)`：這個表達式會匹配所有 API 的路徑前綴。
    -   `proxy_pass http://fast-api:8000;`：這是反向代理的關鍵指令。它告訴 Nginx，將所有符合此規則的請求**轉發**到 `http://fast-api:8000`。
        -   `fast-api` 是在 Docker Compose 內部網路中，FastAPI 服務的**主機名稱**。容器之間可以透過服務名稱直接通訊。
        -   `:8000` 是 FastAPI 服務在容器內監聽的連接埠。

---

### 總結請求流程

1.  **使用者訪問網站**：瀏覽器請求 `http://<your-ip>/`。
2.  **Nginx 處理前端請求**：請求到達 Nginx。路徑 `/` 不符合 API 規則，因此由 `location /` 處理，Nginx 回傳 `/home/www/index.html`。前端 React 應用啟動。
3.  **前端發起 API 請求**：React 應用需要登入，於是向後端發起一個到 `/token` 的請求。
4.  **Nginx 轉發 API 請求**：Nginx 收到此請求。路徑 `/token` 符合 API 的正規表示式規則。
5.  **請求被代理**：Nginx 將此請求轉發到 Docker 網路中的 `http://fast-api:8000/token`。
6.  **後端處理並回覆**：FastAPI 服務處理請求，並將結果回傳給 Nginx。
7.  **Nginx 回傳給使用者**：Nginx 最終將後端的回覆傳回給使用者的瀏覽器。

透過這種方式，Nginx 巧妙地將靜態內容和動態 API 請求分開處理，扮演了整個系統的流量總管。
