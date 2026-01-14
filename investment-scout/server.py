"""
Investment Scout - FastAPI Server
REST API + WebSocket for real-time notifications
"""

import os
import asyncio
from datetime import datetime
from typing import List, Optional, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import Deal, DealSummary, DealStatus, NewDealNotification
from database import get_deals, get_deal, update_deal_status, init_db
from email_monitor import run_email_check
from analyzer import analyze_deals

# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"[WS] Client connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        print(f"[WS] Client disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Send to all connected clients"""
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.discard(connection)


manager = ConnectionManager()


# Background task for email checking
async def background_email_check():
    """Periodic email check (runs every 12 hours)"""
    while True:
        try:
            print(f"\n[Background] Running scheduled email check...")
            new_deals = await run_email_check()
            
            if new_deals:
                # Analyze new deals
                analyzed = await analyze_deals(new_deals)
                
                # Notify connected clients
                notification = NewDealNotification(
                    count=len(analyzed),
                    deals=[
                        DealSummary(
                            id=d.id,
                            company_name=d.company_name,
                            signal_score=d.verdict.signal_score if d.verdict else None,
                            action=d.verdict.action if d.verdict else None,
                            min_check=d.terms.min_check,
                            deadline=d.terms.deadline,
                            status=d.status
                        )
                        for d in analyzed
                    ]
                )
                
                await manager.broadcast({
                    "type": "new_opportunities",
                    "data": notification.model_dump()
                })
        
        except Exception as e:
            print(f"[Background] Error: {e}")
        
        # Wait 12 hours
        await asyncio.sleep(12 * 60 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifecycle - start background tasks"""
    init_db()
    
    # Start background email checker
    task = asyncio.create_task(background_email_check())
    print("[Server] Background email checker started")
    
    yield
    
    # Cleanup
    task.cancel()


app = FastAPI(
    title="Investment Scout API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === REST Endpoints ===

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/opportunities", response_model=List[DealSummary])
async def list_opportunities(
    status: Optional[str] = None,
    limit: int = 50
):
    """Get investment opportunities"""
    return get_deals(status=status, limit=limit)


@app.get("/opportunities/{deal_id}", response_model=Deal)
async def get_opportunity(deal_id: str):
    """Get full deal details"""
    deal = get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


class StatusUpdate(BaseModel):
    status: str


@app.post("/opportunities/{deal_id}/status")
async def update_status(deal_id: str, update: StatusUpdate):
    """Update deal status (invested, passed, saved)"""
    try:
        status = DealStatus(update.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_deal_status(deal_id, status)
    return {"success": True}


@app.post("/check-emails")
async def trigger_email_check():
    """Manually trigger email check"""
    try:
        new_deals = await run_email_check()
        
        if new_deals:
            analyzed = await analyze_deals(new_deals)
            return {
                "success": True,
                "new_deals": len(analyzed),
                "deals": [d.company_name for d in analyzed]
            }
        
        return {"success": True, "new_deals": 0}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/test-deal")
async def create_test_deal():
    """Create a mock deal for UI testing (no email required)"""
    import uuid
    from models import Deal, InvestmentTerms, InvestmentVerdict, DealMetric, Competitor, ActionType
    from database import save_deal
    
    # Create mock deal
    deal = Deal(
        id=str(uuid.uuid4()),
        deal_hash=f"test-{uuid.uuid4().hex[:8]}",
        company_name="TechStartup AI",
        logo_url=None,
        website="https://techstartup.ai",
        industry="AI/ML",
        stage="Seed",
        terms=InvestmentTerms(
            min_check=5000,
            valuation="$15M cap",
            round_type="SAFE",
            lead_investor="a16z Scout",
            deadline="Jan 25"
        ),
        verdict=InvestmentVerdict(
            signal_score=78,
            one_line_pitch="AI-powered analytics platform for enterprise. $2M ARR, 200% YoY growth.",
            executive_summary="Strong founding team with prior exits. Growing in competitive but expanding market. Some concerns about burn rate.",
            bull_case=[
                "Founders previously exited to Salesforce",
                "Strong enterprise traction with Fortune 500",
                "200% YoY revenue growth"
            ],
            bear_case=[
                "Crowded market with well-funded competitors",
                "High burn rate at $200k/mo",
                "Customer concentration risk"
            ],
            metrics=[
                DealMetric(label="ARR", value="$2M", sentiment="positive"),
                DealMetric(label="Growth", value="200% YoY", sentiment="positive"),
                DealMetric(label="Burn", value="$200k/mo", sentiment="negative")
            ],
            competitors=[
                Competitor(name="DataDog", differentiation="More enterprise-focused"),
                Competitor(name="Mixpanel", differentiation="Better AI layer")
            ],
            action=ActionType.INTERESTING
        ),
        email_id="test-email-1",
        email_subject="🚀 Invest in TechStartup AI - Seed Round",
        email_from="deals@angellist.com",
        email_snippet="TechStartup AI is revolutionizing enterprise analytics..."
    )
    
    save_deal(deal)
    
    # Broadcast notification to connected clients
    await manager.broadcast({
        "type": "new_opportunities",
        "data": {
            "count": 1,
            "deals": [{
                "id": deal.id,
                "company_name": deal.company_name,
                "signal_score": deal.verdict.signal_score,
                "action": deal.verdict.action.value,
                "min_check": deal.terms.min_check,
                "deadline": deal.terms.deadline,
                "status": deal.status.value
            }]
        }
    })
    
    return {
        "success": True,
        "deal_id": deal.id,
        "company_name": deal.company_name,
        "message": "Test deal created and broadcast to connected clients"
    }


# === WebSocket Endpoint ===

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time notifications"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            
            # Handle ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("INVESTMENT_SCOUT_PORT", 3003))
    uvicorn.run(app, host="0.0.0.0", port=port)
