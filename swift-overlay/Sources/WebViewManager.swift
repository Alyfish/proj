import AppKit
import WebKit

protocol WebViewManagerDelegate: AnyObject {
    func webViewDidFinishLoading()
    func webViewRequestedResize(width: CGFloat, height: CGFloat)
    func webViewRequestedPosition(x: CGFloat, y: CGFloat)
    func webViewRequestedCenter()
    func webViewRequestedFocus()
    func webViewRequestedPositionTopCenter()
    func webViewRequestedPositionRightCenter(margin: CGFloat)
    func webViewRequestedPositionLeftCenter(margin: CGFloat)
    func webViewRequestedSavePosition(mode: String, x: CGFloat, y: CGFloat)
    func webViewRequestedGetPosition(mode: String, completion: @escaping ([CGFloat]?) -> Void)
    func webViewRequestedHasPosition(mode: String, completion: @escaping (Bool) -> Void)
    func webViewRequestedClearPosition(mode: String)
    func webViewRequestedShow()
    func webViewRequestedGetOuterPosition(completion: @escaping (CGFloat, CGFloat) -> Void)
}

/// Manages the WKWebView that hosts the React application.
/// Provides a JavaScript bridge for communication between Swift and React.
class WebViewManager: NSObject {
    
    let webView: WKWebView
    weak var delegate: WebViewManagerDelegate?
    
    init(frame: NSRect) {
        // Configure WebView
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        
        // Set up user content controller for JS->Swift communication
        let contentController = WKUserContentController()
        config.userContentController = contentController
        
        // Create DraggableWebView with transparent background (allows window dragging)
        webView = DraggableWebView(frame: frame, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]
        
        super.init()
        
        // Register message handlers for JS bridge
        contentController.add(self, name: "resize")
        contentController.add(self, name: "setPosition")
        contentController.add(self, name: "log")
        contentController.add(self, name: "close")
        contentController.add(self, name: "center")
        contentController.add(self, name: "focus")
        contentController.add(self, name: "positionTopCenter")
        contentController.add(self, name: "positionRightCenter")
        contentController.add(self, name: "positionLeftCenter")
        contentController.add(self, name: "savePosition")
        contentController.add(self, name: "getPosition")
        contentController.add(self, name: "hasPosition")
        contentController.add(self, name: "clearPosition")
        contentController.add(self, name: "show")
        contentController.add(self, name: "getOuterPosition")
        
        // Set navigation delegate
        webView.navigationDelegate = self
        
        // Inject the Swift bridge JavaScript
        injectBridgeScript()
    }
    
    /// Load a URL in the WebView
    func loadURL(_ urlString: String) {
        guard let url = URL(string: urlString) else {
            print("❌ Invalid URL: \(urlString)")
            return
        }
        
        print("🌐 Loading React app from: \(urlString)")
        webView.load(URLRequest(url: url))
    }
    
    /// Send toggle event to React app
    func sendToggleEvent() {
        let js = """
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('swift-toggle-collapse'));
        }
        """
        webView.evaluateJavaScript(js) { _, error in
            if let error = error {
                print("⚠️ Error sending toggle event: \(error)")
            } else {
                print("📤 Toggle event sent to React")
            }
        }
    }
    
    /// Inject the JavaScript bridge that allows React to call Swift functions
    private func injectBridgeScript() {
        let bridgeScript = """
        // Swift Bridge for React app - Tauri API compatibility layer
        window.swiftBridge = {
            // Request window resize
            setSize: function(width, height) {
                window.webkit.messageHandlers.resize.postMessage({ width: width, height: height });
            },
            
            // Request window position
            setPosition: function(x, y) {
                window.webkit.messageHandlers.setPosition.postMessage({ x: x, y: y });
            },
            
            // Log to Swift console
            log: function(message) {
                window.webkit.messageHandlers.log.postMessage(message);
            },
            
            // Close the application
            close: function() {
                window.webkit.messageHandlers.close.postMessage(null);
            },
            
            // Center window on screen
            center: function() {
                window.webkit.messageHandlers.center.postMessage(null);
            },
            
            // Focus the window
            focus: function() {
                window.webkit.messageHandlers.focus.postMessage(null);
            },
            
            // Position window at top center
            positionTopCenter: function() {
                window.webkit.messageHandlers.positionTopCenter.postMessage(null);
            },
            
            // Position window at right center with margin
            positionRightCenter: function(margin) {
                window.webkit.messageHandlers.positionRightCenter.postMessage({ margin: margin || 40 });
            },
            
            // Position window at left center with margin
            positionLeftCenter: function(margin) {
                window.webkit.messageHandlers.positionLeftCenter.postMessage({ margin: margin || 40 });
            },
            
            // Save custom position
            savePosition: function(mode, x, y) {
                window.webkit.messageHandlers.savePosition.postMessage({ mode: mode, x: x, y: y });
            },
            
            // Get custom position (async - returns via callback)
            getPosition: function(mode) {
                return new Promise(function(resolve) {
                    window._swiftPositionCallback = resolve;
                    window.webkit.messageHandlers.getPosition.postMessage({ mode: mode });
                });
            },
            
            // Check if custom position exists
            hasPosition: function(mode) {
                return new Promise(function(resolve) {
                    window._swiftHasPositionCallback = resolve;
                    window.webkit.messageHandlers.hasPosition.postMessage({ mode: mode });
                });
            },
            
            // Clear custom position
            clearPosition: function(mode) {
                window.webkit.messageHandlers.clearPosition.postMessage({ mode: mode });
            },
            
            // Show window
            show: function() {
                window.webkit.messageHandlers.show.postMessage(null);
            },
            
            // Set always on top (no-op, always on top)
            setAlwaysOnTop: function(value) {
                // No-op - Swift window is always on top
            },
            
            // Get outer position
            getOuterPosition: function() {
                return new Promise(function(resolve) {
                    window._swiftOuterPositionCallback = resolve;
                    window.webkit.messageHandlers.getOuterPosition.postMessage(null);
                });
            }
        };
        
        // Listen for toggle events from Swift
        window.addEventListener('swift-toggle-collapse', function() {
            // Dispatch custom event that React can listen to
            const event = new CustomEvent('toggle-collapse');
            window.dispatchEvent(event);
            console.log('[SwiftBridge] Toggle event dispatched');
        });
        
        console.log('[SwiftBridge] Bridge initialized with full Tauri compatibility');
        """
        
        let script = WKUserScript(
            source: bridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(script)
    }
}

// MARK: - WKNavigationDelegate
extension WebViewManager: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        delegate?.webViewDidFinishLoading()
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("❌ WebView navigation failed: \(error)")
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("❌ WebView failed to load: \(error)")
        print("💡 Make sure the React dev server is running: npm run dev")
    }
}

// MARK: - WKScriptMessageHandler (JS -> Swift)
extension WebViewManager: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "resize":
            if let body = message.body as? [String: CGFloat],
               let width = body["width"],
               let height = body["height"] {
                delegate?.webViewRequestedResize(width: width, height: height)
            }
            
        case "setPosition":
            if let body = message.body as? [String: CGFloat],
               let x = body["x"],
               let y = body["y"] {
                delegate?.webViewRequestedPosition(x: x, y: y)
            }
            
        case "log":
            if let logMessage = message.body as? String {
                print("[React] \(logMessage)")
            }
            
        case "close":
            print("🚪 Close requested from React, terminating app...")
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
            
        case "center":
            delegate?.webViewRequestedCenter()
            
        case "focus":
            delegate?.webViewRequestedFocus()
            
        case "positionTopCenter":
            delegate?.webViewRequestedPositionTopCenter()
            
        case "positionRightCenter":
            let margin = (message.body as? [String: CGFloat])?["margin"] ?? 40
            delegate?.webViewRequestedPositionRightCenter(margin: margin)
            
        case "positionLeftCenter":
            let margin = (message.body as? [String: CGFloat])?["margin"] ?? 40
            delegate?.webViewRequestedPositionLeftCenter(margin: margin)
            
        case "savePosition":
            if let body = message.body as? [String: Any],
               let mode = body["mode"] as? String,
               let x = body["x"] as? CGFloat,
               let y = body["y"] as? CGFloat {
                delegate?.webViewRequestedSavePosition(mode: mode, x: x, y: y)
            }
            
        case "getPosition":
            if let body = message.body as? [String: String],
               let mode = body["mode"] {
                delegate?.webViewRequestedGetPosition(mode: mode) { [weak self] position in
                    let js: String
                    if let pos = position {
                        js = "if (window._swiftPositionCallback) { window._swiftPositionCallback([\(pos[0]), \(pos[1])]); }"
                    } else {
                        js = "if (window._swiftPositionCallback) { window._swiftPositionCallback(null); }"
                    }
                    self?.webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
            
        case "hasPosition":
            if let body = message.body as? [String: String],
               let mode = body["mode"] {
                delegate?.webViewRequestedHasPosition(mode: mode) { [weak self] exists in
                    let js = "if (window._swiftHasPositionCallback) { window._swiftHasPositionCallback(\(exists)); }"
                    self?.webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
            
        case "clearPosition":
            if let body = message.body as? [String: String],
               let mode = body["mode"] {
                delegate?.webViewRequestedClearPosition(mode: mode)
            }
            
        case "show":
            delegate?.webViewRequestedShow()
            
        case "getOuterPosition":
            delegate?.webViewRequestedGetOuterPosition { [weak self] x, y in
                let js = "if (window._swiftOuterPositionCallback) { window._swiftOuterPositionCallback({ x: \(x), y: \(y) }); }"
                self?.webView.evaluateJavaScript(js, completionHandler: nil)
            }
            
        default:
            print("⚠️ Unknown message: \(message.name)")
        }
    }
}
