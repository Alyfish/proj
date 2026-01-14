import AppKit

/// Main entry point for the Sidebar Overlay application.
/// This is a native Swift wrapper that embeds the React UI via WKWebView
/// while providing proper macOS overlay window behavior.

@main
struct SidebarOverlayApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        
        // Set activation policy to Accessory (no dock icon, no menu bar when inactive)
        app.setActivationPolicy(.accessory)
        
        app.run()
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: OverlayWindowController?
    private var hotkeyManager: HotkeyManager?
    private var statusItem: NSStatusItem?
    private var investmentStore: InvestmentStore?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        print("🚀 Sidebar Overlay starting...")
        
        // Create the overlay window controller
        windowController = OverlayWindowController()
        
        // Initialize Investment Store and connect to Python backend
        investmentStore = InvestmentStore()
        investmentStore?.connect()
        
        // Set up global hotkey handler
        hotkeyManager = HotkeyManager { [weak self] in
            self?.toggleOverlay()
        }
        hotkeyManager?.setup()
        
        // Create a status bar item for easy access
        setupStatusBarItem()
        
        // Show the overlay window
        windowController?.showWindow(nil)
        
        print("✅ Sidebar Overlay ready! Press Cmd+1 to toggle.")
    }
    
    private func setupStatusBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        
        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "sidebar.right", accessibilityDescription: "Sidebar")
        }
        
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Toggle Overlay (Cmd+1)", action: #selector(toggleOverlay), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        
        statusItem?.menu = menu
    }
    
    @objc private func toggleOverlay() {
        windowController?.toggle()
    }
    
    @objc private func quit() {
        NSApplication.shared.terminate(nil)
    }
}
