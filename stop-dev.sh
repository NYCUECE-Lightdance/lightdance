#!/bin/bash

echo "🛑 停止 LightDance 開發環境..."

# 停止前端服務 (查找 npm start 進程)
echo "🎨 停止前端服務..."
FRONTEND_PIDS=$(pgrep -f "npm.*start" 2>/dev/null)
if [ ! -z "$FRONTEND_PIDS" ]; then
    echo "發現前端進程: $FRONTEND_PIDS"
    kill $FRONTEND_PIDS 2>/dev/null
    echo "✅ 前端服務已停止"
else
    echo "ℹ️  沒有找到運行中的前端服務"
fi

# 停止 Docker 服務
echo "📦 停止後端服務和資料庫..."
docker-compose down

# 清理日誌文件 (可選)
if [ -f "frontend-dev.log" ]; then
    echo "🧹 清理前端日誌..."
    rm frontend-dev.log
fi

echo ""
echo "✅ 開發環境已完全停止"
echo ""
echo "如需重新啟動，請執行: ./start-dev.sh"
