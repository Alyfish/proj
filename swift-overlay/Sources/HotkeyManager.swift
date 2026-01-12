import AppKit
import Carbon.HIToolbox

/// Manages global keyboard shortcuts using Carbon Event Tap.
/// This allows Cmd+1 to be captured even when the app is not focused.
class HotkeyManager {
    
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private let callback: () -> Void
    
    init(callback: @escaping () -> Void) {
        self.callback = callback
    }
    
    deinit {
        teardown()
    }
    
    /// Set up the global event tap for keyboard monitoring
    func setup() {
        // Request accessibility permissions if needed
        requestAccessibilityPermissions()
        
        // Create event mask for key down events
        let eventMask = (1 << CGEventType.keyDown.rawValue)
        
        // Create the event tap
        // Note: We need to pass `self` through an unmanaged pointer
        let unmanagedSelf = Unmanaged.passUnretained(self)
        
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
                guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
                
                let manager = Unmanaged<HotkeyManager>.fromOpaque(refcon).takeUnretainedValue()
                return manager.handleEvent(proxy: proxy, type: type, event: event)
            },
            userInfo: unmanagedSelf.toOpaque()
        ) else {
            print("❌ Failed to create event tap. Check accessibility permissions.")
            return
        }
        
        eventTap = tap
        
        // Add to run loop
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
        
        // Enable the tap
        CGEvent.tapEnable(tap: tap, enable: true)
        
        print("✅ Global hotkey handler registered (Cmd+1)")
    }
    
    private func teardown() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
    }
    
    /// Handle keyboard events
    private func handleEvent(
        proxy: CGEventTapProxy,
        type: CGEventType,
        event: CGEvent
    ) -> Unmanaged<CGEvent>? {
        
        // Check if it's a key down event
        guard type == .keyDown else {
            return Unmanaged.passUnretained(event)
        }
        
        // Get the key code and modifier flags
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        
        // Check for Cmd+1 (keyCode 18 = "1", command flag set)
        let isCmd = flags.contains(.maskCommand)
        let isNoOtherModifiers = !flags.contains(.maskShift) && 
                                   !flags.contains(.maskControl) && 
                                   !flags.contains(.maskAlternate)
        
        if keyCode == 18 && isCmd && isNoOtherModifiers {
            print("🎹 Cmd+1 detected! Triggering toggle...")
            
            // Call the callback on main thread
            DispatchQueue.main.async { [weak self] in
                self?.callback()
            }
            
            // Consume the event (don't pass to other apps)
            return nil
        }
        
        return Unmanaged.passUnretained(event)
    }
    
    /// Request accessibility permissions which are required for global event taps
    private func requestAccessibilityPermissions() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        let trusted = AXIsProcessTrustedWithOptions(options)
        
        if trusted {
            print("✅ Accessibility permissions granted")
        } else {
            print("⚠️ Accessibility permissions required. Opening System Preferences...")
        }
    }
}
