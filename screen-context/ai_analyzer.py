"""
AI Analyzer Module
Sends screen context to OpenAI GPT-4 Vision for analysis
"""

import os
from typing import Optional
from openai import AsyncOpenAI


class AIAnalyzer:
    """Analyzes screen context using OpenAI GPT-4 Vision"""
    
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("VITE_OPENAI_API_KEY")
        if not api_key:
            print("⚠️  Warning: No OpenAI API key found in environment")
        self.client = AsyncOpenAI(api_key=api_key) if api_key else None
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")  # Default to GPT-4o (vision capable)
    
    async def analyze(self, query: str, context: dict) -> str:
        """Analyze the context with the user's query"""
        if not self.client:
            return "Error: OpenAI API key not configured. Set OPENAI_API_KEY in environment."
        
        # Build the message content
        messages = [
            {
                "role": "system",
                "content": self._build_system_prompt(context)
            }
        ]
        
        # Build user message with image if available
        user_content = []
        
        # Add context description
        context_desc = self._build_context_description(context)
        if context_desc:
            user_content.append({
                "type": "text",
                "text": f"Current context:\n{context_desc}\n\nUser question: {query}"
            })
        else:
            user_content.append({
                "type": "text", 
                "text": query
            })
        
        # Add screenshot if available
        if "screenshot" in context and context["screenshot"]:
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{context['screenshot']}",
                    "detail": "high"
                }
            })
        
        messages.append({
            "role": "user",
            "content": user_content
        })
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=2048,
                temperature=0.7
            )
            
            return response.choices[0].message.content or "No response generated"
        except Exception as e:
            return f"Error analyzing context: {str(e)}"
    
    def _build_system_prompt(self, context: dict) -> str:
        """Build system prompt based on available context"""
        prompt = """You are Sentex AI, a helpful assistant that can see the user's screen and understand their current context.

You have access to:
- A screenshot of their current screen (if provided)
- Any text they have selected (if provided)
- The URL of their current browser tab (if provided)
- The name of their active application

CRITICAL FORMATTING RULES (the UI does NOT render markdown):
- DO NOT use markdown syntax like ###, **, `, etc.
- Use plain text with natural line breaks
- Use • or - for bullet points
- Use ALL CAPS or UPPERCASE for emphasis instead of **bold**
- Add blank lines between sections for readability
- Keep paragraphs short (2-3 sentences max)
- Start with a one-line summary, then add details below

Example good response format:
SUMMARY: You're viewing a code editor with a Python file open.

MAIN CONTENT
• The file is called server.py
• It contains a FastAPI application
• There are 3 endpoints visible

DETAILS
The terminal at the bottom shows the server is running on port 3002.

When analyzing screenshots, lead with the most relevant observation to the user's question."""
        
        return prompt
    
    def _build_context_description(self, context: dict) -> str:
        """Build a text description of the available context"""
        parts = []
        
        if context.get("active_app"):
            parts.append(f"Active application: {context['active_app']}")
        
        if context.get("browser_url"):
            parts.append(f"Browser URL: {context['browser_url']}")
        
        if context.get("selected_text"):
            text = context["selected_text"]
            if len(text) > 500:
                text = text[:500] + "..."
            parts.append(f"Selected text: \"{text}\"")
        
        if context.get("screenshot"):
            parts.append("[Screenshot attached]")
        
        return "\n".join(parts) if parts else ""
