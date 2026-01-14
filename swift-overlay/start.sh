#!/bin/bash
# =============================================================================
# Sidebar Overlay - Unified Startup Script
# =============================================================================
# Starts all services with one command:
#   1. Vite dev server (React frontend)
#   2. Screen Context Python service (screen capture + AI)
#   3. Swift Overlay (native macOS wrapper)
# 
# Usage: ./start.sh [--build]
#   --build    Rebuild Swift app before starting
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDEBAR_DIR="$SCRIPT_DIR/../sidebar-os"
SWIFT_DIR="$SCRIPT_DIR"
SCREEN_CONTEXT_DIR="$SCRIPT_DIR/../screen-context"
INVESTMENT_SCOUT_DIR="$SCRIPT_DIR/../investment-scout"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Sidebar Overlay...${NC}"

# Check if we should rebuild
if [[ "$1" == "--build" ]]; then
    echo -e "${YELLOW}📦 Building Swift app...${NC}"
    cd "$SWIFT_DIR"
    swift build
    echo -e "${GREEN}✅ Swift build complete${NC}"
fi

# Check if Swift binary exists
if [ ! -f "$SWIFT_DIR/.build/debug/SidebarOverlay" ]; then
    echo -e "${YELLOW}📦 Swift binary not found, building...${NC}"
    cd "$SWIFT_DIR"
    swift build
    echo -e "${GREEN}✅ Swift build complete${NC}"
fi

# Track PIDs for cleanup
VITE_PID=""
SCREEN_PID=""
INVEST_PID=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    [ -n "$VITE_PID" ] && kill $VITE_PID 2>/dev/null || true
    [ -n "$SCREEN_PID" ] && kill $SCREEN_PID 2>/dev/null || true
    [ -n "$INVEST_PID" ] && kill $INVEST_PID 2>/dev/null || true
    echo -e "${GREEN}✅ Shutdown complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start Vite dev server in background
echo -e "${BLUE}🌐 Starting React dev server...${NC}"
cd "$SIDEBAR_DIR"
npm run dev &
VITE_PID=$!

# Start Screen Context service in background
echo -e "${BLUE}📸 Starting Screen Context service...${NC}"
cd "$SCREEN_CONTEXT_DIR"
if [ -d "venv" ]; then
    source venv/bin/activate
    python server.py &
    SCREEN_PID=$!
    echo -e "${GREEN}✅ Screen Context service started (port 3002)${NC}"
else
    echo -e "${RED}⚠️  Screen Context venv not found. Run setup first:${NC}"
    echo -e "   cd $SCREEN_CONTEXT_DIR && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
fi

# Start Investment Scout service in background (optional)
echo -e "${BLUE}💰 Starting Investment Scout service...${NC}"
cd "$INVESTMENT_SCOUT_DIR"
if [ -d "venv" ]; then
    source venv/bin/activate
    python server.py &
    INVEST_PID=$!
    echo -e "${GREEN}✅ Investment Scout service started (port 3003)${NC}"
else
    echo -e "${YELLOW}⚠️  Investment Scout venv not found (optional). To setup:${NC}"
    echo -e "   cd $INVESTMENT_SCOUT_DIR && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
fi

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services...${NC}"
for i in {1..30}; do
    VITE_READY=false
    SCREEN_READY=false
    
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        VITE_READY=true
    fi
    
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        SCREEN_READY=true
    fi
    
    if $VITE_READY && $SCREEN_READY; then
        echo -e "${GREEN}✅ All services ready${NC}"
        break
    fi
    
    sleep 0.5
done

# Start Swift overlay
echo -e "${BLUE}🎯 Starting Swift overlay...${NC}"
cd "$SWIFT_DIR"
.build/debug/SidebarOverlay

# Script will cleanup when Swift app exits
