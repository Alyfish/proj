import './App.css'
import { useState, useEffect, useRef, memo } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { VoiceRecorder, runVoicePipeline, playAudio, synthesize } from './voiceAgent'
import { emailAssistant } from './emailAssistant'
import { screenContext } from './screenContext'

// Default user for email assistant; override via VITE_EMAIL_ASSISTANT_USER_ID to match seeded backend user.
const EMAIL_ASSISTANT_USER_ID = import.meta.env.VITE_EMAIL_ASSISTANT_USER_ID || 'test-user-id'

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

// Simple matcher to detect email-assistant intents in text prompts
const isEmailAssistantCommand = (text: string) => {
  const normalized = text.toLowerCase()
  const triggers = [
    'process emails',
    'check emails',
    'email assistant',
    'process my emails',
    'scan my emails',
    'go through my emails'
  ]
  // Heuristics: if the user asks to find/summarize emails about a topic or from a sender, treat it as an email task
  const emailIntent = normalized.includes('email') || normalized.includes('emai') // tolerate minor typos
  const actionIntent = ['process', 'check', 'scan', 'go through', 'find', 'look for', 'summarize', 'list'].some(kw => normalized.includes(kw))
  const aboutIntent = ['about', 'regarding', 'investment', 'opportunity', 'from'].some(kw => normalized.includes(kw))
  return triggers.some(cmd => normalized.includes(cmd)) ||
    (emailIntent && (actionIntent || aboutIntent))
}

// Detect screen context commands (e.g., "what's on my screen", "analyze this", "help me with this")
const isScreenContextCommand = (text: string) => {
  const normalized = text.toLowerCase()
  const triggers = [
    'what\'s on my screen',
    'whats on my screen',
    'what is on my screen',
    'what do you see',
    'analyze this',
    'help me with this',
    'look at my screen',
    'read my screen',
    'what am i looking at',
    'screen context',
    'analyze screen'
  ]
  // Also trigger for questions when user seems to want contextual help
  const contextWords = ['this', 'here', 'screen', 'see', 'looking', 'help']
  const isQuestion = normalized.includes('?') || normalized.startsWith('what') || normalized.startsWith('how') || normalized.startsWith('can you')
  const hasContextWord = contextWords.some(w => normalized.includes(w))

  return triggers.some(cmd => normalized.includes(cmd)) ||
    (isQuestion && hasContextWord && normalized.length < 100) // Short contextual questions
}

type WindowMode = 'collapsed' | 'hovered' | 'expanded' | 'sidepanel'

// Safe streaming text component that avoids re-render thrashing
const StreamingText = memo(({ text, speed = 30, createdAt }: { text: string; speed?: number; createdAt?: number }) => {
  const [displayedText, setDisplayedText] = useState('')
  const index = useRef(0)

  // Only animate if the message is recent (< 3 seconds old)

  useEffect(() => {
    // If we shouldn't animate, show full text immediately
    if (!createdAt || (Date.now() - createdAt) > 3000) {
      setDisplayedText(text)
      return
    }

    // Reset if text changes significantly (new message)
    if (!text.startsWith(displayedText) && displayedText !== '') {
      setDisplayedText('')
      index.current = 0
    }
  }, [text, displayedText, createdAt])

  useEffect(() => {
    if (!createdAt || (Date.now() - createdAt) > 3000) return

    // Immediate show for very short text or if already complete
    if (text.length <= displayedText.length) return

    let animationFrameId: number
    const start = Date.now()

    const tick = () => {
      const now = Date.now()
      const elapsed = now - start
      // Calculate how many chars should be shown by now
      const targetIndex = Math.floor(elapsed / speed)

      if (targetIndex > index.current) {
        // Update state only if we need to show more characters
        const nextIndex = Math.min(targetIndex, text.length)
        setDisplayedText(text.slice(0, nextIndex))
        index.current = nextIndex
      }

      if (index.current < text.length) {
        animationFrameId = requestAnimationFrame(tick)
      }
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [text, speed, createdAt])

  return <>{displayedText}</>
})

export default function App() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string; createdAt?: number }>>([])
  const [windowMode, setWindowMode] = useState<WindowMode>('expanded')
  const [sidePanelSide, setSidePanelSide] = useState<'right' | 'left'>('right')
  const [emailResult, setEmailResult] = useState<{
    recentEmails?: Array<{ id: string; subject: string; snippet: string; sender: string; receivedAt: string; priority?: string }>
    analyses?: Array<{ emailId: string; summary: string; actionItems: string[]; deadline?: string; entities: string[] }>
    suggestions?: Array<{ type: 'task' | 'reply' | 'info'; title: string; details: string; sourceEmailId?: string; priority: 'high' | 'medium' | 'low' }>
    intent?: string
    query?: string
    activeGoals?: Array<{ id?: number; goalText: string; confidence: number }>
    emailGoalRelevance?: Record<string, number[]>
  } | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [showEmailPanel, setShowEmailPanel] = useState<boolean>(true)
  const clearEmailPanel = () => {
    setShowEmailPanel(false)
  }

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

  // Model selection state
  const AI_MODELS = [
    { id: 'gpt-5', name: 'GPT-5', badge: 'New' },
    { id: 'gpt-4o', name: 'GPT-4o', badge: null },
    { id: 'claude-opus', name: 'Claude Opus 4.5', badge: 'Thinking' },
    { id: 'claude-sonnet', name: 'Claude Sonnet 4.5', badge: null },
    { id: 'gemini-pro', name: 'Gemini 3 Pro', badge: 'High' },
    { id: 'gemini-flash', name: 'Gemini 3 Flash', badge: 'Fast' },
  ]
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5')
  const [showModelMenu, setShowModelMenu] = useState<boolean>(false)
  const modelMenuRef = useRef<HTMLDivElement | null>(null)

  // Dashboard state
  const [showDashboard, setShowDashboard] = useState(false)
  const dashboardRef = useRef<HTMLDivElement | null>(null)
  const [dashboardSelectedProject, setDashboardSelectedProject] = useState<string | null>(null)

  // Collapsed pill interactions
  const [collapsedHover, setCollapsedHover] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showRecordingPopup, setShowRecordingPopup] = useState(false)
  const recordPopupTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Demo notification state (triggered by typing "prompt me")
  type DemoNotification = {
    title: string
    message: string
    imageSrc: string
  }
  const [showNotification, setShowNotification] = useState(false)
  const [notificationExpanded, setNotificationExpanded] = useState(false)
  const [notification, setNotification] = useState<DemoNotification | null>(null)
  const [autoMode, setAutoMode] = useState(false)

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
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({})

  // Codex state removed - was unused

  // Voice agent state
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [lastTranscript, setLastTranscript] = useState<string>('')
  const [lastResponse, setLastResponse] = useState<string>('')
  const [hasGreetedVoice, setHasGreetedVoice] = useState<boolean>(false)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const lastAudioRef = useRef<HTMLAudioElement | null>(null)

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
    // Check for Swift bridge mode
    const bridge = (window as any).swiftBridge
    const isSwiftBridge = !isTauriEnv && bridge

    if (!isTauriEnv && !isSwiftBridge) {
      // Pure web mode (no native wrapper), skip window manipulation
      return
    }

    const updateWindowSize = async () => {
      logInfo('Window mode changed to:', windowMode)

      // Swift Bridge handling
      if (isSwiftBridge) {
        logInfo('[SWIFT] Handling window mode change via Swift bridge')

        try {
          if (windowMode === 'collapsed') {
            bridge.setSize(220, 160)
            const posKey = getPositionKey()
            if (posKey) {
              const customPos = await bridge.getPosition(posKey)
              if (customPos) {
                logInfo('[SWIFT] Using custom position:', customPos)
                bridge.setPosition(customPos[0], customPos[1])
              } else {
                bridge.center()
              }
            } else {
              bridge.center()
            }
            bridge.focus()
          } else if (windowMode === 'hovered') {
            bridge.setSize(420, 110)
            bridge.positionTopCenter()
            bridge.focus()
          } else if (windowMode === 'expanded') {
            bridge.setSize(800, 600)
            const posKey = getPositionKey()
            if (useCustomPosition && posKey) {
              const customPos = await bridge.getPosition(posKey)
              if (customPos) {
                logInfo('[SWIFT] Using custom position:', customPos)
                bridge.setPosition(customPos[0], customPos[1])
              } else {
                bridge.center()
              }
            } else {
              bridge.center()
            }
            bridge.focus()
          } else if (windowMode === 'sidepanel') {
            bridge.setSize(420, 800)
            const posKey = getPositionKey()
            if (useCustomPosition && posKey) {
              const customPos = await bridge.getPosition(posKey)
              if (customPos) {
                logInfo('[SWIFT] Using custom position:', customPos)
                bridge.setPosition(customPos[0], customPos[1])
              } else {
                if (sidePanelSide === 'right') {
                  bridge.positionRightCenter(40)
                } else {
                  bridge.positionLeftCenter(40)
                }
              }
            } else {
              if (sidePanelSide === 'right') {
                bridge.positionRightCenter(40)
              } else {
                bridge.positionLeftCenter(40)
              }
            }
            bridge.focus()
          }
          logInfo('[SWIFT] Window mode applied successfully')
        } catch (error) {
          logError('[SWIFT] Error updating window:', error)
        }
        return
      }

      // Tauri handling (existing code)
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

  // Swift Bridge listener - handles toggle events when running in Swift WKWebView
  useEffect(() => {
    // Only run in web environment (Swift bridge mode)
    if (isTauriEnv) return

    logInfo('🔧 [SWIFT BRIDGE] Setting up Swift toggle listener...')

    const handleSwiftToggle = () => {
      logInfo('═══════════════════════════════════════════════')
      logInfo('🚨 [SWIFT BRIDGE] Toggle event received!')
      logInfo('🚨 [SWIFT BRIDGE] Current windowMode:', windowModeRef.current)

      if (!shouldHandleToggle()) {
        logInfo('⏭️ [SWIFT BRIDGE] Skipping duplicate toggle')
        return
      }

      const currentMode = windowModeRef.current
      const newMode: WindowMode = currentMode === 'sidepanel'
        ? 'collapsed'
        : currentMode === 'collapsed'
          ? 'expanded'
          : 'collapsed'

      logInfo('🚨 [SWIFT BRIDGE] Toggling from', currentMode, 'to', newMode)
      setUseCustomPosition(false)
      setWindowMode(newMode)
      // Note: Window sizing is handled by the windowMode useEffect via Swift bridge

      logInfo('═══════════════════════════════════════════════')
    }

    window.addEventListener('toggle-collapse', handleSwiftToggle)
    logInfo('✅ [SWIFT BRIDGE] Toggle listener registered')

    return () => {
      logInfo('🧹 [SWIFT BRIDGE] Cleaning up toggle listener')
      window.removeEventListener('toggle-collapse', handleSwiftToggle)
    }
  }, [])

  // Re-expand when backend asks for it (tray icon, hotkeys, etc) - desktop only
  useEffect(() => {
    if (!isTauriEnv) return
    let unlisteners: UnlistenFn[] = []
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

  const handleSend = async () => {
    if (!input.trim()) return

    const userInput = input.trim();

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userInput, createdAt: Date.now() }])
    setInput('');

    // Check for "hi sentext" greeting trigger
    const isSentexGreeting = /^(hi|hey|hello)\s*(sentext|sentex)/i.test(userInput);
    if (isSentexGreeting) {
      const greeting = 'Mr Jassani, Sentex at your service! How can I help you today?';
      setMessages(prev => [...prev, { role: 'assistant', content: greeting, createdAt: Date.now() }]);
      // Also speak the greeting
      try {
        const audioUrl = await synthesize(greeting);
        const audio = new Audio(audioUrl);
        audio.play().catch(() => { });
      } catch (e) {
        logError('TTS for greeting failed:', e);
      }
      return;
    }

    // Check for email assistant commands
    const isEmailCommand = isEmailAssistantCommand(userInput);

    if (isEmailCommand) {
      // Show loading message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🔄 Retrieving and prioritizing your emails...',
        createdAt: Date.now()
      }]);

      try {
        setEmailError(null)
        // Quick health check so we can fail fast with a helpful message
        const healthy = await emailAssistant.healthCheck()
        if (!healthy) {
          setEmailError('Email assistant API is unreachable. Start it with "cd email-assistant/orchestrator && npm run start:server".')
          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: '❌ Email assistant API is unreachable.\n\nStart it with:\ncd email-assistant/orchestrator && npm run start:server',
            createdAt: Date.now()
          }]))
          return
        }

        // Call email assistant API with quick mode for faster response
        // Using a default user ID from env; backend expects this user to be seeded.
        const result = await emailAssistant.processEmails(EMAIL_ASSISTANT_USER_ID, userInput, false);

        if (result.success && result.textOutput) {
          const quickStatus = result.quickStatus ? `\n\n${result.quickStatus}` : ''
          // Display the formatted text output
          const hasData = (result.data?.recentEmails?.length ?? 0) > 0 || (result.data?.suggestions?.length ?? 0) > 0;

          let chatMessage = result.textOutput;
          if (hasData) {
            const emailCount = result.data?.recentEmails?.length ?? 0;
            const suggestionCount = result.data?.suggestions?.length ?? 0;
            if (suggestionCount > 0) {
              chatMessage = `Found ${emailCount} relevant emails and generated ${suggestionCount} suggestions.\n\nCheck the **Email Insights** panel for details.`;
            } else {
              chatMessage = `Found ${emailCount} prioritized emails.\n\nCheck the **Email Insights** panel for details. (Analysis in progress...)`;
            }
          }

          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: `${chatMessage}${quickStatus}`,
            createdAt: Date.now()
          }]));


          if (hasData) {
            setEmailError(null)
            setEmailResult({
              recentEmails: result.data?.recentEmails,
              analyses: result.data?.analyses,
              suggestions: result.data?.suggestions,
              intent: result.data?.intent,
              query: result.data?.query,
              activeGoals: result.data?.activeGoals,
              emailGoalRelevance: result.data?.emailGoalRelevance
            })
            setShowEmailPanel(true)
          } else {
            setEmailError('No matching emails or suggestions were returned for this query.')
            setEmailResult(null)
          }
        } else {
          // Show error message
          setEmailError(result.message || result.error || 'Failed to process emails')
          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: `❌ Failed to process emails: ${result.error || 'Unknown error'}\n\nMake sure the email assistant server is running:\ncd email-assistant/orchestrator && npm run start:server`,
            createdAt: Date.now()
          }]));
        }
      } catch (error) {
        console.error('Email processing error:', error);
        setEmailError(error instanceof Error ? error.message : 'Failed to connect to email assistant')
        setMessages(prev => prev.slice(0, -1).concat([{
          role: 'assistant',
          content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to connect to email assistant'}\n\nMake sure the server is running on http://localhost:3001 and that VITE_EMAIL_ASSISTANT_USER_ID matches a seeded user.`,
          createdAt: Date.now()
        }]));
      }
      return;
    }

    // Demo trigger: if user types "prompt me", show action notification
    if (userInput.toLowerCase().includes('prompt me')) {
      setNotification({
        title: 'Action requested',
        message: 'Open the Project Brief and extract key tasks to your tracker. Review the suggested steps and confirm.',
        imageSrc: '/vite.svg',
      })
      setNotificationExpanded(false)
      setShowNotification(true)
    }

    // Check for screen context commands or use screen context for general queries
    const useScreenContext = isScreenContextCommand(userInput)

    if (useScreenContext) {
      // Show loading message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🖥️ Capturing screen context and analyzing...',
        createdAt: Date.now()
      }]);

      try {
        // Check if service is running
        const healthy = await screenContext.healthCheck()
        if (!healthy) {
          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: '❌ Screen context service is not running.\n\nStart it with:\ncd screen-context && source venv/bin/activate && python server.py',
            createdAt: Date.now()
          }]))
          return
        }

        // Analyze with screen context
        const result = await screenContext.analyzeWithContext(userInput)

        if (result.success && result.response) {
          const contextInfo = []
          if (result.context_used.has_screenshot) contextInfo.push('📸 screenshot')
          if (result.context_used.has_selected_text) contextInfo.push('📝 selected text')
          if (result.context_used.has_browser_url) contextInfo.push('🔗 browser URL')
          if (result.context_used.active_app) contextInfo.push(`📱 ${result.context_used.active_app}`)

          const contextLine = contextInfo.length > 0
            ? `*Context used: ${contextInfo.join(', ')}*\n\n`
            : ''

          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: `${contextLine}${result.response}`,
            createdAt: Date.now()
          }]))
        } else {
          setMessages(prev => prev.slice(0, -1).concat([{
            role: 'assistant',
            content: `❌ Failed to analyze screen: ${result.error || 'Unknown error'}`,
            createdAt: Date.now()
          }]))
        }
      } catch (error) {
        console.error('Screen context error:', error)
        setMessages(prev => prev.slice(0, -1).concat([{
          role: 'assistant',
          content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to connect to screen context service'}`,
          createdAt: Date.now()
        }]))
      }
      return
    }

    // Simulate assistant response for other commands
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'This is a placeholder response. Connect to an LLM API to get real responses.\n\nTip: Try "what\'s on my screen?" to use screen context, or "process emails" for email assistant!',
        createdAt: Date.now()
      }])
    }, 500)
  }

  // Voice agent controls
  const startVoice = async () => {
    if (voiceRecording || voiceBusy) return
    try {
      recorderRef.current = new VoiceRecorder()
      await recorderRef.current.start()
      setVoiceRecording(true)
    } catch (e: any) {
      logError('Mic start failed', e)
      const msg = e?.message || e?.name || String(e)
      alert('Microphone permission failed: ' + msg + '\nOn macOS, grant mic access in System Settings → Privacy & Security → Microphone.')
    }
  }

  const stopVoice = async () => {
    if (!voiceRecording || !recorderRef.current) return
    setVoiceRecording(false)
    setVoiceBusy(true)
    try {
      const blob = await recorderRef.current.stop()
      // First interaction: greet with a fixed line
      if (!hasGreetedVoice) {
        const greeting = 'Mr Jassani, Sentex at your service! How can I help you today?'
        setHasGreetedVoice(true)
        setLastTranscript('(first voice interaction)')
        setLastResponse(greeting)
        let url: string | null = null
        try {
          url = await synthesize(greeting)
        } catch (ge) {
          logError('Greeting TTS failed', ge)
        }
        if (url) {
          const audio = new Audio(url)
          lastAudioRef.current?.pause()
          lastAudioRef.current = audio
          void audio.play()
        }
        setMessages(prev => [
          ...prev,
          { role: 'user', content: '(voice) ' + (new Date().toLocaleTimeString()), createdAt: Date.now() },
          { role: 'assistant', content: greeting, createdAt: Date.now() }
        ])
      } else {
        const { transcript, responseText, audioUrl } = await runVoicePipeline(blob)
        setLastTranscript(transcript)
        setLastResponse(responseText)
        // Play
        const audio = new Audio(audioUrl)
        lastAudioRef.current?.pause()
        lastAudioRef.current = audio
        void audio.play()
        // Also drop messages in chat
        setMessages(prev => [...prev, { role: 'user', content: `(voice) ${transcript}`, createdAt: Date.now() }, { role: 'assistant', content: responseText, createdAt: Date.now() }])
      }
    } catch (e) {
      logError('Voice pipeline error', e)
      alert('Voice pipeline failed: ' + (e as Error).message)
    } finally {
      setVoiceBusy(false)
    }
  }

  // Debug: Always show current state
  logInfo('🔍 CURRENT RENDER - windowMode:', windowMode)

  // Collapsed View - "Nano Pill" Mode
  if (windowMode === 'collapsed') {
    return (
      <div className="flex items-center justify-center w-full h-full bg-transparent">
        <div
          className="gem-pill group"
          onClick={() => {
            setWindowMode('expanded')
            // Trigger native expand if needed
            if (isTauriEnv) invoke('expand_window').catch(() => { })
          }}
        >
          {/* Sparkles Icon */}
          <svg className="w-4 h-4 text-white group-hover:animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
          </svg>
          <span className="text-white/90 font-medium text-sm tracking-wide">Sentex AI</span>
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
        <div className="rounded-full border border-white/15 px-10 py-4 hover:scale-105 transition-all duration-200" data-tauri-no-drag style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#5436da] to-[#19c37d] animate-pulse"></div>
            <span className="text-white font-semibold text-base whitespace-nowrap">Sentex AI</span>
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
                      // Use Swift bridge if available
                      const bridge = (window as any).swiftBridge
                      if (bridge) {
                        bridge.clearPosition(posKey)
                        setHasCustomPosition(false)
                        setUseCustomPosition(false)
                        logInfo('[SWIFT] Custom position cleared for', posKey)
                        // Reset to default position
                        if (sidePanelSide === 'right') {
                          bridge.positionRightCenter(40)
                        } else {
                          bridge.positionLeftCenter(40)
                        }
                      } else if (isTauriEnv) {
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

        {/* Content - glass panel */}
        <div className="flex-1 min-h-0 overflow-hidden m-3">
          <div className="h-full w-full flex flex-col bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10">
            {/* Messages list - Liquid HUD style */}
            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/40 text-sm">Ask anything...</div>
              ) : (
                <div className="space-y-6">
                  {messages.map((m, i) => (
                    <div key={i} className="space-y-1">
                      {m.role === 'user' ? (
                        <div className="font-semibold text-white text-base leading-relaxed">
                          → {m.content}
                        </div>
                      ) : (
                        <div className="text-white/85 text-sm leading-relaxed pl-3 border-l border-white/10">
                          {m.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input bar pinned to bottom - minimal, OS-embedded */}
            <div className="px-4 py-3 border-t border-white/5" data-drag="block">
              <div className="flex items-center gap-2" data-drag="block">
                <button className="p-1.5 hover:bg-[#3a3a3a] rounded-md transition-colors text-[#ececec]" aria-label="Add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
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

                      // Use Swift bridge if available
                      const bridge = (window as any).swiftBridge
                      if (bridge) {
                        if (next === 'right') {
                          bridge.positionRightCenter(40)
                        } else {
                          bridge.positionLeftCenter(40)
                        }
                      } else if (isTauriEnv) {
                        if (next === 'right') {
                          await invoke('position_window_right_center', { margin: 40 })
                        } else {
                          await invoke('position_window_left_center', { margin: 40 })
                        }
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

  // Expanded full chat UI - Command Stream Mode
  return (
    // Outer wrapper purely for padding so shadows render inside the WebView bounds
    <div className="h-screen w-full p-8 bg-transparent flex flex-col">
      <div className="flex-1 flex flex-col obsidian-glass text-[#ececec] font-sans-stream overflow-hidden rounded-[24px] border border-white/10 relative">
        <div className="fixed top-0 left-0 right-0 h-6 z-50 w-full" data-tauri-drag-region style={{ WebkitAppRegion: 'drag' } as any} />

        {/* Close Button - Sleek X in top right */}
        <button
          onClick={() => {
            const bridge = (window as any).swiftBridge
            if (bridge?.close) {
              bridge.close()
            } else if (isTauriEnv) {
              invoke('close_window').catch(() => { })
            }
          }}
          className="absolute top-4 right-4 z-50 w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 transition-all duration-200 group"
          title="Close"
        >
          <svg
            className="w-3.5 h-3.5 text-white/40 group-hover:text-white/80 transition-colors"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Email insights panel - Glass card */}
        <AnimatePresence>
          {emailResult && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="shrink-0"
            >
              <div className="p-4 bg-black/20 border-b border-white/5 backdrop-blur-md">
                <div className="max-w-5xl mx-auto rounded-xl overflow-hidden bg-black/40 border border-white/10">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="text-sm font-medium text-emerald-400">Email Insights Active</div>
                    <button
                      onClick={() => setEmailResult(null)}
                      className="text-xs text-white/50 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="p-4 text-sm text-white/80">
                    {emailResult.query && <div className="mb-2 text-white font-mono-cmd text-xs">Query: {emailResult.query}</div>}
                    Found {emailResult.recentEmails?.length ?? 0} emails and {emailResult.suggestions?.length ?? 0} suggestions.
                    <button onClick={() => setShowEmailPanel(!showEmailPanel)} className="ml-2 underline text-emerald-400">
                      {showEmailPanel ? 'Hide Details' : 'Show Details'}
                    </button>
                    {showEmailPanel && (
                      <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
                        {emailResult.recentEmails?.map(e => (
                          <div key={e.id} className="p-2 bg-white/5 rounded border border-white/5">
                            <div className="font-semibold text-xs">{e.subject}</div>
                            <div className="text-xs text-white/50">{e.sender}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Stream Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-4">
              <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
                <span className="text-2xl">⌘</span>
              </div>
              <div className="font-mono-cmd text-2xl font-bold text-white tracking-tight">Sentex AI</div>
            </div>
          ) : (
            messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`group ${m.role === 'user' ? 'opacity-100' : 'opacity-95'}`}
              >
                {m.role === 'user' ? (
                  <div className="flex items-start gap-3 text-white font-mono-cmd text-sm tracking-wide">
                    <span className="text-emerald-500/80 mt-1">→</span>
                    <div className="font-bold leading-relaxed selection:bg-emerald-500/30">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="pl-6 text-white/85 font-sans-stream leading-relaxed text-[15px] selection:bg-indigo-500/30">
                    <StreamingText text={m.content} speed={25} createdAt={m.createdAt} />
                  </div>
                )}
              </motion.div>
            ))
          )}
          <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>

        {/* Input Well */}
        <div className="shrink-0 p-4">
          <div className="input-well backdrop-blur-xl transition-colors focus-within:bg-black/40 group">

            {/* Context Pills Row */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
              {/* Dynamic Context Pills */}
              {/* Side Panel Toggle Button */}
              <div
                className="context-pill flex items-center gap-1.5 cursor-pointer hover:bg-white/10"
                onClick={() => setWindowMode('sidepanel')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                <span>Side Panel</span>
              </div>


              <div className="context-pill flex items-center gap-1.5 hover:border-white/20 cursor-pointer" onClick={() => setShowDashboard(true)}>
                <span>project:</span>
                <span className="text-white/90 font-medium">{selectedProject}</span>
              </div>

              {/* Model Selector */}
              <div className="relative" ref={modelMenuRef}>
                <div
                  className="context-pill flex items-center gap-1.5 hover:border-white/20 cursor-pointer"
                  onClick={() => setShowModelMenu(!showModelMenu)}
                >
                  <span>model:</span>
                  <span className="text-white/90 font-medium">{AI_MODELS.find(m => m.id === selectedModel)?.name || selectedModel}</span>
                  <svg className={`w-3 h-3 text-white/50 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {/* Model Dropdown - Portal style to escape overflow:hidden */}
                {showModelMenu && ReactDOM.createPortal(
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0"
                      style={{ zIndex: 99998 }}
                      onClick={() => setShowModelMenu(false)}
                    />
                    {/* Menu */}
                    <div
                      className="fixed w-52 bg-[#1c1c1c] rounded-lg border border-white/10 shadow-2xl py-1"
                      style={{
                        zIndex: 99999,
                        bottom: 120,
                        left: 180
                      }}
                    >
                      <div className="px-3 py-1.5 text-[11px] text-white/40 uppercase tracking-wide border-b border-white/5 mb-1">Model</div>
                      {AI_MODELS.map((model) => (
                        <div
                          key={model.id}
                          className={`px-3 py-2 flex items-center justify-between cursor-pointer text-sm ${selectedModel === model.id
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                          onClick={() => {
                            setSelectedModel(model.id)
                            setShowModelMenu(false)
                          }}
                        >
                          <span>{model.name}</span>
                          {model.badge && (
                            <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300">{model.badge}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
              </div>

              {/* Auto-suggested context (mock) */}
              <AnimatePresence>
                {input.length > 5 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="context-pill border-emerald-500/30 text-emerald-200/70"
                  >
                    ✨ reasoning...
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Main Input Field */}
            <div className="flex items-end gap-3">
              <span className="text-white/30 text-lg py-1">›</span>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Enter command or query..."
                className="flex-1 bg-transparent border-none outline-none text-white font-mono-cmd text-sm resize-none placeholder-white/20 py-1.5 h-auto max-h-32 leading-relaxed"
                rows={1}
                style={{ fieldSizing: "content" } as any}
              />

              <div className="flex items-center gap-2 pb-1">
                {/* Upload Button */}
                <button
                  className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                  title="Upload file"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <button
                  onClick={voiceRecording ? stopVoice : startVoice}
                  className={`p-2 rounded-full transition-all ${voiceRecording ? 'bg-red-500/20 text-red-400 animate-pulse' : 'hover:bg-white/10 text-white/40 hover:text-white'}`}
                >
                  {voiceRecording ? (
                    <span className="block w-4 h-4 rounded-sm bg-current" />
                  ) : (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {notification && showNotification && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 p-4 rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl z-50">
            <div className="font-semibold text-sm mb-1">{notification.title}</div>
            <div className="text-xs text-white/70 mb-3">{notification.message}</div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNotification(false); setAutoMode(true); }}
                className="flex-1 py-1.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-100 text-xs border border-emerald-500/30 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => setShowNotification(false)}
                className="px-3 py-1.5 rounded hover:bg-white/10 text-xs text-white/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Overlay */}
        <AnimatePresence>
          {showDashboard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
              onClick={() => setShowDashboard(false)}
            >
              <div
                className="w-full max-w-4xl h-[80vh] bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                  <h2 className="text-xl font-mono-cmd font-bold">Project Command Center</h2>
                  <button onClick={() => setShowDashboard(false)} className="text-white/40 hover:text-white">✕</button>
                </div>
                <div className="flex-1 p-6 flex gap-6 overflow-hidden">
                  {/* Sidebar */}
                  <div className="w-64 shrink-0 flex flex-col gap-6 overflow-y-auto pr-2">
                    <div>
                      <h3 className="text-xs uppercase tracking-widest text-white/30 mb-4">Active Projects</h3>
                      <div className="space-y-2">
                        {projects.map(p => (
                          <div
                            key={p.name}
                            onClick={() => { setSelectedProject(p.name); setDashboardSelectedProject(p.name); }}
                            className={`p-3 rounded border border-white/5 cursor-pointer transition-colors ${selectedProject === p.name ? 'bg-white/10 border-white/20' : 'hover:bg-white/5'}`}
                          >
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-[10px] text-white/40 mt-1">Last active: {new Date(p.updatedAt).toLocaleDateString()}</div>
                          </div>
                        ))}
                        <button
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-[#ececec] flex items-center gap-2 text-xs"
                          onClick={() => {
                            const nextName = `New Project ${projects.length + 1}`
                            const now = new Date().toISOString()
                            setProjects(prev => [...prev, { name: nextName, createdAt: now, updatedAt: now }])
                            setSelectedProject(nextName)
                            setDashboardSelectedProject(nextName) // Fix: also highlight in dashboard
                          }}
                        >
                          + New Project
                        </button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs uppercase tracking-widest text-white/30 mb-4">Team</h3>
                      {/* Simplified Team List for Sidebar */}
                      <div className="space-y-2">
                        {[...teamSharedSubagents].map((a, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded hover:bg-white/5">
                            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradient(a.name)} flex items-center justify-center text-[10px] font-bold`}>
                              {avatarInitial(a.name)}
                            </div>
                            <div className="text-xs text-white/70">{a.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Main Content Area - Robust UI */}
                  <div className="flex-1 overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-6">{selectedProject || 'Dashboard'}</h2>

                    {/* Project Contexts & Subagents */}
                    <div className="space-y-6">
                      {/* Your Context Section */}
                      <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold flex items-center gap-2">
                            <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">📚</span>
                            Project Context
                          </div>
                          <button
                            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                            onClick={() => {
                              const projectName = selectedProject
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
                          {(projectEntries[selectedProject]?.contexts ?? defaultContexts).map((item, idx) => (
                            <div key={`${item.name}-${idx}`} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center justify-between border border-white/5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{item.name}</div>
                                  <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Your Subagents Section */}
                      <section className="bg-white/5 rounded-xl border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold flex items-center gap-2">
                            <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-white/10">🤝</span>
                            Project Subagents
                          </div>
                          <button
                            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                            onClick={() => {
                              const projectName = selectedProject
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
                          {(projectEntries[selectedProject]?.subagents ?? defaultSubagents).map((item, idx) => (
                            <div key={`${item.name}-${idx}`} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-[#e5e5e5] flex items-center justify-between border border-white/5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(item.owner)} text-black/80 flex items-center justify-center text-xs font-semibold`}>
                                  {avatarInitial(item.owner)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{item.name}</div>
                                  <div className="text-xs text-[#bdbdbd] truncate">by {item.owner}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
