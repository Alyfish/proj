import AppKit
import WebKit

/// Custom WKWebView that allows window dragging from the background
class DraggableWebView: WKWebView {
    
    // Track if we're in a drag operation
    private var isDragging = false
    private var initialMouseLocation: NSPoint?
    
    override func mouseDown(with event: NSEvent) {
        // Check if click is on a draggable region or transparent area
        let location = event.locationInWindow
        
        // Store initial location for potential drag
        initialMouseLocation = location
        isDragging = false
        
        // Let the WebView handle the event normally first
        super.mouseDown(with: event)
    }
    
    override func mouseDragged(with event: NSEvent) {
        // If we're dragging, move the window
        guard let window = self.window,
              let initialLocation = initialMouseLocation else {
            super.mouseDragged(with: event)
            return
        }
        
        // Start dragging after first movement
        if !isDragging {
            isDragging = true
        }
        
        let currentLocation = event.locationInWindow
        let newOrigin = NSPoint(
            x: window.frame.origin.x + (currentLocation.x - initialLocation.x),
            y: window.frame.origin.y + (currentLocation.y - initialLocation.y)
        )
        window.setFrameOrigin(newOrigin)
    }
    
    override func mouseUp(with event: NSEvent) {
        initialMouseLocation = nil
        isDragging = false
        super.mouseUp(with: event)
    }
    
    // Allow window to accept clicks even when not focused
    override var acceptsFirstResponder: Bool { true }
    
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }
}
