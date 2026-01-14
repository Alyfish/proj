#!/bin/bash
# Investment Scout - Start Script

cd "$(dirname "$0")"

# Check for Python venv
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Load environment variables
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

echo "🔍 Investment Scout starting on port ${INVESTMENT_SCOUT_PORT:-3003}"
python server.py
