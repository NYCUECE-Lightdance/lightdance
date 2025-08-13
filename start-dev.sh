#!/bin/bash

# Cleanup function to stop services when script exits
cleanup() {
    echo ""
    echo "🛑 Stopping development environment..."
    if [ ! -z "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "🎨 Stopping frontend service..."
        kill "$FRONTEND_PID" 2>/dev/null
    fi
    echo "📦 Stopping backend services and database..."
    docker compose down
    echo "✅ All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

echo "🚀 Starting LightDance development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running, please start Docker first"
    exit 1
fi

echo "📦 Starting backend services and database..."
# Start only backend related services, not nginx
docker compose up -d backend mongo mongo-express

echo "⏳ Waiting for services to start..."
sleep 5

# Check service status
echo "🔍 Checking service status:"
if curl -s http://localhost:8000/api > /dev/null; then
    echo "✅ Backend API service is running (http://localhost:8000/api)"
else
    echo "⚠️  Backend API service might still be starting..."
fi

echo ""
echo "🎯 Development environment is ready!"
echo ""
echo "🎨 Starting frontend development server..."
echo "Frontend will start in background (port 3000)"

# Check if frontend/package.json exists
if [ ! -f "frontend/package.json" ]; then
    echo "❌ Cannot find frontend/package.json, please ensure you're in the correct directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Dependencies not detected, installing..."
    cd frontend
    npm install
    cd ..
    echo "✅ Dependencies installed successfully"
fi

# Start frontend in background, redirecting output to log file
echo "🚀 Starting frontend service..."
cd frontend
npm start > ../frontend-dev.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
echo "⏳ Waiting for frontend service to start..."
sleep 8

# Check if frontend started successfully
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend service started (http://localhost:3000)"
else
    echo "⚠️  Frontend service might still be starting, please wait..."
fi

echo ""
echo "🎉 Full development environment is up and running!"
echo ""
echo "📍 Service URLs:"
echo "   - Frontend: http://localhost:3000 (Hot Reload)"
echo "   - API: http://localhost:8000/api"
echo "   - Mongo Express: http://localhost:8081"
echo ""
echo "📋 Management commands:"
echo "   - View frontend logs: tail -f frontend-dev.log"
echo "   - Press Ctrl+C to stop all services"
echo ""
echo "🔧 Frontend process PID: $FRONTEND_PID"
echo "✅ Frontend has automatically detected and connected to the API endpoint"
echo ""
echo "🎯 Development environment is running. Press Ctrl+C to stop..."

# Keep script running and wait for signals
while true; do
    sleep 1
done
