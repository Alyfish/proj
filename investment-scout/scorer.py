"""
Investment Scout - Signal Score Calculator
Weighted scoring system for investment quality assessment
"""

from typing import List, Dict, Optional
from models import DeckInsights


# Score weights
WEIGHTS = {
    # Positive signals
    "top_tier_vc": 20,        # a16z, Sequoia, etc.
    "revenue_mentioned": 15,  # Has actual revenue
    "market_tam": 10,         # Large market mentioned
    "prior_exit": 15,         # Founders with exits
    "growth_rate": 10,        # Strong growth metrics
    
    # Negative signals
    "high_burn": -20,         # High burn rate
    "low_runway": -15,        # < 6 months runway
    "funded_competitor": -10, # Well-funded competitors
    "red_flags": -5,          # Per red flag found
    "no_metrics": -10,        # No concrete metrics
}

TOP_TIER_VCS = [
    "a16z", "andreessen", "sequoia", "benchmark", "accel",
    "greylock", "lightspeed", "founders fund", "tiger global",
    "index ventures", "bessemer", "general catalyst", "y combinator",
    "yc", "khosla", "kleiner", "ggv", "insight partners"
]


def calculate_signal_score(
    email_content: str,
    deck_insights: Optional[DeckInsights] = None,
    research_summary: Optional[Dict] = None
) -> int:
    """
    Calculate Signal Score (0-100) based on weighted factors.
    
    Starts at 50 (neutral) and adjusts based on signals.
    """
    score = 50  # Base score
    reasons = []
    
    text = email_content.lower()
    
    # === POSITIVE SIGNALS ===
    
    # 1. Top-tier VC involvement
    for vc in TOP_TIER_VCS:
        if vc in text:
            score += WEIGHTS["top_tier_vc"]
            reasons.append(f"+{WEIGHTS['top_tier_vc']}: Top-tier VC ({vc})")
            break  # Only count once
    
    # 2. Revenue mentioned
    if any(term in text for term in ["arr", "mrr", "revenue", "$"]):
        score += WEIGHTS["revenue_mentioned"]
        reasons.append(f"+{WEIGHTS['revenue_mentioned']}: Revenue metrics mentioned")
    else:
        score += WEIGHTS["no_metrics"]
        reasons.append(f"{WEIGHTS['no_metrics']}: No concrete metrics")
    
    # 3. Market size
    if any(term in text for term in ["tam", "billion", "market size"]):
        score += WEIGHTS["market_tam"]
        reasons.append(f"+{WEIGHTS['market_tam']}: Large market mentioned")
    
    # 4. Growth metrics
    growth_terms = ["yoy", "year over year", "growth", "2x", "3x", "10x"]
    if any(term in text for term in growth_terms):
        score += WEIGHTS["growth_rate"]
        reasons.append(f"+{WEIGHTS['growth_rate']}: Growth metrics mentioned")
    
    # === DECK INSIGHTS (if available) ===
    
    if deck_insights:
        # Runway check
        if deck_insights.runway_months:
            if deck_insights.runway_months < 6:
                score += WEIGHTS["low_runway"]
                reasons.append(f"{WEIGHTS['low_runway']}: Low runway (<6 months)")
        
        # Burn rate check
        if deck_insights.burn_rate:
            burn_text = deck_insights.burn_rate.lower()
            if any(x in burn_text for x in ["high", "500k", "1m", "million"]):
                score += WEIGHTS["high_burn"]
                reasons.append(f"{WEIGHTS['high_burn']}: High burn rate")
        
        # Red flags from deck analysis
        if deck_insights.red_flags:
            penalty = len(deck_insights.red_flags) * WEIGHTS["red_flags"]
            score += penalty
            reasons.append(f"{penalty}: {len(deck_insights.red_flags)} red flags in deck")
    
    # === RESEARCH INSIGHTS (if available) ===
    
    if research_summary:
        # Check for funded competitors
        competitors = research_summary.get("competitors", [])
        for comp in competitors:
            content = comp.get("content", "").lower()
            if any(term in content for term in ["raised", "funding", "series"]):
                score += WEIGHTS["funded_competitor"]
                reasons.append(f"{WEIGHTS['funded_competitor']}: Funded competitor found")
                break
        
        # Check for founder exits
        validation = research_summary.get("founder_info", [])
        for info in validation:
            content = info.get("content", "").lower()
            if any(term in content for term in ["exited", "sold", "acquired", "ipo"]):
                score += WEIGHTS["prior_exit"]
                reasons.append(f"+{WEIGHTS['prior_exit']}: Founder has prior exit")
                break
        
        # Check sentiment for red flags
        sentiment = research_summary.get("user_sentiment", [])
        negative_count = 0
        for s in sentiment:
            content = s.get("content", "").lower()
            if any(term in content for term in ["scam", "fraud", "terrible", "avoid"]):
                negative_count += 1
        
        if negative_count > 0:
            penalty = negative_count * WEIGHTS["red_flags"]
            score += penalty
            reasons.append(f"{penalty}: Negative user sentiment")
    
    # Clamp to 0-100
    final_score = max(0, min(100, score))
    
    print(f"[Scorer] Signal Score: {final_score}")
    for reason in reasons:
        print(f"  {reason}")
    
    return final_score


def get_action_from_score(score: int) -> str:
    """Convert score to action recommendation"""
    if score >= 80:
        return "MUST READ"
    elif score >= 60:
        return "INTERESTING"
    else:
        return "PASS"


def score_to_color(score: int) -> str:
    """Get color for UI display"""
    if score >= 80:
        return "#4ADE80"  # Green
    elif score >= 60:
        return "#FACC15"  # Yellow
    else:
        return "#F87171"  # Red
