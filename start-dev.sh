#!/bin/bash

# =================================================================
#     本地開發環境啟動腳本 (Local Development)
# =================================================================
#
# 功能:
#   - 檢查 Docker 是否正在運行
#   - 使用 docker-compose.dev.yml 啟動所有本地開發服務
#   - 監控服務狀態，並在啟動後顯示訪問位置
#   - 設定 Ctrl+C 快捷鍵以方便地關閉所有服務
#

# --- Color Definitions ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- Configuration ---
COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env.development"

# Function to wait for a service to be up
wait_for_service() {
    local url=$1
    local service_name=$2
    # 增加 timeout 時間以應對較慢的啟動
    local timeout=600
    local interval=2
    local end_time=$((SECONDS + timeout))

    echo -e "⏳ ${YELLOW}正在等待 ${service_name} 啟動 (最長 ${timeout} 秒)...${NC}"
    while [ $SECONDS -lt $end_time ]; do
        # 接受 2xx, 3xx, 4xx 的 HTTP 狀態碼，因為 404 也表示服務已啟動並在回應
        status_code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
        if [[ "$status_code" -ge 200 && "$status_code" -lt 500 ]]; then
            echo -e "✅ ${GREEN}${service_name} 已在 ${BOLD}${url}${NC}${GREEN} 成功啟動！${NC}"
            return 0
        fi
        sleep $interval
    done

    echo -e "❌ ${RED}錯誤：${service_name} 在 ${timeout} 秒內啟動失敗。${NC}"
    echo -e "   請使用 ${BOLD}docker compose -f ${COMPOSE_FILE} logs${NC} 查看日誌。 "
    return 1
}

# Cleanup function to stop services when script exits
cleanup() {
    echo ""
    trap '' SIGINT SIGTERM EXIT # 避免重複觸發
    echo -e "🛑 ${YELLOW}正在停止開發環境...${NC}"
    docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} down
    echo -e "✅ ${GREEN}所有開發服務已成功停止。${NC}"
    exit 0
}

# 設定 Ctrl+C 的中斷處理
trap cleanup SIGINT SIGTERM

# --- Main Script ---
echo -e "🚀 ${BOLD}正在啟動 LightDance 本地開發環境...${NC}"
echo -e "   - 使用設定檔: ${BOLD}${COMPOSE_FILE}${NC}"

if [ -f "$ENV_FILE" ]; then
    echo -e "   - 使用環境變數檔: ${BOLD}${ENV_FILE}${NC}"
fi
echo ""

# 1. 檢查 Docker 是否正在運行
if ! docker info > /dev/null 2>&1; then
    echo -e "❌ ${RED}Docker 未在運行中，請先啟動 Docker。${NC}"
    exit 1
fi

# 2. 使用 docker-compose.dev.yml 建置並啟動所有服務
echo -e "📦 ${BLUE}正在建置並啟動所有開發服務 (in background)...${NC}"
docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up --build -d

# 3. 等待後端與前端服務啟動
wait_for_service http://localhost:8000/api "Backend API" || cleanup
wait_for_service http://localhost:3000 "Frontend" || cleanup

# 4. 顯示成功訊息與訪問位置
echo -e "\n🎉 ${GREEN}${BOLD}全端開發環境已成功啟動！${NC}"
echo ""
echo -e "📍 ${BOLD}服務存取位置:${NC}"
echo -e "   - ${BOLD}前端 (Frontend):${NC}      ${GREEN}http://localhost:3000${NC} (支援熱重載)"
echo -e "   - ${BOLD}後端 API (Backend):${NC}    ${GREEN}http://localhost:8000/api${NC}"
echo -e "   - ${BOLD}資料庫管理 (Mongo):${NC} ${GREEN}http://localhost:8081${NC}"
echo ""
echo -e "📋 ${BOLD}常用管理指令:${NC}"
echo -e "   - 查看所有服務日誌: ${BOLD}docker compose -f ${COMPOSE_FILE} logs -f${NC}"
echo -e "   - 查看前端日誌:     ${BOLD}docker compose -f ${COMPOSE_FILE} logs -f frontend-dev${NC}"
echo -e "   - ${RED}按下 Ctrl+C 來停止所有服務${NC}"
echo ""
echo -e "🎯 ${GREEN}開發環境運行中...${NC}"

# 保持腳本運行以接收 Ctrl+C 指令
# 所有服務都在背景的 Docker 容器中運行
tail -f /dev/null
