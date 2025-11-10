# proj

A desktop+web demo app (Tauri + React + Vite + Tailwind) that provides a floating AI assistant with a project‑centric dashboard.

- Floating collapsed pill you can drag anywhere; position persists
- Hover actions on the pill: Record / Stop with a small status popup
- Chat experience with an action notification demo
- Project‑centric Dashboard with per‑project Context/Subagents and team‑shared items
- Window modes: collapsed, expanded, sidepanel, with custom position saving

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

## Key Features

- Collapsed Pill
  - Draggable anywhere. Position saved and restored across sessions
  - Hover shows Record/Stop. Clicking Record shows a popup: “Recording your workflow…”
  - Click the pill to expand to full chat

- Demo Action Notification
  - In the chat input, type: `prompt me`
  - A top‑center notification appears with an Expand button and image
  - Actions: Accept (run once), Auto (enable auto mode), Cancel

- Dashboard
  - Project‑first layout: sidebar of Projects, details panel per project
  - Your Context and Your Subagents: edit/delete items per project
  - Your Team: shared Context and Subagents with Add actions
  - Sticky controls: Back to Projects and Back to Chat

- Window Modes and Shortcuts
  - Modes: collapsed, expanded, sidepanel
  - Cmd+1 toggles collapsed/expanded in the desktop build (wired via Tauri)
  - Positions for collapsed/expanded/sidepanel persist; reset helpers included in UI

## File Map

- `sidebar-os/src/App.tsx` — main UI (chat, collapsed pill, dashboard, notification demo)
- `sidebar-os/src/codex.ts` — mock Codex service for demo
- `sidebar-os/src-tauri` — Tauri config and Rust entrypoints

## Customization Tips

- Notification demo image: update `imageSrc` in `sidebar-os/src/App.tsx` (search for `prompt me` trigger)
- Colors/spacing: Tailwind utilities in JSX + `sidebar-os/src/index.css`
- Keyboard behavior and position saving use Tauri APIs (only active in desktop build)

## License

Proprietary. © Alyfish
