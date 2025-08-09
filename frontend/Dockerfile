# --- 第 1 階段：建置階段 (Build Stage) ---
# 使用一個包含 Node.js 環境的官方映像檔作為建置基礎
# 'AS build' 給這個階段命名，方便後續引用
FROM node:18-alpine AS build

# 在容器內建立一個工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
# 這是為了利用 Docker 的快取機制。只要這兩個檔案不變，
# 下一步的 npm install 就不會重新執行，加快後續建置速度。
COPY package*.json ./

# 安裝所有專案依賴
RUN npm install

# 將前端專案的所有原始碼複製到容器中
COPY . .

# 執行建置指令，產生優化後的靜態檔案 (通常在 /app/build 或 /app/dist)
RUN npm run build

# --- 第 2 階段：生產階段 (Production Stage) ---
# 使用一個非常輕量的官方 Nginx 映像檔作為最終的運行環境
FROM nginx:alpine

# 關鍵步驟：從上一個階段 ('build' stage) 中，
# 只複製我們需要的建置成果 (build 資料夾內的檔案) 到 Nginx 的網站根目錄
COPY --from=build /app/build /usr/share/nginx/html

# (可選) 如果您有自訂的 Nginx 設定檔，也可以複製進去
# COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf

# 宣告容器將會監聽 80 port
EXPOSE 80

# 容器啟動時執行的指令：以前景模式啟動 Nginx
CMD ["nginx", "-g", "daemon off;"]
