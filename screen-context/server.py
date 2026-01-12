"""
Screen Context Service - Main Server
FastAPI server that provides screen capture, OCR, and context gathering.
"""

import os
import base64
import subprocess
from io import BytesIO
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment from parent directory
load_dotenv()
load_dotenv("../.env")

from screen_capture import ScreenCapture
from context_gatherer import ContextGatherer
from ai_analyzer import AIAnalyzer

app = FastAPI(
    title="Screen Context Service",
    description="Captures screen context for AI-assisted understanding",
    version="1.0.0"
)

# CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:1420", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
screen_capture = ScreenCapture()
context_gatherer = ContextGatherer()
ai_analyzer = AIAnalyzer()


class CaptureResponse(BaseModel):
    success: bool
    screenshot: Optional[str] = None  # Base64 encoded
    selected_text: Optional[str] = None
    browser_url: Optional[str] = None
    active_app: Optional[str] = None
    captured_at: str
    error: Optional[str] = None


class AnalyzeRequest(BaseModel):
    query: str
    include_screenshot: bool = True
    include_selected_text: bool = True
    include_browser_url: bool = True


class AnalyzeResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    context_used: dict = {}
    error: Optional[str] = None


class PermissionsResponse(BaseModel):
    screen_recording: bool
    accessibility: bool
    message: str


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "screen-context", "timestamp": datetime.now().isoformat()}


@app.get("/permissions", response_model=PermissionsResponse)
async def check_permissions():
    """Check if required macOS permissions are granted"""
    screen_ok = screen_capture.check_permission()
    accessibility_ok = context_gatherer.check_accessibility_permission()
    
    if screen_ok and accessibility_ok:
        message = "All permissions granted"
    elif not screen_ok and not accessibility_ok:
        message = "Screen Recording and Accessibility permissions required. Go to System Preferences → Security & Privacy"
    elif not screen_ok:
        message = "Screen Recording permission required. Go to System Preferences → Security & Privacy → Screen Recording"
    else:
        message = "Accessibility permission required. Go to System Preferences → Security & Privacy → Accessibility"
    
    return PermissionsResponse(
        screen_recording=screen_ok,
        accessibility=accessibility_ok,
        message=message
    )


@app.post("/capture", response_model=CaptureResponse)
async def capture_context():
    """Capture current screen context (screenshot, selected text, browser URL)"""
    try:
        # Capture screenshot
        screenshot_b64 = None
        try:
            screenshot_b64 = screen_capture.capture_base64()
        except Exception as e:
            print(f"Screenshot capture failed: {e}")
        
        # Get selected text
        selected_text = None
        try:
            selected_text = context_gatherer.get_selected_text()
        except Exception as e:
            print(f"Selected text capture failed: {e}")
        
        # Get browser URL
        browser_url = None
        try:
            browser_url = context_gatherer.get_browser_url()
        except Exception as e:
            print(f"Browser URL capture failed: {e}")
        
        # Get active application
        active_app = None
        try:
            active_app = context_gatherer.get_active_app()
        except Exception as e:
            print(f"Active app detection failed: {e}")
        
        return CaptureResponse(
            success=True,
            screenshot=screenshot_b64,
            selected_text=selected_text,
            browser_url=browser_url,
            active_app=active_app,
            captured_at=datetime.now().isoformat()
        )
    except Exception as e:
        return CaptureResponse(
            success=False,
            error=str(e),
            captured_at=datetime.now().isoformat()
        )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_with_context(request: AnalyzeRequest):
    """Capture context and analyze with AI"""
    try:
        context = {}
        
        # Capture requested context
        if request.include_screenshot:
            try:
                context["screenshot"] = screen_capture.capture_base64()
            except Exception as e:
                print(f"Screenshot failed: {e}")
        
        if request.include_selected_text:
            try:
                text = context_gatherer.get_selected_text()
                if text:
                    context["selected_text"] = text
            except Exception as e:
                print(f"Selected text failed: {e}")
        
        if request.include_browser_url:
            try:
                url = context_gatherer.get_browser_url()
                if url:
                    context["browser_url"] = url
            except Exception as e:
                print(f"Browser URL failed: {e}")
        
        # Get active app for context
        try:
            app_name = context_gatherer.get_active_app()
            if app_name:
                context["active_app"] = app_name
        except:
            pass
        
        # Analyze with AI
        response = await ai_analyzer.analyze(request.query, context)
        
        return AnalyzeResponse(
            success=True,
            response=response,
            context_used={
                "has_screenshot": "screenshot" in context,
                "has_selected_text": "selected_text" in context,
                "has_browser_url": "browser_url" in context,
                "active_app": context.get("active_app")
            }
        )
    except Exception as e:
        return AnalyzeResponse(
            success=False,
            error=str(e)
        )


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("SCREEN_CONTEXT_PORT", "3002"))
    print(f"🖥️  Screen Context Service starting on http://localhost:{port}")
    print("📸 Endpoints: /capture, /analyze, /permissions, /health")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
