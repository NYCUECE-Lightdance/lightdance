#!/bin/bash

# =================================================================
#     生產環境解除部署腳本 (Production Teardown)
# =================================================================
#
# 功能:
#   - 停止由 docker-compose.prod.yml 定義的生產環境容器
#   - 移除相關的資料卷 (volumes) 
#   - 保留 Docker 映像檔以加快下次部署速度
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
ENV_FILE=".env.deployment"

# --- 主腳本 ---
echo -e "🛑 ${BOLD}正在停止 LightDance 生產環境...${NC}"
echo -e "   - 使用設定檔: ${BOLD}${COMPOSE_FILE}${NC}"

# 檢查是否有正式環境的 .env 檔案
if [ -f "$ENV_FILE" ]; then
    echo -e "   - 使用環境變數檔: ${BOLD}${ENV_FILE}${NC}"
    ENV_FLAG="--env-file ${ENV_FILE}"
else
    ENV_FLAG=""
fi
echo ""

echo -e "📦 ${BLUE}正在停止容器並移除資料卷...${NC}"
echo -e "   - 停止的容器: ${BOLD}frontend, backend, mongo, mongo-express${NC}"

# -v 旗標會移除服務建立的命名資料卷
# Docker 映像檔將被保留，以便在下次部署時可以更快地重建
docker compose -f ${COMPOSE_FILE} ${ENV_FLAG} down -v

echo ""
echo -e "✅ ${GREEN}${BOLD}生產環境已成功停止！${NC}"
echo -e "   - Docker 映像檔已保留以加快下次部署速度"
echo -e "   - 所有容器和資料卷已移除"
