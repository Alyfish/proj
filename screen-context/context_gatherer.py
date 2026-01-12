"""
Context Gatherer Module
Captures selected text, browser URLs, and active application info on macOS
"""

import subprocess
import sys
from typing import Optional


class ContextGatherer:
    """Gathers contextual information from the system"""
    
    def check_accessibility_permission(self) -> bool:
        """Check if accessibility permission is granted (macOS)"""
        if sys.platform != "darwin":
            return True
        
        try:
            # Try to run a simple AppleScript that requires accessibility
            result = subprocess.run(
                ["osascript", "-e", 'tell application "System Events" to return name of first process'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False
    
    def get_selected_text(self) -> Optional[str]:
        """Get currently selected text via clipboard simulation"""
        if sys.platform != "darwin":
            return None
        
        try:
            # Save current clipboard
            save_result = subprocess.run(
                ["pbpaste"],
                capture_output=True,
                timeout=2
            )
            original_clipboard = save_result.stdout
            
            # Simulate Cmd+C to copy selection
            script = '''
            tell application "System Events"
                keystroke "c" using command down
            end tell
            delay 0.1
            '''
            subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                timeout=3
            )
            
            # Get the copied text
            result = subprocess.run(
                ["pbpaste"],
                capture_output=True,
                timeout=2
            )
            selected_text = result.stdout.decode("utf-8", errors="ignore").strip()
            
            # Restore original clipboard
            if original_clipboard:
                restore_process = subprocess.Popen(
                    ["pbcopy"],
                    stdin=subprocess.PIPE
                )
                restore_process.communicate(input=original_clipboard)
            
            # Only return if we got new text (not the original clipboard)
            if selected_text and selected_text != original_clipboard.decode("utf-8", errors="ignore").strip():
                return selected_text
            
            return None
        except Exception as e:
            print(f"Error getting selected text: {e}")
            return None
    
    def get_browser_url(self) -> Optional[str]:
        """Get URL from active browser (Chrome or Safari)"""
        if sys.platform != "darwin":
            return None
        
        # Try Chrome first
        url = self._get_chrome_url()
        if url:
            return url
        
        # Fall back to Safari
        return self._get_safari_url()
    
    def _get_chrome_url(self) -> Optional[str]:
        """Get URL from Google Chrome"""
        try:
            script = 'tell application "Google Chrome" to get URL of active tab of front window'
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                timeout=3
            )
            if result.returncode == 0:
                url = result.stdout.decode("utf-8", errors="ignore").strip()
                if url and url.startswith("http"):
                    return url
        except Exception:
            pass
        return None
    
    def _get_safari_url(self) -> Optional[str]:
        """Get URL from Safari"""
        try:
            script = 'tell application "Safari" to return URL of front document'
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                timeout=3
            )
            if result.returncode == 0:
                url = result.stdout.decode("utf-8", errors="ignore").strip()
                if url and url.startswith("http"):
                    return url
        except Exception:
            pass
        return None
    
    def get_active_app(self) -> Optional[str]:
        """Get the name of the currently active application"""
        if sys.platform != "darwin":
            return None
        
        try:
            script = '''
            tell application "System Events"
                set frontApp to name of first application process whose frontmost is true
                return frontApp
            end tell
            '''
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                timeout=3
            )
            if result.returncode == 0:
                return result.stdout.decode("utf-8", errors="ignore").strip()
        except Exception:
            pass
        return None
    
    def get_active_window_title(self) -> Optional[str]:
        """Get the title of the active window"""
        if sys.platform != "darwin":
            return None
        
        try:
            script = '''
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                tell frontApp
                    if (count of windows) > 0 then
                        return name of front window
                    end if
                end tell
            end tell
            return ""
            '''
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                timeout=3
            )
            if result.returncode == 0:
                title = result.stdout.decode("utf-8", errors="ignore").strip()
                if title:
                    return title
        except Exception:
            pass
        return None
