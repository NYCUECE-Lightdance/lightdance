#!/bin/bash

# --- Color Definitions ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Function to wait for a service to be up
wait_for_service() {
    local url=$1
    local service_name=$2
    local timeout=30
    local interval=2
    local end_time=$((SECONDS + timeout))

    echo -e "⏳ ${YELLOW}正在等待 ${service_name} 啟動...${NC}"
    while [ $SECONDS -lt $end_time ]; do
        status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
        if [[ "$status_code" -ge 200 && "$status_code" -lt 400 ]]; then
            echo -e "✅ ${GREEN}${service_name} 已在 ${BOLD}${url}${NC}${GREEN} 成功啟動！${NC}"
            return 0
        fi
        sleep $interval
    done

    echo -e "❌ ${RED}錯誤：${service_name} 在 ${timeout} 秒內啟動失敗。${NC}"
    return 1
}

# Cleanup function to stop services when script exits
cleanup() {
    echo ""
    trap '' SIGINT SIGTERM EXIT # Ignore further signals to prevent re-entry
    echo -e "🛑 ${YELLOW}正在停止開發環境...${NC}"
    if [ ! -z "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "🎨 ${BLUE}正在停止前端服務...${NC}"
        kill "$FRONTEND_PID" 2>/dev/null
    fi
    echo -e "📦 ${BLUE}正在停止後端服務與資料庫...${NC}"
    docker compose --env-file .env.development down
    echo -e "✅ ${GREEN}所有服務已成功停止。${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

echo -e "🚀 ${BOLD}正在啟動 LightDance 開發環境...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "❌ ${RED}Docker 未在運行中，請先啟動 Docker。${NC}"
    exit 1
fi

echo -e "📦 ${BLUE}正在建置並啟動後端服務與資料庫...${NC}"
# Build quietly first, then start the services
echo -e "🤫 ${YELLOW}簡化建置日誌，僅顯示錯誤...${NC}"
docker compose --env-file .env.development build --quiet backend
docker compose --env-file .env.development up -d backend mongo mongo-express

# Wait for the backend API to be ready
wait_for_service http://localhost:8000/api "Backend API" || cleanup

echo ""
echo -e "🎨 ${BLUE}準備啟動前端開發伺服器...${NC}"
echo "前端開發伺服器將在背景啟動 (port 3000)"

# Check if frontend/package.json exists
if [ ! -f "frontend/package.json" ]; then
    echo -e "❌ ${RED}找不到 frontend/package.json，請確認您在正確的專案根目錄。${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo -e "📦 ${YELLOW}未偵測到前端依賴套件，正在自動安裝...${NC}"
    (cd frontend && npm install > ../frontend-install.log 2>&1)
    echo -e "✅ ${GREEN}依賴套件安裝完成。${NC} (日誌位於 frontend-install.log)"
fi

# Start frontend in background, redirecting output to log file
echo -e "🚀 ${BLUE}正在啟動前端服務...${NC}"
# We start it in a subshell to capture its PID
(cd frontend && exec npm start > ../frontend-dev.log 2>&1 &)
NPM_PID=$! # This is the PID of the npm process

# Wait for the frontend service to be ready
wait_for_service http://localhost:3000 "Frontend" || cleanup

# After the service is up, find the actual server PID listening on the port.
# This is more reliable for display and for the cleanup function.
FRONTEND_PID=$(lsof -t -i:3000 2>/dev/null)
if [ -z "$FRONTEND_PID" ]; then
    echo -e "⚠️ ${YELLOW}無法透過 lsof 偵測到前端進程的 PID，將使用備用 PID。${NC}"
    FRONTEND_PID=$NPM_PID # Fallback to the original PID
fi

echo -e "\n🎉 ${GREEN}${BOLD}全端開發環境已成功啟動！${NC}"
echo ""
echo -e "📍 ${BOLD}服務存取位置:${NC}"
echo -e "   - ${BOLD}前端 (Frontend):${NC}      ${GREEN}http://localhost:3000${NC} (支援熱重載)"
echo -e "   - ${BOLD}後端 API (Backend):${NC}    ${GREEN}http://localhost:8000/api${NC}"
echo -e "   - ${BOLD}資料庫管理 (Mongo):${NC} ${GREEN}http://localhost:8081${NC}"
echo ""
echo -e "📋 ${BOLD}常用管理指令:${NC}"
echo -e "   - 查看前端日誌: ${BOLD}tail -f frontend-dev.log${NC}"
echo -e "   - ${RED}按下 Ctrl+C 來停止所有服務${NC}"
echo ""
echo -e "🔧 ${YELLOW}前端進程 PID: ${FRONTEND_PID}${NC}"
echo ""
echo -e "🎯 ${GREEN}開發環境運行中...${NC}"

# Wait for the frontend process to exit. The 'trap' will handle cleanup.
wait $NPM_PID