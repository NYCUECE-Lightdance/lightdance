#!/bin/bash

echo "🚀 啟動 LightDance 開發環境..."

# 檢查Docker是否運行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未運行，請先啟動 Docker"
    exit 1
fi

echo "📦 啟動後端服務和資料庫..."
# 只啟動後端相關服務，不啟動nginx
docker-compose up -d backend mongo mongo-express

echo "⏳ 等待服務啟動..."
sleep 5

# 檢查服務狀態
echo "🔍 檢查服務狀態:"
if curl -s http://localhost:8000/api > /dev/null; then
    echo "✅ 後端 API 服務正常 (http://localhost:8000/api)"
else
    echo "⚠️  後端 API 服務可能還在啟動中..."
fi

echo ""
echo "🎯 開發環境已準備就緒！"
echo ""
echo "🎨 啟動前端開發服務器..."
echo "前端將在新的終端窗口中啟動 (port 3000)"

# 檢查是否在frontend目錄存在package.json
if [ ! -f "frontend/package.json" ]; then
    echo "❌ 找不到 frontend/package.json，請確保在正確的目錄執行"
    exit 1
fi

# 檢查是否已安裝依賴
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 檢測到未安裝依賴，正在安裝..."
    cd frontend
    npm install
    cd ..
    echo "✅ 依賴安裝完成"
fi

# 使用背景模式啟動前端，輸出重定向到日誌文件
echo "🚀 啟動前端服務..."
cd frontend
nohup npm start > ../frontend-dev.log 2>&1 &
FRONTEND_PID=$!
cd ..

# 等待前端啟動
echo "⏳ 等待前端服務啟動..."
sleep 8

# 檢查前端是否成功啟動
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ 前端服務已啟動 (http://localhost:3000)"
else
    echo "⚠️  前端服務可能還在啟動中，請稍候..."
fi

echo ""
echo "🎉 完整開發環境已啟動！"
echo ""
echo "📍 服務地址："
echo "   - 前端: http://localhost:3000 (Hot Reload)"
echo "   - API: http://localhost:8000/api"
echo "   - Mongo Express: http://localhost:8081"
echo ""
echo "📋 管理指令："
echo "   - 查看前端日誌: tail -f frontend-dev.log"
echo "   - 停止所有服務: docker-compose down && kill $FRONTEND_PID"
echo "   - 只停止前端: kill $FRONTEND_PID"
echo ""
echo "🔧 前端進程 PID: $FRONTEND_PID"
echo "� 前端已自動檢測並連接到 API 端點"
