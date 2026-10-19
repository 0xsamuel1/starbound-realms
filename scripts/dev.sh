#!/bin/bash

# One-command local development script for Starbound Realms
# Starts backend and frontend together with clear output

set -e

echo "🚀 Starbound Realms - Local Development"
echo "======================================"
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Check if Docker is running (for Postgres)
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start Postgres
echo "📦 Starting Postgres..."
docker-compose up -d postgres
sleep 2

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    pnpm install
fi

# Start backend in background
echo ""
echo "🔧 Starting backend on http://localhost:3001..."
cd backend
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "   Created .env from .env.example"
fi
pnpm dev &
BACKEND_PID=$!
cd ..

# Start frontend in background
echo ""
echo "🎨 Starting frontend on http://localhost:5173..."
cd frontend
pnpm dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Development servers started!"
echo ""
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
