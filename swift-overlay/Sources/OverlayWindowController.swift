import AppKit
import WebKit
import SwiftUI

/// Controls the overlay window and manages its WebView content.
class OverlayWindowController: NSWindowController {
    
    private var webViewManager: WebViewManager!
    private var pillHostingView: NSHostingView<PillView>!
    private var containerView: NSView!
    private var isExpanded = true
    
    // Position storage key prefix
    private let positionKeyPrefix = "windowPosition_"
    
    // Native dimensions
    // Aggressive size to absolutely prevent clipping
    private let pillSize = NSSize(width: 320, height: 200)
    private let expandedSize = NSSize(width: 900, height: 600) // Default expanded
    
    init() {
        let overlayWindow = OverlayWindow()
        super.init(window: overlayWindow)
        
        setupViews()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupViews() {
        guard let window = window else { return }
        
        // 1. Create Container View
        containerView = NSView(frame: window.contentView!.bounds)
        containerView.autoresizingMask = [.width, .height]
        containerView.wantsLayer = true
        containerView.layer?.masksToBounds = false // Vital for shadows
        window.contentView = containerView
        
        // 2. Setup WebView (React Content)
        webViewManager = WebViewManager(frame: containerView.bounds)
        webViewManager.delegate = self
        
        let webView = webViewManager.webView
        webView.setValue(false, forKey: "drawsBackground")
        webView.wantsLayer = true
        webView.layer?.backgroundColor = NSColor.clear.cgColor
        webView.autoresizingMask = [NSView.AutoresizingMask.width, NSView.AutoresizingMask.height]
        webView.layer?.masksToBounds = false
        
        // 3. Setup PillView (Native SwiftUI)
        let pillView = PillView(onExpand: { [weak self] in
            // When pill is clicked, toggle to expanded
            self?.toggle()
        })
        
        pillHostingView = NSHostingView(rootView: pillView)
        // Use intrinsic content size instead of filling container
        pillHostingView.setFrameSize(pillHostingView.intrinsicContentSize)
        // Center the hosting view within the container
        pillHostingView.translatesAutoresizingMaskIntoConstraints = true
        pillHostingView.autoresizingMask = [.minXMargin, .maxXMargin, .minYMargin, .maxYMargin]  // Stay centered
        // Initially center within container
        let pillBounds = pillHostingView.bounds
        pillHostingView.frame.origin = NSPoint(
            x: (containerView.bounds.width - pillBounds.width) / 2,
            y: (containerView.bounds.height - pillBounds.height) / 2
        )
        // Transparent hosting view
        pillHostingView.layer?.backgroundColor = NSColor.clear.cgColor
        pillHostingView.wantsLayer = true
        pillHostingView.layer?.masksToBounds = false // Ensure shadows flow outside
        
        // 4. Add Subviews
        containerView.addSubview(webView)
        containerView.addSubview(pillHostingView)
        
        // Initial State: Expanded
        pillHostingView.isHidden = true
        webView.isHidden = false
        
        // Load React App
        webViewManager.loadURL("http://localhost:5173")
        
        print("✨ Native Hybrid Overlay Initialized")
    }
    
    /// Toggle between expanded and collapsed states
    func toggle() {
        guard let window = window as? OverlayWindow else { return }
        
        isExpanded.toggle()
        
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            // Expo-like curve: cubic-bezier(0.16, 1, 0.3, 1)
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
            
            if isExpanded {
                // Sizing: Expand
                // Note: We should restore to previous expanded size/position if tracked
                // For now, using default or WebView's last request
                let targetFrame = NSRect(
                    x: window.frame.midX - expandedSize.width/2,
                    y: window.frame.midY - expandedSize.height/2,
                    width: expandedSize.width,
                    height: expandedSize.height
                )
                window.animator().setFrame(targetFrame, display: true)
                
                // View Swap
                pillHostingView.animator().isHidden = true
                webViewManager.webView.animator().isHidden = false
                
                // Notify React we are expanded (so it renders main UI)
                webViewManager.sendToggleEvent() // Optionally keep this for React state
                
            } else {
                // Sizing: Collapse to Pill
                let targetFrame = NSRect(
                    x: window.frame.midX - pillSize.width/2,
                    y: window.frame.midY - pillSize.height/2,
                    width: pillSize.width,
                    height: pillSize.height
                )
                window.animator().setFrame(targetFrame, display: true)
                
                // View Swap
                webViewManager.webView.animator().isHidden = true
                pillHostingView.animator().isHidden = false
                
                // Notify React (pauses logic if needed)
                webViewManager.sendToggleEvent()
            }
        }
        
        window.makeKeyAndOrderFront(nil)
        print("🔄 Mode: \(isExpanded ? "Expanded" : "Collapsed (Native Pill)")")
    }
    
    /// Show window and bring to front
    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        (window as? OverlayWindow)?.bringToFront()
    }
}

// MARK: - WebViewManagerDelegate
extension OverlayWindowController: WebViewManagerDelegate {
    func webViewDidFinishLoading() {
        print("✅ React app loaded successfully")
    }
    
    func webViewRequestedResize(width: CGFloat, height: CGFloat) {
        guard let window = window else { return }
        
        let currentFrame = window.frame
        let newSize = NSSize(width: width, height: height)
        
        // Keep window centered on current position when resizing
        let newOrigin = NSPoint(
            x: currentFrame.origin.x + (currentFrame.width - newSize.width) / 2,
            y: currentFrame.origin.y + (currentFrame.height - newSize.height) / 2
        )
        
        // Fast, snappy animation like Tauri
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.12  // Fast like Tauri
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            context.allowsImplicitAnimation = true
            window.animator().setFrame(NSRect(origin: newOrigin, size: newSize), display: true)
        }
    }
    
    func webViewRequestedPosition(x: CGFloat, y: CGFloat) {
        guard let window = window else { return }
        // Note: macOS uses bottom-left origin, but we handle this in the positioning
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }
    
    func webViewRequestedCenter() {
        guard let window = window else { return }
        window.center()
        print("📍 Window centered")
    }
    
    func webViewRequestedFocus() {
        guard let window = window as? OverlayWindow else { return }
        window.bringToFront()
    }
    
    func webViewRequestedPositionTopCenter() {
        guard let window = window,
              let screen = window.screen ?? NSScreen.main else { return }
        
        let screenFrame = screen.visibleFrame
        let windowSize = window.frame.size
        let margin: CGFloat = 50
        
        let x = screenFrame.origin.x + (screenFrame.width - windowSize.width) / 2
        let y = screenFrame.origin.y + screenFrame.height - windowSize.height - margin
        
        window.setFrameOrigin(NSPoint(x: x, y: y))
        print("📍 Window positioned at top center")
    }
    
    func webViewRequestedPositionRightCenter(margin: CGFloat) {
        guard let window = window,
              let screen = window.screen ?? NSScreen.main else { return }
        
        let screenFrame = screen.visibleFrame
        let windowSize = window.frame.size
        
        let x = screenFrame.origin.x + screenFrame.width - windowSize.width - margin
        let y = screenFrame.origin.y + (screenFrame.height - windowSize.height) / 2
        
        window.setFrameOrigin(NSPoint(x: x, y: y))
        print("📍 Window positioned at right center with margin \(margin)")
    }
    
    func webViewRequestedPositionLeftCenter(margin: CGFloat) {
        guard let window = window,
              let screen = window.screen ?? NSScreen.main else { return }
        
        let screenFrame = screen.visibleFrame
        let windowSize = window.frame.size
        
        let x = screenFrame.origin.x + margin
        let y = screenFrame.origin.y + (screenFrame.height - windowSize.height) / 2
        
        window.setFrameOrigin(NSPoint(x: x, y: y))
        print("📍 Window positioned at left center with margin \(margin)")
    }
    
    func webViewRequestedSavePosition(mode: String, x: CGFloat, y: CGFloat) {
        let key = positionKeyPrefix + mode
        let position = ["x": x, "y": y]
        UserDefaults.standard.set(position, forKey: key)
        print("💾 Saved position for \(mode): (\(x), \(y))")
    }
    
    func webViewRequestedGetPosition(mode: String, completion: @escaping ([CGFloat]?) -> Void) {
        let key = positionKeyPrefix + mode
        if let position = UserDefaults.standard.dictionary(forKey: key),
           let x = position["x"] as? CGFloat,
           let y = position["y"] as? CGFloat {
            print("📂 Retrieved position for \(mode): (\(x), \(y))")
            completion([x, y])
        } else {
            print("📂 No saved position for \(mode)")
            completion(nil)
        }
    }
    
    func webViewRequestedHasPosition(mode: String, completion: @escaping (Bool) -> Void) {
        let key = positionKeyPrefix + mode
        let exists = UserDefaults.standard.dictionary(forKey: key) != nil
        completion(exists)
    }
    
    func webViewRequestedClearPosition(mode: String) {
        let key = positionKeyPrefix + mode
        UserDefaults.standard.removeObject(forKey: key)
        print("🗑️ Cleared position for \(mode)")
    }
    
    func webViewRequestedShow() {
        guard let window = window else { return }
        window.orderFrontRegardless()
    }
    
    func webViewRequestedGetOuterPosition(completion: @escaping (CGFloat, CGFloat) -> Void) {
        guard let window = window else {
            completion(0, 0)
            return
        }
        let origin = window.frame.origin
        completion(origin.x, origin.y)
    }
}
