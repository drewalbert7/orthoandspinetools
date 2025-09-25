#!/bin/bash

# OrthoAndSpineTools Service Startup Script

echo "🏥 Starting OrthoAndSpineTools Services..."

# Function to check if a port is in use
check_port() {
    local port=$1
    if netstat -tlnp | grep -q ":$port "; then
        echo "✅ Port $port is already in use"
        return 0
    else
        echo "❌ Port $port is not in use"
        return 1
    fi
}

# Start backend service
echo "🦀 Starting backend service..."
cd ~/orthoandspinetools-medical-platform/backend

if check_port 3000; then
    echo "Backend already running on port 3000"
else
    echo "Starting backend on port 3000..."
    npm run dev &
    BACKEND_PID=$!
    echo "Backend started with PID: $BACKEND_PID"
fi

# Wait a moment for backend to start
sleep 5

# Start frontend service
echo "⚛️ Starting frontend service..."
cd ~/orthoandspinetools-medical-platform/frontend

if check_port 5173; then
    echo "Frontend already running on port 5173"
else
    echo "Starting frontend on port 5173..."
    npm run dev &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
fi

echo "🎉 Services started!"
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo "Website: https://orthoandspinetools.com"

# Keep script running
wait
