# Screen Context Service for Sidebar-OS

A Python-based service that captures screen context (screenshots, selected text, browser URLs) and integrates with the AI assistant.

## Setup

```bash
cd screen-context
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running

```bash
python server.py
```

The server runs on `http://localhost:3002` by default.

## API Endpoints

- `GET /health` - Health check
- `POST /capture` - Capture full screen context
- `POST /analyze` - Capture context and analyze with AI
- `GET /permissions` - Check system permissions

## Environment Variables

Copy from parent `.env` or set:
- `OPENAI_API_KEY` - Your OpenAI API key (uses GPT-4 Vision)

## macOS Permissions Required

- **Screen Recording**: System Preferences → Security & Privacy → Screen Recording
- **Accessibility**: System Preferences → Security & Privacy → Accessibility
