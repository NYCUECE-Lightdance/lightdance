#!/bin/bash

# =================================================================
#     開發環境停止腳本 (Development Teardown)
# =================================================================
#
# 功能:
#   - 停止由 docker-compose.dev.yml 定義的開發環境容器
#   - 移除相關的資料卷 (volumes)
#   - 清除產生的 Python 快取檔案
#

# --- 風格定義 ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- 設定 ---
COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env.development"

# --- 主腳本 ---
echo -e "🛑 ${BOLD}正在停止 LightDance 開發環境...${NC}"
echo -e "   - 使用設定檔: ${BOLD}${COMPOSE_FILE}${NC}"

# 檢查是否有開發環境的 .env 檔案
if [ -f "$ENV_FILE" ]; then
    echo -e "   - 使用環境變數檔: ${BOLD}${ENV_FILE}${NC}"
    ENV_FLAG="--env-file ${ENV_FILE}"
else
    ENV_FLAG=""
fi
echo ""

echo -e "📦 ${BLUE}正在停止容器並移除資料卷...${NC}"
echo -e "   - 停止的容器: ${BOLD}frontend-dev, backend-dev, mongo-dev, mongo-express-dev${NC}"

# -v 旗標會移除與容器關聯的匿名資料卷
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} down -v

echo ""
echo -e "🧹 ${YELLOW}正在清除 Python 快取檔案...${NC}"
find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true

echo ""
echo -e "✅ ${GREEN}${BOLD}開發環境已成功停止並清理！${NC}"
echo -e "   - 所有開發容器和資料卷已移除"
echo -e "   - Python 快取檔案已清除"
