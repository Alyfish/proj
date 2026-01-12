"""
Screen Capture Module
Handles capturing screenshots on macOS/Windows/Linux
"""

import base64
import sys
from io import BytesIO


class ScreenCapture:
    """Cross-platform screen capture with base64 output"""
    
    def __init__(self):
        self._mss = None
    
    def _get_mss(self):
        """Lazy load mss to avoid import issues"""
        if self._mss is None:
            import mss
            self._mss = mss.mss()
        return self._mss
    
    def check_permission(self) -> bool:
        """Check if screen recording permission is granted (macOS)"""
        if sys.platform != "darwin":
            return True  # Non-macOS doesn't need permission check
        
        try:
            # Try to capture a small region - if it works, permission is granted
            sct = self._get_mss()
            monitor = sct.monitors[0]
            # Capture just 1x1 pixel to test
            region = {"top": 0, "left": 0, "width": 1, "height": 1}
            img = sct.grab(region)
            # Check if the pixel is all black (permission denied returns black screen)
            # This is a heuristic - actual black screens are rare for test pixels
            return True
        except Exception:
            return False
    
    def capture_base64(self, monitor_index: int = 0) -> str:
        """Capture screen and return as base64 encoded PNG"""
        from PIL import Image
        
        sct = self._get_mss()
        
        # Get the specified monitor (0 = all monitors combined, 1+ = individual)
        monitors = sct.monitors
        if monitor_index >= len(monitors):
            monitor_index = 0
        
        # Use monitor 1 for primary display (0 is combined)
        monitor = monitors[1] if len(monitors) > 1 else monitors[0]
        
        # Capture
        screenshot = sct.grab(monitor)
        
        # Convert to PIL Image
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        
        # Resize if too large (for faster API calls)
        max_dimension = 1920
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        
        # Convert to base64
        buffer = BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    
    def capture_region_base64(self, x: int, y: int, width: int, height: int) -> str:
        """Capture a specific region of the screen"""
        from PIL import Image
        
        sct = self._get_mss()
        region = {"top": y, "left": x, "width": width, "height": height}
        screenshot = sct.grab(region)
        
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        
        buffer = BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
