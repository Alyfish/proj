import './App.css'
import { useState, useEffect, useRef } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { codex } from './codex'

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'trace'

// Detect whether we're running inside Tauri (desktop) vs pure web (vite dev)
const isTauriEnv = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__

const serializeLogArg = (value: unknown) => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const emitLog = (level: LogLevel, args: unknown[]) => {
  const message = args.map(serializeLogArg).join(' ')
  if (!message) return
  if (!isTauriEnv) return
  void invoke('debug_log', { level, message }).catch(() => {
    /* ignore logging bridge errors */
  })
}

const logInfo = (...args: unknown[]) => {
  // Always log to browser console first (fallback that always works)
  console.log(...args)
  // Also try to send to Rust backend for terminal logs
  emitLog('info', args)
}

const logError = (...args: unknown[]) => {
  // Always log to browser console first (fallback that always works)
  console.error(...args)
  // Also try to send to Rust backend for terminal logs
  emitLog('error', args)
}

type WindowMode = 'collapsed' | 'hovered' | 'expanded' | 'sidepanel'

export default function App() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{role: 'user'|'assistant', content: string}>>([])
  const [windowMode, setWindowMode] = useState<WindowMode>('expanded')
  const [sidePanelSide, setSidePanelSide] = useState<'right' | 'left'>('right')

  // Projects menu state
  type Project = { name: string; createdAt: string; updatedAt: string }
  const [projects, setProjects] = useState<Project[]>(() => {
    const now = Date.now()
    const mk = (name: string, offsetMinutes: number): Project => {
      const d = new Date(now - offsetMinutes * 60_000).toISOString()
      return { name, createdAt: d, updatedAt: d }
    }
    return [
      mk('Personal Website', 60 * 24 * 2),
      mk('Marketing Campaign', 60 * 24 * 5),
      mk('Prototype v2', 60 * 6),
      mk('Growth Experiments', 30),
    ]
  })
  const [selectedProject, setSelectedProject] = useState<string>('Personal Website')
  const [showProjectsMenu, setShowProjectsMenu] = useState<boolean>(false)
  const projectsMenuRef = useRef<HTMLDivElement | null>(null)

  // Dashboard state
  const [showDashboard, setShowDashboard] = useState(false)
  const dashboardRef = useRef<HTMLDivElement | null>(null)
  const [dashboardSelectedProject, setDashboardSelectedProject] = useState<string | null>(null)

  // Collapsed pill interactions
  const [collapsedHover, setCollapsedHover] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showRecordingPopup, setShowRecordingPopup] = useState(false)
  const recordPopupTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Dashboard data types and helpers
  type TeamItem = { name: string; owner: string }
  const currentUser = 'You'
  // Default sample items (used as seeds for new projects)
  const defaultSubagents: TeamItem[] = [
    { name: 'Researcher', owner: 'Alex' },
    { name: 'Summarizer', owner: 'Sam' },
  ]
  const defaultContexts: TeamItem[] = [
    { name: 'Sales Briefing Context', owner: 'Alex' },
    { name: 'Design Tokens', owner: 'Taylor' },
  ]
  // Per-project entries
  const [projectEntries, setProjectEntries] = useState<Record<string, { subagents: TeamItem[]; contexts: TeamItem[] }>>({})
  // Team-shared items (global across projects)
  const [teamSharedSubagents, setTeamSharedSubagents] = useState<TeamItem[]>([
    { name: 'QA Triage', owner: 'Jordan' },
    { name: 'Content Polisher', owner: 'Sam' },
  ])
  const [teamSharedContexts, setTeamSharedContexts] = useState<TeamItem[]>([
    { name: 'Sales Briefing', owner: 'Alex' },
    { name: 'Design Tokens', owner: 'Taylor' },
  ])

  // Avatar initial + gradient color helper
  const avatarInitial = (name: string) => (name?.[0] || '?').toUpperCase()
  const avatarGradient = (seed: string) => {
    const i = (seed.charCodeAt(0) + seed.length) % 4
    return [
      'from-[#5436da] to-[#19c37d]',
      'from-[#0ea5e9] to-[#22c55e]',
      'from-[#ef4444] to-[#f59e0b]',
      'from-[#a855f7] to-[#06b6d4]'
    ][i]
  }

  // Position tracking for custom repositioning
  const [useCustomPosition, setUseCustomPosition] = useState(false)
  const [hasCustomPosition, setHasCustomPosition] = useState(false)

  // Codex state
  const [codexReady, setCodexReady] = useState(false)

  // Use ref to track current windowMode without causing re-renders
  const windowModeRef = useRef<WindowMode>(windowMode)

  // Keep ref in sync with state
  useEffect(() => {
    windowModeRef.current = windowMode
  }, [windowMode])

  // Dedupe rapid successive toggle events (from multiple listeners/platform quirks)
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

  // Log app initialization
  useEffect(() => {
    console.log('═══════════════════════════════════════════════')
    console.log('🚀 REACT APP INITIALIZED!')
    console.log('🚀 Timestamp:', new Date().toISOString())
    console.log('🚀 Initial windowMode:', windowMode)
    console.log('═══════════════════════════════════════════════')
    logInfo('🚀 App component mounted and initialized')
    logInfo('🚀 Initial windowMode:', windowMode)
  }, [])

  // Initialize Codex on app start
  useEffect(() => {
    const initCodex = async () => {
      try {
        logInfo('🚀 Initializing Codex service...')
        await codex.init()
        setCodexReady(codex.isReady())
        logInfo('✅ Codex initialized successfully')
      } catch (error) {
        logError('❌ Failed to initialize Codex:', error)
        setCodexReady(false)
      }
    }
    initCodex()
  }, [])

  // Programmatic drag helper (reliable across platforms)
  const startWindowDrag = async () => {
    if (!isTauriEnv) return
    try {
      const win = getCurrentWebviewWindow()
      await win.startDragging()
    } catch (e) {
      logError('startDragging failed', e)
    }
  }

  // Helper function to get position storage key based on current mode
  const getPositionKey = () => {
    if (windowMode === 'collapsed') return 'collapsed'
    if (windowMode === 'expanded') return 'expanded'
    if (windowMode === 'sidepanel') return sidePanelSide === 'right' ? 'sidepanel_right' : 'sidepanel_left'
    return null
  }

  // Check if custom position exists for current mode
  useEffect(() => {
    if (!isTauriEnv) return
    const checkCustomPosition = async () => {
      const key = getPositionKey()
      if (!key) {
        setHasCustomPosition(false)
        return
      }
      try {
        const exists = await invoke<boolean>('has_custom_position', { mode: key })
        setHasCustomPosition(exists)
        logInfo(`Custom position exists for ${key}: ${exists}`)
      } catch (e) {
        logError('Error checking custom position:', e)
      }
    }
    checkCustomPosition()
  }, [windowMode, sidePanelSide])

  // Debug logging for state changes
  useEffect(() => {
    logInfo('🔍 WINDOW MODE CHANGED TO:', windowMode)
    logInfo('🔍 Current windowMode state:', windowMode)
    logInfo('🔍 Use custom position:', useCustomPosition)
  }, [windowMode, useCustomPosition])

  // Close projects menu on outside click / escape
  useEffect(() => {
    if (!showProjectsMenu) return
    const onDown = (e: MouseEvent) => {
      if (!projectsMenuRef.current) return
      if (!projectsMenuRef.current.contains(e.target as Node)) {
        setShowProjectsMenu(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProjectsMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [showProjectsMenu])

  // Close dashboard with Esc
  useEffect(() => {
    if (!showDashboard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDashboard(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDashboard])

  // Cleanup record popup timer
  useEffect(() => {
    return () => {
      if (recordPopupTimerRef.current) clearTimeout(recordPopupTimerRef.current)
    }
  }, [])

  // Reset dashboard selection when opening
  useEffect(() => {
    if (showDashboard) setDashboardSelectedProject(null)
  }, [showDashboard])

  // Handle window mode changes (desktop only)
  useEffect(() => {
    if (!isTauriEnv) {
      // In web mode, skip Tauri window manipulation to avoid errors
      return
    }
    const updateWindowSize = async () => {
      logInfo('Window mode changed to:', windowMode)
      const win = getCurrentWebviewWindow()

      try {
        if (windowMode === 'collapsed') {
          logInfo('============ STARTING COLLAPSED MODE ============')
          logInfo('Setting collapsed size: 220x160 (pill + overlays)')
          await win.setResizable(false)
          await win.setSize(new LogicalSize(220, 160))

          // Verify the size was actually set
          const actualSize = await win.outerSize()
          logInfo('ACTUAL SIZE AFTER SET:', actualSize)

          // Try to load custom position if allowed; otherwise center
          const posKey = getPositionKey()
          if (posKey) {
            try {
              const customPos = await invoke<[number, number] | null>('get_custom_position', { mode: posKey })
              if (customPos) {
                logInfo('Using custom position for collapsed:', customPos)
                await win.setPosition(new PhysicalPosition(customPos[0], customPos[1]))
              } else {
                logInfo('No custom position found, centering window')
                await invoke('center_window')
              }
            } catch (e) {
              logError('Error loading custom position for collapsed, falling back to center:', e)
              await invoke('center_window')
            }
          } else {
            logInfo('Using default position for collapsed: centering window')
            await invoke('center_window')
          }

          // Verify position
          const position = await win.outerPosition()
          logInfo('ACTUAL POSITION:', position)

          // Ensure window is visible
          logInfo('Calling show()')
          await win.show()

          // Verify visibility
          const isVisible = await win.isVisible()
          logInfo('IS WINDOW VISIBLE?', isVisible)

          logInfo('Setting always on top')
          await win.setAlwaysOnTop(true)
          logInfo('Setting focus')
          await win.setFocus()
          logInfo('============ COLLAPSED MODE COMPLETE ============')
        } else if (windowMode === 'hovered') {
          logInfo('Setting hovered size: 420x110')
          await win.setResizable(false)
          await win.setSize(new LogicalSize(420, 110))
          logInfo('Positioning window to top-center')
          await invoke('position_window_top_center')
          await win.show()
          await win.setAlwaysOnTop(true)
          logInfo('Hovered mode applied successfully')
        } else if (windowMode === 'expanded') {
          logInfo('Setting expanded size: 800x600')
          await win.setResizable(true)
          try {
            await win.setMinSize(new LogicalSize(640, 360))
          } catch (e) {
            logError('setMinSize failed (permission?)', e)
          }
          await win.setSize(new LogicalSize(800, 600))

          // Try to load custom position if useCustomPosition is true
          const posKey = getPositionKey()
          if (useCustomPosition && posKey) {
            try {
              const customPos = await invoke<[number, number] | null>('get_custom_position', { mode: posKey })
              if (customPos) {
                logInfo('Using custom position for expanded:', customPos)
                await win.setPosition(new PhysicalPosition(customPos[0], customPos[1]))
              } else {
                logInfo('No custom position found, centering window')
                await invoke('center_window')
              }
            } catch (e) {
              logError('Error loading custom position, falling back to center:', e)
              await invoke('center_window')
            }
          } else {
            logInfo('Using default position: centering window')
            await invoke('center_window')
          }

          await win.show()
          await win.setAlwaysOnTop(true)
          logInfo('Expanded mode applied successfully')
        } else if (windowMode === 'sidepanel') {
          logInfo('Setting sidepanel size: 420x800 and docking right-center')
          await win.setResizable(true)
          try {
            await win.setMinSize(new LogicalSize(360, 480))
          } catch (e) {
            logError('setMinSize failed for sidepanel (permission?)', e)
          }
          await win.setSize(new LogicalSize(420, 800))

          // Try to load custom position if useCustomPosition is true
          const posKey = getPositionKey()
          if (useCustomPosition && posKey) {
            try {
              const customPos = await invoke<[number, number] | null>('get_custom_position', { mode: posKey })
              if (customPos) {
                logInfo('Using custom position for sidepanel:', customPos)
                await win.setPosition(new PhysicalPosition(customPos[0], customPos[1]))
              } else {
                // Fall back to default positioning
                logInfo('No custom position found, using default sidepanel position')
                if (sidePanelSide === 'right') {
                  await invoke('position_window_right_center', { margin: 40 })
                } else {
                  await invoke('position_window_left_center', { margin: 40 })
                }
              }
            } catch (e) {
              logError('Error loading custom position, falling back to default:', e)
              if (sidePanelSide === 'right') {
                await invoke('position_window_right_center', { margin: 40 })
              } else {
                await invoke('position_window_left_center', { margin: 40 })
              }
            }
          } else {
            // Use default positioning
            logInfo('Using default sidepanel position')
            if (sidePanelSide === 'right') {
              await invoke('position_window_right_center', { margin: 40 })
            } else {
              await invoke('position_window_left_center', { margin: 40 })
            }
          }

          await win.show()
          await win.setAlwaysOnTop(true)
          logInfo('Sidepanel mode applied successfully')
        }
      } catch (error) {
        logError('!!!!! ERROR updating window:', error)
        alert('ERROR: ' + error)
      }
    }

    updateWindowSize()
  }, [windowMode])

  // Collapse on Cmd+1 via Tauri event - desktop only
  useEffect(() => {
    if (!isTauriEnv) {
      logInfo('💡 Web env detected: skipping Tauri keyboard listeners')
      return
    }
    logInfo('🔧 [SETUP] Starting toggle-collapse listener setup...')
    logInfo('🔧 [SETUP] Timestamp:', new Date().toISOString())
    let unlistenGlobal: UnlistenFn | null = null
    let unlistenWindow: UnlistenFn | null = null

    const setup = async () => {
      try {
        const win = getCurrentWebviewWindow()
        logInfo('🔧 [SETUP] Got webview window, wiring listeners (global + window)...')

        // Global listener (receives events emitted via app.emit/app.emit_to)
        unlistenGlobal = await listen('toggle-collapse', (event) => {
          const timestamp = new Date().toISOString()
          logInfo('═══════════════════════════════════════════════')
          logInfo('🚨 [EVENT][GLOBAL] Cmd+1 EVENT RECEIVED!')
          logInfo('🚨 [EVENT] Timestamp:', timestamp)
          logInfo('🚨 [EVENT] Event payload:', event)
          logInfo('🚨 [EVENT] Current windowMode (from ref):', windowModeRef.current)
          if (!shouldHandleToggle()) return
          const currentMode = windowModeRef.current
          const newMode: WindowMode = currentMode === 'sidepanel'
            ? 'collapsed'
            : currentMode === 'collapsed'
              ? 'expanded'
              : 'collapsed'

          logInfo('🚨 [EVENT] Toggling from', currentMode, 'to', newMode)
          setUseCustomPosition(false) // Hotkeys always use default positions
          setWindowMode(newMode)

          // Ensure window stays focused and visible after Cmd+1
          if (newMode === 'collapsed') {
            logInfo('🚨 [EVENT] Scheduling refocus for collapsed mode')
            setTimeout(async () => {
              try {
                await win.show()
                await win.setFocus()
                await win.setAlwaysOnTop(true)
                logInfo('✅ [EVENT] Window refocused after Cmd+1 collapse')
              } catch (error) {
                logError('❌ [EVENT] Error refocusing window:', error)
              }
            }, 100)
          }
          logInfo('═══════════════════════════════════════════════')
        })

        // Window-specific listener as a safety net
        unlistenWindow = await win.listen('toggle-collapse', (event) => {
          const timestamp = new Date().toISOString()
          logInfo('═══════════════════════════════════════════════')
          logInfo('🚨 [EVENT][WINDOW] Cmd+1 EVENT RECEIVED!')
          logInfo('🚨 [EVENT] Timestamp:', timestamp)
          logInfo('🚨 [EVENT] Event payload:', event)
          logInfo('🚨 [EVENT] Current windowMode (from ref):', windowModeRef.current)
          if (!shouldHandleToggle()) return
          const currentMode = windowModeRef.current
          const newMode: WindowMode = currentMode === 'sidepanel'
            ? 'collapsed'
            : currentMode === 'collapsed'
              ? 'expanded'
              : 'collapsed'

          logInfo('🚨 [EVENT] Toggling from', currentMode, 'to', newMode)
          setUseCustomPosition(false) // Hotkeys always use default positions
          setWindowMode(newMode)

          if (newMode === 'collapsed') {
            logInfo('🚨 [EVENT] Scheduling refocus for collapsed mode')
            setTimeout(async () => {
              try {
                await win.show()
                await win.setFocus()
                await win.setAlwaysOnTop(true)
                logInfo('✅ [EVENT] Window refocused after Cmd+1 collapse')
              } catch (error) {
                logError('❌ [EVENT] Error refocusing window:', error)
              }
            }, 100)
          }
          logInfo('═══════════════════════════════════════════════')
        })

        logInfo('✅ [SETUP] toggle-collapse listeners registered (global + window)')
        logInfo('✅ [SETUP] Listeners are active and waiting for events')
      } catch (error) {
        logError('❌ [SETUP] Error wiring Cmd+1 listener:', error)
        logError('❌ [SETUP] Error details:', error)
      }
    }

    setup()

    // Cleanup only on component unmount
    return () => {
      logInfo('🧹 [CLEANUP] Cleaning up toggle-collapse listeners')
      try { unlistenGlobal && unlistenGlobal() } catch (e) { logError('cleanup global listener', e) }
      try { unlistenWindow && unlistenWindow() } catch (e) { logError('cleanup window listener', e) }
    }
  }, []) // Empty dependency array - register once and only cleanup on unmount

  // Re-expand when backend asks for it (tray icon, hotkeys, etc) - desktop only
  useEffect(() => {
    if (!isTauriEnv) return
    const unlisteners: UnlistenFn[] = []
    let disposed = false

    const setup = async () => {
      try {
        const unlistenEvent = await listen('panel-should-expand', () => {
          logInfo('Received panel-should-expand event from backend')
          setUseCustomPosition(false) // Hotkeys/tray always use default positions
          setWindowMode(prev => (prev === 'expanded' ? prev : 'expanded'))
        })
        if (disposed) {
          unlistenEvent()
        } else {
          unlisteners.push(unlistenEvent)
        }
      } catch (error) {
        logError('Error wiring window listeners', error)
      }
    }

    setup()

    return () => {
      disposed = true
      for (const unlisten of unlisteners) {
        try {
          unlisten()
        } catch (error) {
          logError('Error during listener cleanup', error)
        }
      }
    }
  }, [])

  // Listen for window drag/move events to save custom position
  useEffect(() => {
    if (!isTauriEnv) return
    let moveTimeout: NodeJS.Timeout | null = null
    let unlisten: UnlistenFn | null = null

    const setup = async () => {
      try {
        const win = getCurrentWebviewWindow()

        // Listen to window position changes (when user drags window)
        unlisten = await win.listen('tauri://move', async (event) => {
          // Save position for collapsed, expanded, and sidepanel modes
          if (windowMode !== 'collapsed' && windowMode !== 'expanded' && windowMode !== 'sidepanel') {
            return
          }

          // Debounce to avoid saving on every pixel move
          if (moveTimeout) clearTimeout(moveTimeout)

          moveTimeout = setTimeout(async () => {
            try {
              const position = await win.outerPosition()
              const posKey = getPositionKey()

              if (posKey) {
                logInfo(`💾 Saving custom position for ${posKey}: (${position.x}, ${position.y})`)
                await invoke('save_custom_position', {
                  mode: posKey,
                  x: position.x,
                  y: position.y
                })
                setUseCustomPosition(true)
                setHasCustomPosition(true)
                logInfo('✅ Custom position saved successfully')
              }
            } catch (e) {
              logError('Error saving custom position:', e)
            }
          }, 500) // Save 500ms after drag ends
        })

        logInfo('✅ Window move listener registered for custom position saving')
      } catch (e) {
        logError('Error setting up move listener:', e)
      }
    }

    setup()

    return () => {
      if (moveTimeout) clearTimeout(moveTimeout)
      if (unlisten) {
        try {
          unlisten()
        } catch (e) {
          logError('Error cleaning up move listener:', e)
        }
      }
    }
  }, [windowMode, sidePanelSide])

  const handleSend = () => {
    if (!input.trim()) return
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: input }])
    
    // Simulate assistant response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'This is a placeholder response. Connect to an LLM API to get real responses.' 
      }])
    }, 500)
    
    setInput('')
  }

  // Debug: Always show current state
  logInfo('🔍 CURRENT RENDER - windowMode:', windowMode)
  
  // Collapsed pill UI - compact and minimal
  if (windowMode === 'collapsed') {
    logInfo('🎯 RENDERING COLLAPSED PILL UI')
    return (
      <div
        className="h-full w-full flex justify-center items-center bg-transparent"
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' }}
        onMouseDown={(e) => {
          const el = e.target as HTMLElement
          if (el.closest('[data-tauri-no-drag]')) return
          void startWindowDrag()
        }}
      >
        <div
          className="collapsed-pill-enter relative pt-12 pb-16"
          onMouseEnter={() => setCollapsedHover(true)}
          onMouseLeave={() => setCollapsedHover(false)}
        >
          {/* Hover actions */}
          {collapsedHover && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 text-white border border-white/10 rounded-full shadow-xl px-2 py-1 flex items-center gap-1"
              data-tauri-no-drag
              style={{ WebkitAppRegion: 'no-drag' as any }}
            >
              <button
                className={`text-xs px-2 py-1 rounded ${isRecording ? 'bg-white/10 opacity-60 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20'}`}
                disabled={isRecording}
                onClick={() => {
                  setIsRecording(true)
                  setShowRecordingPopup(true)
                  if (recordPopupTimerRef.current) clearTimeout(recordPopupTimerRef.current)
                  recordPopupTimerRef.current = setTimeout(() => setShowRecordingPopup(false), 3000)
                }}
              >
                ● Record
              </button>
              <button
                className={`text-xs px-2 py-1 rounded ${!isRecording ? 'bg-white/10 opacity-60 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20'}`}
                disabled={!isRecording}
                onClick={() => {
                  setIsRecording(false)
                  setShowRecordingPopup(false)
                }}
              >
                ■ Stop
              </button>
            </div>
          )}

          {/* Collapsed pill button */}
          <button
            type="button"
            className="relative flex items-center gap-2 rounded-full border border-white/20 bg-[#131313]/95 px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-white/30 hover:shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
            data-tauri-no-drag
            style={{ WebkitAppRegion: 'no-drag' as any }}
            onClick={() => {
              logInfo('Collapsed pill clicked, expanding panel')
              setUseCustomPosition(true) // User manual click can use custom position
              setWindowMode('expanded')
            }}
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#5436da] to-[#19c37d] flex items-center justify-center text-white text-xs font-bold">
              Δ
            </div>
            {isRecording && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          {/* Recording popup */}
          {showRecordingPopup && (
            <div
              className="absolute left-1/2 top-20 -translate-x-1/2 w-[320px] bg-black/85 text-white border border-white/10 rounded-2xl shadow-2xl p-4"
              data-tauri-no-drag
              style={{ WebkitAppRegion: 'no-drag' as any }}
            >
              <div className="text-sm font-medium mb-1">Recording your workflow…</div>
              <div className="text-xs text-[#d0d0d0]">Capturing real-time context. Suggestions will appear as you work.</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Hovered preview UI
  if (windowMode === 'hovered') {
    return (
      <div
        className="h-full w-full flex items-center justify-center cursor-pointer bg-transparent"
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' }}
        onMouseLeave={() => {
          logInfo('Mouse left hovered pill, switching to collapsed')
          setWindowMode('collapsed')
        }}
        onClick={() => {
          logInfo('Hovered pill clicked, switching to expanded')
          setUseCustomPosition(true) // User manual click can use custom position
          setWindowMode('expanded')
        }}
      >
        <div className="bg-[#1a1a1a] backdrop-blur-xl rounded-full border-2 border-[#19c37d] shadow-2xl px-10 py-4 hover:scale-105 transition-all duration-200" data-tauri-no-drag style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#5436da] to-[#19c37d] animate-pulse"></div>
            <span className="text-white font-semibold text-base whitespace-nowrap">Demo AI - Click to Open</span>
          </div>
        </div>
      </div>
    )
  }

  // Sidepanel UI (transparent vertical panel)
  if (windowMode === 'sidepanel') {
    return (
      <div
        className="flex flex-col h-screen bg-transparent text-[#ececec]"
      >
        {/* Drag handle at top for movement */}
        <div className="h-8 relative" data-tauri-drag-region style={{ WebkitAppRegion: 'drag' }}>
          {/* Custom position indicator for sidepanel */}
          {hasCustomPosition && (
            <div className="absolute top-1 right-2 flex items-center gap-2" data-drag="block">
              <div className="bg-black/80 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <span>📍</span>
                <span>Custom</span>
              </div>
              <button
                onClick={async () => {
                  const posKey = getPositionKey()
                  if (posKey) {
                    try {
                      await invoke('clear_custom_position', { mode: posKey })
                      setHasCustomPosition(false)
                      setUseCustomPosition(false)
                      logInfo('Custom position cleared for', posKey)
                      // Reset to default position
                      if (sidePanelSide === 'right') {
                        await invoke('position_window_right_center', { margin: 40 })
                      } else {
                        await invoke('position_window_left_center', { margin: 40 })
                      }
                    } catch (e) {
                      logError('Error clearing custom position:', e)
                    }
                  }
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-xs transition"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3">
          <div className="h-full w-full bg-[#282828]/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col">
            {/* Messages list */}
            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[#bdbdbd]">Start a conversation</div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <div key={i} className="text-sm">
                      <div className="font-semibold mb-1 text-[#ececec]">{m.role === 'user' ? 'You' : 'Demo AI'}</div>
                      <div className="text-[#ececec]/90 leading-relaxed">{m.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input bar pinned to bottom */}
            <div className="p-3" data-drag="block">
              <div className="bg-[#282828]/50 backdrop-blur-xl rounded-[20px] border border-white/10 shadow-xl flex items-center gap-2 px-3 py-2.5" data-drag="block">
                <button className="p-1.5 hover:bg-[#3a3a3a] rounded-md transition-colors text-[#ececec]" aria-label="Add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Ask anything"
                  className="flex-1 bg-transparent text-[#ececec] outline-none placeholder-[#7a7a7a] text-sm"
                />
                {/* Switch side button - reuses panel icon */}
                <button
                  className="p-1.5 hover:bg-[#3a3a3a] rounded-md transition-colors text-[#ececec]"
                  aria-label="Switch side"
                  title={sidePanelSide === 'right' ? 'Move to left' : 'Move to right'}
                  onClick={async () => {
                    try {
                      const next = sidePanelSide === 'right' ? 'left' : 'right'
                      setSidePanelSide(next)
                      if (next === 'right') {
                        await invoke('position_window_right_center', { margin: 40 })
                      } else {
                        await invoke('position_window_left_center', { margin: 40 })
                      }
                      logInfo('Side switched to', next)
                    } catch (e) {
                      logError('Error switching sidepanel side', e)
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    {sidePanelSide === 'right' ? (
                      <rect x="12" y="6" width="7" height="12" rx="2" ry="2" fill="currentColor" stroke="none" />
                    ) : (
                      <rect x="5" y="6" width="7" height="12" rx="2" ry="2" fill="currentColor" stroke="none" />
                    )}
                  </svg>
                </button>
                <button onClick={handleSend} className="px-2 py-1.5 text-sm rounded-md bg-[#3a3a3a] hover:bg-[#4a4a4a] transition-colors">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Expanded full chat UI
  return (
    <div className="flex flex-col h-screen bg-transparent text-[#ececec] transition-all duration-300">
      {/* Dashboard overlay */}
      {showDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDashboard(false)} />
          <div
            ref={dashboardRef}
            className="relative z-10 w-[1400px] max-w-[99vw] max-h-[95vh] bg-[#1b1b1b]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 sticky top-0 bg-[#1b1b1b]/80 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button
                  className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm"
                  onClick={() => setShowDashboard(false)}
                >
                  ← Back to Chat
                </button>
                <div className="text-lg font-semibold">Dashboard</div>
              </div>
              <button className="p-2 rounded-lg hover:bg-white/10" onClick={() => setShowDashboard(false)} aria-label="Close dashboard">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Project-centric layout */}
            <div className="flex">
              {/* Projects sidebar (hidden when a project is selected) */}
              {!dashboardSelectedProject && (
              <aside className="w-80 shrink-0 border-r border-white/10 bg-white/5">
                <div className="p-4 flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">📁</span>
                    Projects
                  </div>
                  <button
                    className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                    onClick={() => {
                      const nextName = `New Project ${projects.length + 1}`
                      const now = new Date().toISOString()
                      setProjects(prev => [...prev, { name: nextName, createdAt: now, updatedAt: now }])
                      setSelectedProject(nextName)
                      setDashboardSelectedProject(nextName)
                    }}
                  >
                    New
                  </button>
                </div>
                <div className="px-3 pb-3">
                  <div className="space-y-1">
                    {projects.map((p) => (
                      <button
                        key={p.name}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${p.name === dashboardSelectedProject ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'} text-[#ececec]`}
                        onClick={() => {
                          setDashboardSelectedProject(p.name)
                          setSelectedProject(p.name)
                        }}
                      >
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-[#bdbdbd] mt-0.5 truncate">Updated {new Date(p.updatedAt).toLocaleDateString()}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
              )}

              {/* Details panel */}
              <main className="flex-1 p-5 space-y-4 overflow-auto">
                {!dashboardSelectedProject ? (
                  <div className="h-full min-h-[60vh] flex items-center justify-center">
                    <div className="text-center max-w-lg">
                      <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-white/10 mb-4">📁</div>
                      <h2 className="text-2xl font-semibold mb-2">Projects</h2>
                      <p className="text-[#cfcfcf]/80 mb-4">Select a project to view its AI History, Your Context, and Your Subagents.</p>
                      <button
                        className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm"
                        onClick={() => {
                          const nextName = `New Project ${projects.length + 1}`
                          const now = new Date().toISOString()
                          setProjects(prev => [...prev, { name: nextName, createdAt: now, updatedAt: now }])
                          setSelectedProject(nextName)
                          setDashboardSelectedProject(nextName)
                        }}
                      >
                        Create New Project
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Project header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm"
                          onClick={() => setDashboardSelectedProject(null)}
                        >
                          ← Back to Projects
                        </button>
                        <div>
                          <div className="text-sm text-[#bdbdbd]">Project</div>
                          <div className="text-xl font-semibold">{dashboardSelectedProject}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm">Share</button>
                        <button className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm">Settings</button>
                      </div>
                    </div>

                    {/* AI History (now only inside project view) */}
                    <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">🧠</span>
                          AI History
                        </div>
                        <button className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs">Export</button>
                      </div>
                      <div className="space-y-2 text-sm">
                        {(messages.length ? messages.slice(-10) : [
                          { role: 'assistant', content: 'Welcome! How can I help?' },
                          { role: 'user', content: 'Draft an email follow-up' },
                          { role: 'assistant', content: 'Here is a friendly follow-up draft…' },
                        ]).map((m: any, i: number) => (
                          <div key={i} className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5]">
                            <span className="opacity-70 pr-2">{m.role === 'user' ? 'You:' : 'AI:'}</span>
                            <span className="truncate inline-block max-w-full align-middle">{m.content}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Your Context */}
                    <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">📚</span>
                          Your Context
                        </div>
                        <button
                          className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                          onClick={() => {
                            const projectName = dashboardSelectedProject as string
                            setProjectEntries(prev => {
                              const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                              const idx = curr.contexts.length + 1
                              const next = {
                                ...curr,
                                contexts: [...curr.contexts, { name: `Context ${idx}`, owner: currentUser }]
                              }
                              return { ...prev, [projectName]: next }
                            })
                          }}
                        >
                          New
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {(projectEntries[dashboardSelectedProject as string]?.contexts ?? defaultContexts).map((item, idx) => (
                          <div key={`${item.name}-${item.owner}`} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(item.owner)} text-black/80 flex items-center justify-center text-xs font-semibold`}>
                                {avatarInitial(item.owner)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{item.name}</div>
                                <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                                onClick={() => {
                                  const projectName = dashboardSelectedProject as string
                                  const newName = window.prompt('Edit context name', item.name)
                                  if (!newName) return
                                  setProjectEntries(prev => {
                                    const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                                    const next = { ...curr }
                                    next.contexts = curr.contexts.map((c, i) => i === idx ? { ...c, name: newName } : c)
                                    return { ...prev, [projectName]: next }
                                  })
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                                onClick={() => {
                                  const projectName = dashboardSelectedProject as string
                                  setProjectEntries(prev => {
                                    const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                                    const next = { ...curr, contexts: curr.contexts.filter((_, i) => i !== idx) }
                                    return { ...prev, [projectName]: next }
                                  })
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Your Subagents */}
                    <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">🤝</span>
                          Your Subagents
                        </div>
                        <button
                          className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                          onClick={() => {
                            const projectName = dashboardSelectedProject as string
                            setProjectEntries(prev => {
                              const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                              const idx = curr.subagents.length + 1
                              const next = {
                                ...curr,
                                subagents: [...curr.subagents, { name: `Agent ${idx}`, owner: currentUser }]
                              }
                              return { ...prev, [projectName]: next }
                            })
                          }}
                        >
                          New
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {(projectEntries[dashboardSelectedProject as string]?.subagents ?? defaultSubagents).map((item, idx) => (
                          <div key={`${item.name}-${item.owner}`} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(item.owner)} text-black/80 flex items-center justify-center text-xs font-semibold`}>
                                {avatarInitial(item.owner)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{item.name}</div>
                                <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                                onClick={() => {
                                  const projectName = dashboardSelectedProject as string
                                  const newName = window.prompt('Edit subagent name', item.name)
                                  if (!newName) return
                                  setProjectEntries(prev => {
                                    const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                                    const next = { ...curr }
                                    next.subagents = curr.subagents.map((s, i) => i === idx ? { ...s, name: newName } : s)
                                    return { ...prev, [projectName]: next }
                                  })
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                                onClick={() => {
                                  const projectName = dashboardSelectedProject as string
                                  setProjectEntries(prev => {
                                    const curr = prev[projectName] ?? { subagents: [...defaultSubagents], contexts: [...defaultContexts] }
                                    const next = { ...curr, subagents: curr.subagents.filter((_, i) => i !== idx) }
                                    return { ...prev, [projectName]: next }
                                  })
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Your Team (shared) */}
                    <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="text-sm font-semibold mb-3">Your Team</div>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Team Context */}
                        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold flex items-center gap-2">
                              <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-white/10">📚</span>
                              Team Context
                            </div>
                            <button
                              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                              onClick={() => {
                                const idx = teamSharedContexts.length + 1
                                setTeamSharedContexts(prev => [...prev, { name: `Team Context ${idx}`, owner: 'Team' }])
                              }}
                            >
                              Add
                            </button>
                          </div>
                          <div className="space-y-2 text-sm">
                            {teamSharedContexts.map((item, i) => (
                              <div key={`${item.name}-${i}`} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(item.owner)} text-black/80 flex items-center justify-center text-xs font-semibold`}>
                                  {avatarInitial(item.owner)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{item.name}</div>
                                  <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Team Subagents */}
                        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold flex items-center gap-2">
                              <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-white/10">🤝</span>
                              Team Subagents
                            </div>
                            <button
                              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                              onClick={() => {
                                const idx = teamSharedSubagents.length + 1
                                setTeamSharedSubagents(prev => [...prev, { name: `Team Agent ${idx}`, owner: 'Team' }])
                              }}
                            >
                              Add
                            </button>
                          </div>
                          <div className="space-y-2 text-sm">
                            {teamSharedSubagents.map((item, i) => (
                              <div key={`${item.name}-${i}`} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(item.owner)} text-black/80 flex items-center justify-center text-xs font-semibold`}>
                                  {avatarInitial(item.owner)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{item.name}</div>
                                  <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
      {/* Drag handle bar (frameless window) */}
      <div
        className="fixed top-0 left-0 right-0 h-8 z-30"
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' }}
        aria-hidden
      />

      {/* Removed debug/test toggle buttons for cleaner UI */}
      
      {/* Main chat area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center">
                  <h1 className="text-3xl font-semibold mb-8 text-[#ececec]">Demo AI</h1>
                  {codexReady && (
                    <div className="flex items-center justify-center gap-2 text-[#19c37d] mb-4">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="text-sm font-medium">Codex Initialized</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 space-y-6">
                {messages.map((msg, i) => (
                  <div key={i} className="group">
                    <div className="flex gap-4">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-sm flex items-center justify-center text-white ${
                          msg.role === 'user'
                            ? 'bg-[#5436da]'
                            : 'bg-[#19c37d]'
                        }`}>
                          {msg.role === 'user' ? '5' : '✓'}
                        </div>
                      </div>
                      {/* Message content */}
                      <div className="flex-1 overflow-hidden">
                        <div className="font-semibold mb-1 text-[#ececec]">
                          {msg.role === 'user' ? 'You' : 'Demo AI'}
                        </div>
                        <div className="text-[#ececec] leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input area - centered pill design */}
      <div className="pb-8 px-4">
        <div className="max-w-[1000px] mx-auto">
          <div className="bg-[#282828]/50 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl flex items-center gap-3 px-6 py-3.5" data-drag="block">
            {/* Left icons */}
            <button className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>

            <button className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
            </button>

            {/* Input field */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask anything"
              className="flex-1 bg-transparent text-[#ececec] outline-none placeholder-[#7a7a7a] text-base"
              autoFocus
            />

            {/* Right icons */}
            {/* Dashboard icon */}
            <button
              className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]"
              aria-label="Dashboard"
              onClick={() => setShowDashboard(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="17" rx="3"/>
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="12" y1="9" x2="12" y2="21" />
              </svg>
            </button>

            {/* Projects popover anchor */}
            <div className="relative">
              <button
                className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]"
                aria-label="Projects"
                onClick={() => setShowProjectsMenu(v => !v)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="8" rx="2"/>
                  <rect x="13" y="3" width="8" height="8" rx="2"/>
                  <rect x="3" y="13" width="8" height="8" rx="2"/>
                  <rect x="13" y="13" width="8" height="8" rx="2"/>
                </svg>
              </button>
              {showProjectsMenu && (
                <div ref={projectsMenuRef} className="absolute -top-3 right-0 translate-y-[-100%] w-72 select-none">
                  <div className="relative">
                    <div className="bg-[#282828]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                      <div className="p-2">
                        {projects.map((p) => (
                          <button
                            key={p.name}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${p.name === selectedProject ? 'bg-white/10' : 'hover:bg-white/5'} text-[#ececec]`}
                            onClick={() => { setSelectedProject(p.name); setShowProjectsMenu(false) }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{p.name}</div>
                              {p.name === selectedProject && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <div className="text-xs text-[#bdbdbd] mt-0.5">
                              Created {new Date(p.createdAt).toLocaleDateString()} · Edited {new Date(p.updatedAt).toLocaleDateString()}
                            </div>
                          </button>
                        ))}
                        <div className="my-2 h-px bg-white/10" />
                        <button
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-[#ececec] flex items-center gap-2"
                          onClick={() => {
                            const nextName = `New Project ${projects.length + 1}`
                            const now = new Date().toISOString()
                            setProjects(prev => [...prev, { name: nextName, createdAt: now, updatedAt: now }])
                            setSelectedProject(nextName)
                            setShowProjectsMenu(false)
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          <span className="font-medium">Create new project</span>
                        </button>
                      </div>
                    </div>
                    <div className="absolute -bottom-2 right-6 w-4 h-4 rotate-45 bg-[#282828]/80 border-r border-b border-white/10" />
                  </div>
                </div>
              )}
            </div>

            <button className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            <button
              className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors text-[#ececec]"
              aria-label="Panel icon"
              onClick={() => {
                const next = windowMode === 'sidepanel' ? 'expanded' : 'sidepanel'
                logInfo('Side panel button clicked. Switching to:', next)
                setWindowMode(next)
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                <rect x="12" y="6" width="7" height="12" rx="2" ry="2" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
