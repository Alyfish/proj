# proj

A desktop+web demo app (Tauri + React + Vite + Tailwind) that provides a floating AI assistant with a project‑centric dashboard — now with an email-assistant backend (Node/TS) for inbox retrieval, analysis, and suggestions.

- Floating collapsed pill you can drag anywhere; position persists
- Hover actions on the pill: Record / Stop with a small status popup
- Chat experience with an action notification demo
- Project‑centric Dashboard with per‑project Context/Subagents and team‑shared items
- Window modes: collapsed, expanded, sidepanel, with custom position saving
- Email assistant: retrieval/prioritization/analysis/suggestions with travel-aware extraction and relevance ranking

## Quick Start

- macOS (recommended for desktop): install Xcode Command Line Tools and Rust toolchain
- Node.js 18+ recommended

### Web (fast dev loop)

```
cd sidebar-os
npm install
npm run dev
# open http://localhost:5173
```

### Desktop (Tauri)

```
cd sidebar-os
npm install
npm run tauri:dev
```

Build a desktop app bundle:

```
cd sidebar-os
npm run tauri:build
```

### Email Assistant API (backend)

```
cd email-assistant/orchestrator
npm install   # first time
npm run start:server
# API at http://localhost:3001
```

Env: add `OPENAI_API_KEY` to `email-assistant/.env`. Do NOT commit Gmail `credentials.json`/`token.json`; set via `GMAIL_CREDENTIALS_PATH`/`GMAIL_TOKEN_PATH` or env strings.

## Key Features

- Collapsed Pill
  - Draggable anywhere. Position saved and restored across sessions
  - Hover shows Record/Stop. Clicking Record shows a popup: “Recording your workflow…”
  - Click the pill to expand to full chat

- Demo Action Notification
  - In the chat input, type: `prompt me`
  - A top‑center notification appears with an Expand button and image
  - Actions: Accept (run once), Auto (enable auto mode), Cancel

- Simple Voice Agent (chained)
  - Click the mic button in the input bar to record
  - Pipeline: gpt-4o-transcribe → gpt-4.1 → gpt-4o-mini-tts
  - Plays the synthesized response and drops transcript/response into chat

- Dashboard
  - Project‑first layout: sidebar of Projects, details panel per project
  - Your Context and Your Subagents: edit/delete items per project
  - Your Team: shared Context and Subagents with Add actions
  - Sticky controls: Back to Projects and Back to Chat

- Window Modes and Shortcuts
  - Modes: collapsed, expanded, sidepanel
  - Cmd+1 toggles collapsed/expanded in the desktop build (wired via Tauri)
  - Positions for collapsed/expanded/sidepanel persist; reset helpers included in UI
- Email Assistant pipeline
  - Gmail retrieval with intent-aware query refinement and 30d recency default
  - Prioritization with query-aware boosts and thread dedupe
  - Analysis with full-body decoding, embeddings, and domain signals (travel parsing: PNR/legs)
  - Suggestions: domain-aware “trip summary” plus concise next steps
  - UI: relevance-ranked email list, travel icon on trip emails, longer timeout + retry on first-run fetch

## File Map

- `sidebar-os/src/App.tsx` — main UI (chat, collapsed pill, dashboard, notification demo)
- `sidebar-os/src/codex.ts` — mock Codex service for demo
- `sidebar-os/src-tauri` — Tauri config and Rust entrypoints
- `email-assistant/` — backend monorepo (agents, orchestrator, common)

## Customization Tips

- Notification demo image: update `imageSrc` in `sidebar-os/src/App.tsx` (search for `prompt me` trigger)
- Colors/spacing: Tailwind utilities in JSX + `sidebar-os/src/index.css`
- Keyboard behavior and position saving use Tauri APIs (only active in desktop build)

### Environment (OpenAI)

Create `sidebar-os/.env.local` and add your API key:

```
VITE_OPENAI_API_KEY=sk-xxxxx
```

The voice agent uses browser `fetch` to call OpenAI for transcription, chat completion, and TTS. For production, consider proxying calls via a server or the Tauri backend to avoid exposing your key to the renderer.

## License

Proprietary. © Alyfish
