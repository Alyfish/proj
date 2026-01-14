"""
Investment Scout - Data Models
Pydantic schemas for structured investment analysis
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum


class ActionType(str, Enum):
    MUST_READ = "MUST READ"
    INTERESTING = "INTERESTING"
    PASS = "PASS"


class Sentiment(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class DealStatus(str, Enum):
    PENDING = "pending"
    INVESTED = "invested"
    PASSED = "passed"
    SAVED = "saved"


class DealMetric(BaseModel):
    """Single metric from pitch deck or research"""
    label: str
    value: str
    sentiment: Sentiment = Sentiment.NEUTRAL


class Competitor(BaseModel):
    """Competitor analysis"""
    name: str
    differentiation: str  # Why target company is better/worse


class Founder(BaseModel):
    """Founder information"""
    name: str
    role: Optional[str] = None
    linkedin: Optional[str] = None
    background: Optional[str] = None


class DeckInsights(BaseModel):
    """Extracted from PDF pitch deck via Vision"""
    revenue_arr: Optional[str] = None
    burn_rate: Optional[str] = None
    runway_months: Optional[int] = None
    growth_rate: Optional[str] = None
    key_metrics: List[str] = []
    red_flags: List[str] = []  # Discrepancies with email claims


class InvestmentTerms(BaseModel):
    """Investment opportunity terms"""
    min_check: Optional[int] = None
    valuation: Optional[str] = None
    round_type: Optional[str] = None  # Seed, Series A, etc.
    lead_investor: Optional[str] = None
    carry: Optional[str] = None
    pro_rata: Optional[bool] = None
    deadline: Optional[str] = None


class InvestmentVerdict(BaseModel):
    """AI-generated verdict with Signal Score"""
    signal_score: int = Field(..., ge=0, le=100, description="0-100 quality score")
    one_line_pitch: str
    executive_summary: str
    bull_case: List[str] = []
    bear_case: List[str] = []  # Red Team risks
    metrics: List[DealMetric] = []
    competitors: List[Competitor] = []
    action: ActionType = ActionType.INTERESTING


class Deal(BaseModel):
    """Complete investment opportunity"""
    id: str
    deal_hash: str  # For deduplication
    company_name: str
    logo_url: Optional[str] = None  # Via Clearbit
    website: Optional[str] = None
    industry: Optional[str] = None
    stage: Optional[str] = None
    founders: List[Founder] = []
    terms: InvestmentTerms = InvestmentTerms()
    deck_insights: Optional[DeckInsights] = None
    verdict: Optional[InvestmentVerdict] = None
    email_id: str
    email_subject: str
    email_from: str
    email_snippet: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    status: DealStatus = DealStatus.PENDING


class DealSummary(BaseModel):
    """Lightweight deal for list views"""
    id: str
    company_name: str
    logo_url: Optional[str] = None
    stage: Optional[str] = None
    signal_score: Optional[int] = None
    action: Optional[ActionType] = None
    min_check: Optional[int] = None
    deadline: Optional[str] = None
    status: DealStatus = DealStatus.PENDING


class NewDealNotification(BaseModel):
    """WebSocket notification payload"""
    count: int
    deals: List[DealSummary]
