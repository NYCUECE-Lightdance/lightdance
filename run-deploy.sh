#!/bin/bash

# =================================================================
#     生產環境部署腳本 (Production Deployment)
# =================================================================
#
# 功能:
#   - 停止並移除由 docker-compose.prod.yml 定義的舊容器。
#   - 使用 docker-compose.prod.yml 重新建置映像檔 (image)。
#   - 在背景啟動所有生產環境所需的服務。
#
# 使用注意:
#   - 此腳本會使用 docker-compose.prod.yml 作為設定檔。
#   - 您可以建立一個 .env.production 檔案來覆寫 .yml 中的預設環境變數。
#

# --- 風格定義 ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- 設定 ---
COMPOSE_FILE="docker-compose.prod.yml"
# 建議為生產環境建立一個獨立的 .env 檔案
ENV_FILE=".env.production"

# --- 主腳本 ---
echo -e "🚀 ${BOLD}正在啟動 LightDance 生產環境部署...${NC}"
echo -e "   - 使用設定檔: ${BOLD}${COMPOSE_FILE}${NC}"

# 檢查是否有正式環境的 .env 檔案
if [ -f "$ENV_FILE" ]; then
    echo -e "   - 使用環境變數檔: ${BOLD}${ENV_FILE}${NC}"
    ENV_FLAG="--env-file ${ENV_FILE}"
else
    echo -e "   - ${YELLOW}未找到 ${ENV_FILE}，將使用 .yml 中的預設環境變數。${NC}"
    ENV_FLAG=""
fi
echo ""


# 1. 停止並移除舊的生產環境容器
echo -e "📦 ${BLUE}正在停止並移除舊的服務...${NC}"
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} down

# 2. 重新建置並啟動新的生產環境容器
echo -e "🚀 ${BLUE}正在重新建置並啟動新的服務 (in background)...${NC}"
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} up --build -d

echo ""
echo -e "✅ ${GREEN}${BOLD}部署完成！${NC}"
echo -e "   請使用 ${BOLD}docker compose -f ${COMPOSE_FILE} logs -f${NC} 來查看服務日誌。"
