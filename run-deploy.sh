#!/bin/bash

# =================================================================
#     生產環境部署腳本 (Production Deployment)
# =================================================================
#
# 功能:
#   1. 使用 Docker 臨時容器構建前端靜態檔案 (Vite Build)。
#   2. 將靜態檔案部署到宿主機的指定目錄 (供外部 Nginx 使用)。
#   3. 重新啟動後端與資料庫容器 (docker-compose.prod.yml)。
#

# --- 設定 (請根據您的伺服器環境修改此處) ---
# 外部 Nginx 指向的靜態檔案根目錄
# DEPLOY_TARGET_DIR="/var/www/lightdance/html"
DEPLOY_TARGET_DIR="/usr/share/nginx/html/lightdance"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.deployment"
FRONTEND_DIR="./frontend"

# --- 風格定義 ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- 主腳本 ---
echo -e "🚀 ${BOLD}啟動 LightDance 生產環境部署...${NC}"

# 0. 檢查環境變數檔
if [ -f "$ENV_FILE" ]; then
    echo -e "   - 使用環境變數檔: ${BOLD}${ENV_FILE}${NC}"
    ENV_FLAG="--env-file ${ENV_FILE}"
else
    echo -e "   - ${YELLOW}未找到 ${ENV_FILE}，將使用預設設定。${NC}"
    ENV_FLAG=""
fi

# 1. 前端構建 (Build Frontend)
echo ""
echo -e "🔨 ${BLUE}步驟 1/3: 正在構建前端靜態檔案 (使用 Docker node:20-alpine)...${NC}"

# 使用 Docker 執行 npm install && npm run build
# -v 掛載 frontend 目錄
# 使用 root 權限在容器內構建，然後在結束前嘗試 chown 回目前使用者，避免權限問題
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

docker run --rm \
    -v "$(pwd)/${FRONTEND_DIR}:/app" \
    -w /app \
    node:20-alpine \
    sh -c "npm install && npm run build && chown -R $CURRENT_UID:$CURRENT_GID /app/dist"

if [ $? -eq 0 ]; then
    echo -e "   - ${GREEN}前端構建成功！${NC}"
else
    echo -e "   - ${RED}前端構建失敗，請檢查錯誤訊息。${NC}"
    exit 1
fi

# 2. 部署靜態檔案 (Deploy Static Files)
echo ""
echo -e "📂 ${BLUE}步驟 2/3: 正在部署檔案到 ${DEPLOY_TARGET_DIR}...${NC}"

# 檢查目標目錄是否存在，不存在則建立
if [ ! -d "$DEPLOY_TARGET_DIR" ]; then
    echo -e "   - 目錄不存在，嘗試建立: $DEPLOY_TARGET_DIR"
    mkdir -p "$DEPLOY_TARGET_DIR"
    if [ $? -ne 0 ]; then
         echo -e "   - ${RED}無法建立目錄，請檢查權限 (可能需要 sudo)。${NC}"
         exit 1
    fi
fi

# 清空目標目錄並複製新檔案
echo -e "   - 清除舊檔案..."
rm -rf "$DEPLOY_TARGET_DIR"/*

echo -e "   - 複製新檔案..."
cp -r "${FRONTEND_DIR}/dist/"* "$DEPLOY_TARGET_DIR/"

if [ $? -eq 0 ]; then
    echo -e "   - ${GREEN}檔案部署成功！${NC}"
else
    echo -e "   - ${RED}檔案複製失敗，請檢查目錄權限。${NC}"
    exit 1
fi

# 3. 重啟後端服務 (Restart Backend)
echo ""
echo -e "🐳 ${BLUE}步驟 3/3: 正在重啟後端服務...${NC}"

# 停止並移除舊容器
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} down

# 啟動新容器
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} up --build -d

echo ""
echo -e "✅ ${GREEN}${BOLD}部署全部完成！${NC}"
echo -e "   - 靜態檔案已更新至: ${BOLD}${DEPLOY_TARGET_DIR}${NC}"
echo -e "   - 後端 API 運行於: ${BOLD}localhost:8000${NC} (或設定的 API_PORT)"
echo -e "   請確保您的外部 Nginx 已設定 root 指向上述目錄，並將 /api 代理至後端。"