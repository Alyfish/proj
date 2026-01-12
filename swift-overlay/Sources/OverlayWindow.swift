import AppKit

/// Custom NSWindow subclass configured for overlay behavior.
/// This window appears on all desktops, stays on top, and is transparent.
class OverlayWindow: NSWindow {
    
    private var initialLocation: NSPoint?
    
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        
        configureWindow()
    }
    
    private func configureWindow() {
        // 1. Transparent background
        isOpaque = false
        backgroundColor = NSColor.clear
        
        // 2. High window level - StatusBar ensures it's above most windows
        level = .statusBar
        
        // 3. Collection behavior for overlay
        //    - canJoinAllSpaces: Visible on ALL desktops
        //    - fullScreenAuxiliary: Appears over fullscreen apps
        //    - ignoresCycle: Not in Cmd+Tab
        //    - stationary: Doesn't move with space switches
        collectionBehavior = [
            .canJoinAllSpaces,
            .fullScreenAuxiliary,
            .ignoresCycle,
            .stationary
        ]
        
        // 4. Movable by clicking anywhere on background
        isMovableByWindowBackground = true
        
        // 5. No title bar
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        
        // 6. Detection-free mode (hidden from screen recordings)
        sharingType = .none
        
        // 7. Accept mouse events even when app is not active
        acceptsMouseMovedEvents = true
        
        // 8. Center on screen initially
        center()
        
        print("🎯 OverlayWindow configured: level=\(level.rawValue), canJoinAllSpaces, sharingType=none")
    }
    
    // Override to accept first responder even when not active
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
    
    // MARK: - Mouse Drag Support
    
    override func mouseDown(with event: NSEvent) {
        // Store initial mouse location for drag
        initialLocation = event.locationInWindow
    }
    
    override func mouseDragged(with event: NSEvent) {
        guard let initialLocation = initialLocation else { return }
        
        let currentLocation = event.locationInWindow
        let newOrigin = NSPoint(
            x: frame.origin.x + (currentLocation.x - initialLocation.x),
            y: frame.origin.y + (currentLocation.y - initialLocation.y)
        )
        setFrameOrigin(newOrigin)
    }
    
    override func mouseUp(with event: NSEvent) {
        initialLocation = nil
    }
    
    /// Bring window to front and make it key
    func bringToFront() {
        // Order window to front regardless of activation state
        orderFrontRegardless()
        
        // Make it the key window (accepts keyboard input)
        makeKey()
        
        // Activate the app to ensure window comes to foreground
        NSApp.activate(ignoringOtherApps: true)
        
        print("✅ Window brought to front on current space")
    }
}
