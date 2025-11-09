# Toggle Feature - Current Behavior Documentation

> **Last Updated:** 2025-10-27
> **Purpose:** Complete reference of the current toggle feature implementation - DO NOT MODIFY

---

## Table of Contents
1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [State Management](#state-management)
4. [Toggle Triggers](#toggle-triggers)
5. [Window Size Management](#window-size-management)
6. [Event Handlers](#event-handlers)
7. [UI Implementation](#ui-implementation)
8. [Rust Backend Integration](#rust-backend-integration)
9. [Logging & Debugging](#logging--debugging)
10. [Dependencies](#dependencies)
11. [Complete Toggle Flow](#complete-toggle-flow)

---

## Overview

The toggle feature controls the window size and appearance of the Tauri desktop application. It cycles through **three distinct window modes**:

- **`collapsed`** - Minimal 180x50px pill-shaped button
- **`hovered`** - Medium 420x110px preview bar (triggered by mouse hover)
- **`expanded`** - Full 800x600px chat interface

---

## File Structure

### Frontend (React/TypeScript)
- **[src/App.tsx](src/App.tsx)** - Main component with toggle logic (lines 178-269 for event handlers)
- **[src/App.css](src/App.css)** - Toggle animations and transitions
- **[src/index.css](src/index.css)** - Global styles
- **[src/types.ts](src/types.ts)** - Type definitions

### Backend (Rust/Tauri)
- **[src-tauri/src/lib.rs](src-tauri/src/lib.rs)** - Global hotkey handlers (lines 199-253) and window management

---

## State Management

### Type Definition
```typescript
type WindowMode = 'collapsed' | 'hovered' | 'expanded'
```

### State Variables (App.tsx)
```typescript
const [windowMode, setWindowMode] = useState<WindowMode>('expanded')
const windowModeRef = useRef<WindowMode>(windowMode)
```

**Why both state and ref?**
- `windowMode` - React state for triggering re-renders
- `windowModeRef` - Ref to avoid stale closures in event listeners
- The ref is kept in sync via `useEffect` hook

### Deduplication Logic
```typescript
const lastToggleAtRef = useRef<number>(0)

const shouldHandleToggle = () => {
  const now = Date.now()
  if (now - lastToggleAtRef.current < 150) {
    logInfo('⏭️ Skipping duplicate toggle within 150ms')
    return false
  }
  lastToggleAtRef.current = now
  return true
}
```

**Purpose:** Prevents duplicate toggle events from firing within 150ms to handle platform quirks and rapid key presses.

---

## Toggle Triggers

The toggle can be triggered in **4 different ways**:

### 1. Keyboard Shortcut (Cmd+1)
**Flow:**
1. Rust backend detects global `Cmd+1` keypress
2. Emits `toggle-collapse` event to React frontend
3. Frontend handler toggles between `collapsed` ↔ `expanded`
4. Skips `hovered` mode entirely

**Implementation:** [App.tsx:178-238](src/App.tsx#L178-L238)

### 2. Manual Button Clicks (Debug Panel)
Three buttons in the top-right debug panel:

```typescript
// Collapse Button
onClick={() => setWindowMode('collapsed')}

// Expand Button
onClick={() => setWindowMode('expanded')}

// Toggle Button
onClick={() => setWindowMode(prev => prev === 'collapsed' ? 'expanded' : 'collapsed')}
```

**Location:** [App.tsx:473-491](src/App.tsx#L473-L491)

### 3. UI Element Clicks
**Collapsed Pill Click:**
```typescript
onClick={() => setWindowMode('expanded')}
```

**Hovered Preview Click:**
```typescript
onClick={() => setWindowMode('expanded')}
```

**Mouse Leave on Hovered:**
```typescript
onMouseLeave={() => setWindowMode('collapsed')}
```

### 4. External Triggers
Global hotkeys that expand the panel:
- **Alt+Cmd+Space** - Emits `panel-should-expand`
- **Ctrl+Space** - Emits `panel-should-expand`
- **Cmd+Shift+Space** - Emits `panel-should-expand`
- **Tray Icon Click** - Expands panel
- **Single Instance Click** - Expands panel

**Handler:** [App.tsx:266-269](src/App.tsx#L266-L269)

---

## Window Size Management

Each mode has specific window dimensions and positioning:

### Collapsed Mode (180x50)
```typescript
await win.setResizable(false)
await win.setSize(new LogicalSize(180, 50))
await invoke('center_window')  // Centers on screen
await win.setAlwaysOnTop(true)
```

**UI:** Compact pill with gradient icon

### Hovered Mode (420x110)
```typescript
await win.setResizable(false)
await win.setSize(new LogicalSize(420, 110))
await invoke('position_window_top_center')  // Top-center of screen
await win.setAlwaysOnTop(true)
```

**UI:** Preview bar with "Demo AI - Click to Open" text

### Expanded Mode (800x600)
```typescript
await win.setResizable(true)
await win.setMinSize(new LogicalSize(640, 360))
await win.setSize(new LogicalSize(800, 600))
await win.setAlwaysOnTop(true)
```

**UI:** Full chat interface with input, messages, and controls

**Implementation:** [App.tsx:139-175](src/App.tsx#L139-L175) in `useEffect`

---

## Event Handlers

### Cmd+1 Toggle Handler
**Location:** [App.tsx:178-238](src/App.tsx#L178-L238)

```typescript
listen('toggle-collapse', (event) => {
  logInfo('🎯 toggle-collapse event received:', event.payload)

  if (!shouldHandleToggle()) return

  const currentMode = windowModeRef.current
  const newMode = currentMode === 'collapsed' ? 'expanded' : 'collapsed'

  logInfo(`🔄 Toggling: ${currentMode} → ${newMode}`)
  setWindowMode(newMode)

  // Refocus window after collapse
  if (newMode === 'collapsed') {
    setTimeout(async () => {
      await win.show()
      await win.setFocus()
      await win.setAlwaysOnTop(true)
    }, 100)
  }
})
```

**Key Features:**
- Deduplication via `shouldHandleToggle()`
- Only toggles between `collapsed` and `expanded`
- Refocuses window when collapsing
- Comprehensive logging

### Panel Expansion Handler
**Location:** [App.tsx:266-269](src/App.tsx#L266-L269)

```typescript
listen('panel-should-expand', () => {
  logInfo('🎯 panel-should-expand event received')
  setWindowMode(prev => (prev === 'expanded' ? prev : 'expanded'))
})
```

**Behavior:** Always expands unless already expanded (idempotent)

---

## UI Implementation

### Collapsed Mode UI
**Location:** [App.tsx:315-335](src/App.tsx#L315-L335)

```tsx
<div className="collapsed-pill-enter ... cursor-pointer rounded-full ...">
  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 ...">
    <span className="text-lg">💬</span>
  </div>
</div>
```

**Styling:**
- Pill-shaped with rounded corners
- Gradient icon (blue to purple)
- Chat bubble emoji (💬)
- Click to expand
- Animation: `collapsed-pill-enter`

### Hovered Mode UI
**Location:** [App.tsx:337-361](src/App.tsx#L337-L361)

```tsx
<div className="... bg-gradient-to-r from-gray-900 to-gray-800
                border-2 border-[#19c37d] rounded-2xl ...">
  <div className="flex items-center gap-3 px-4 py-3">
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
      <span className="text-2xl">💬</span>
    </div>
    <span className="text-white/90 text-base font-medium">
      Demo AI - Click to Open
    </span>
  </div>
</div>
```

**Styling:**
- Dark gradient background
- Green border (`#19c37d`)
- Larger icon and descriptive text
- Click to expand
- Mouse leave to collapse

### Expanded Mode UI
**Location:** [App.tsx:363-517](src/App.tsx#L363-L517)

**Components:**
1. **Drag Handle Bar** (top)
   - `data-tauri-drag-region` for window dragging
   - Purple gradient background
   - "Demo AI" title

2. **Messages Area** (middle, scrollable)
   - User messages: Right-aligned, blue gradient
   - Assistant messages: Left-aligned, purple/pink gradient
   - Markdown rendering support

3. **Input Area** (bottom)
   - Pill-shaped design with rounded borders
   - Green accent (`#19c37d`)
   - Send button with arrow icon

4. **Debug Buttons** (top-right)
   - Collapse, Expand, Toggle buttons
   - Positioned absolutely

### CSS Animations
**Location:** [src/App.css](src/App.css)

```css
@keyframes pillEnter {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.collapsed-pill-enter {
  animation: pillEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**Effect:** Smooth scale and fade-in with bounce easing

---

## Rust Backend Integration

### Global Shortcut Handler (Cmd+1)
**Location:** [src-tauri/src/lib.rs:217-245](src-tauri/src/lib.rs#L217-L245)

```rust
let _ = app_handle
  .global_shortcut()
  .on_shortcut("Cmd+1", move |_id, _shortcut, _event| {
    log::info!("Cmd+1 key pressed via global shortcut");

    if let Some(w) = app_handle3.get_webview_window("panel") {
      // Try emit_to() first
      match app_handle3.emit_to("panel", "toggle-collapse", ()) {
        Ok(_) => log::info!("✅ Event emitted successfully via emit_to()"),
        Err(e) => {
          log::error!("❌ Failed to emit via emit_to(): {}", e);

          // Fallback to window.emit()
          match w.emit("toggle-collapse", ()) {
            Ok(_) => log::info!("✅ Event emitted via window.emit() fallback"),
            Err(e2) => log::error!("❌ Failed to emit via window.emit(): {}", e2),
          }
        }
      }
    }
  });
```

**Features:**
- Dual emit strategy (primary + fallback)
- Comprehensive logging
- Error handling

### Panel Expansion Hotkeys
**Location:** [src-tauri/src/lib.rs:199-211](src-tauri/src/lib.rs#L199-L211)

```rust
for shortcut in ["Alt+Cmd+Space", "Ctrl+Space", "Cmd+Shift+Space"] {
  let _ = app_handle
    .global_shortcut()
    .on_shortcut(shortcut, move |_id, _shortcut, _event| {
      log::info!("{} pressed", shortcut);
      let _ = app_handle2.emit_to("panel", "panel-should-expand", ());
    });
}
```

### ESC Key Blocker
**Location:** [src-tauri/src/lib.rs:248-253](src-tauri/src/lib.rs#L248-L253)

```rust
let _ = app_handle
  .global_shortcut()
  .on_shortcut("Escape", move |_id, _shortcut, _event| {
    log::info!("ESC blocked");
  });
```

**Purpose:** Prevents ESC from closing the window

---

## Logging & Debugging

### Frontend Logging Functions
**Location:** [App.tsx:22-35](src/App.tsx#L22-L35)

```typescript
const logInfo = (message: string, ...args: any[]) => {
  console.log(`[Panel Info] ${message}`, ...args)
  invoke('log_from_frontend', {
    level: 'info',
    message: `${message} ${JSON.stringify(args)}`
  }).catch(err => console.error('Failed to log to Rust:', err))
}

const logError = (message: string, ...args: any[]) => {
  console.error(`[Panel Error] ${message}`, ...args)
  invoke('log_from_frontend', {
    level: 'error',
    message: `${message} ${JSON.stringify(args)}`
  }).catch(err => console.error('Failed to log error to Rust:', err))
}
```

**Features:**
- Dual output: Browser console + Rust backend
- Level-based logging (info, error)
- Automatic JSON serialization
- Error handling for log failures

### Debug Information Logged
- Toggle event received (with payload)
- State transitions (`collapsed → expanded`)
- Duplicate toggle prevention
- Window size changes
- Event emission success/failure
- Window focus operations

---

## Dependencies

### Frontend
```json
{
  "@tauri-apps/api": "^2.8.0",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "zustand": "^5.0.8",
  "tailwindcss": "^3.4.18"
}
```

### Backend
```toml
[dependencies]
tauri = "2.8.0"
log = "0.4"
env_logger = "0.11"
```

---

## Complete Toggle Flow

### Cmd+1 Toggle Flow
```
┌─────────────────────────────────────────┐
│ User presses Cmd+1                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Rust backend detects global hotkey     │
│ (lib.rs:217-245)                        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Emits 'toggle-collapse' event           │
│ (dual strategy: emit_to + fallback)    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ React frontend receives event           │
│ (App.tsx:178-238)                       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ shouldHandleToggle() deduplicates       │
│ (150ms window)                          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Toggles: collapsed ↔ expanded           │
│ (skips hovered mode)                    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ setWindowMode() updates state           │
│ windowModeRef.current syncs             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ useEffect watches windowMode change     │
│ (App.tsx:139-175)                       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Calls Tauri API to resize window:      │
│ • setResizable()                        │
│ • setSize()                             │
│ • invoke('center_window')              │
│ • setAlwaysOnTop()                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ If collapsed: refocus window           │
│ (100ms delay)                           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ React re-renders with new mode UI      │
│ • collapsed: 180x50 pill                │
│ • expanded: 800x600 chat                │
└─────────────────────────────────────────┘
```

### External Expansion Flow
```
┌─────────────────────────────────────────┐
│ User triggers expansion:                │
│ • Alt+Cmd+Space / Ctrl+Space           │
│ • Tray icon click                       │
│ • UI element click                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Emits 'panel-should-expand' event       │
│ OR directly calls setWindowMode()       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Sets mode to 'expanded'                 │
│ (idempotent if already expanded)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Same resize & re-render flow as above   │
└─────────────────────────────────────────┘
```

---

## Key Behavioral Notes

1. **Cmd+1 Only Toggles Two States**
   - Collapsed ↔ Expanded
   - Never transitions to/from Hovered

2. **Hovered Mode Trigger**
   - Currently only accessible via direct state setting
   - No global hotkey or automatic trigger implemented

3. **Window Always On Top**
   - All three modes set `alwaysOnTop: true`
   - Ensures panel stays visible

4. **Refocus After Collapse**
   - 100ms delay ensures window remains accessible
   - Prevents window from losing focus

5. **Deduplication Window**
   - 150ms threshold prevents rapid toggles
   - Handles platform quirks and accidental double-presses

6. **Resize Restrictions**
   - Collapsed & Hovered: Non-resizable
   - Expanded: Resizable with 640x360 minimum

---

## Related Commands

### Tauri Invoke Commands
- `center_window` - Centers window on screen
- `position_window_top_center` - Positions at top-center
- `log_from_frontend` - Sends frontend logs to Rust

### Window API Methods
- `win.setSize()`
- `win.setResizable()`
- `win.setMinSize()`
- `win.setAlwaysOnTop()`
- `win.show()`
- `win.setFocus()`

---

**End of Documentation**
