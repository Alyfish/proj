"""
Investment Scout - AI Analyzer
Generates investment verdicts using GPT-4
"""

import os
import json
import asyncio
from typing import Optional, Dict, List

from openai import AsyncOpenAI
from dotenv import load_dotenv

from models import (
    Deal, InvestmentVerdict, DealMetric, Competitor,
    DeckInsights, ActionType, Sentiment
)
from research_agent import research_company, summarize_research
from scorer import calculate_signal_score, get_action_from_score

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

VERDICT_PROMPT = """You are a skeptical angel investor analyzing a startup investment opportunity.

Given the following information:
- EMAIL PITCH: {email_content}
- INVESTMENT TERMS: {terms}
- EXTERNAL RESEARCH: {research}
{deck_section}

Analyze this opportunity with a RED TEAM mindset. Compare the email claims vs external reality.

Provide your analysis as JSON with this exact structure:
{{
    "one_line_pitch": "2-sentence company summary",
    "executive_summary": "3-4 sentence analysis of why to invest or not",
    "bull_case": ["reason 1", "reason 2", "reason 3"],
    "bear_case": ["risk 1", "risk 2", "risk 3"],
    "metrics": [
        {{"label": "ARR", "value": "$X", "sentiment": "positive|neutral|negative"}},
        {{"label": "Growth", "value": "X%", "sentiment": "positive|neutral|negative"}}
    ],
    "competitors": [
        {{"name": "Competitor", "differentiation": "How target differs"}}
    ]
}}

Be concise but insightful. Focus on discrepancies between claims and research.
Return ONLY valid JSON, no markdown."""


async def analyze_deal(deal: Deal) -> InvestmentVerdict:
    """
    Full analysis pipeline:
    1. Research the company
    2. Calculate Signal Score
    3. Generate LLM verdict
    """
    print(f"\n[Analyzer] Starting analysis for: {deal.company_name}")
    
    # 1. Run external research
    research = await research_company(
        company_name=deal.company_name,
        website=deal.website
    )
    research_summary = summarize_research(research)
    
    # 2. Calculate Signal Score
    email_content = f"{deal.email_subject}\n{deal.email_snippet}"
    signal_score = calculate_signal_score(
        email_content=email_content,
        deck_insights=deal.deck_insights,
        research_summary=research_summary
    )
    
    # 3. Generate LLM verdict
    deck_section = ""
    if deal.deck_insights:
        deck_section = f"\n- PITCH DECK INSIGHTS: {deal.deck_insights.model_dump_json()}"
    
    prompt = VERDICT_PROMPT.format(
        email_content=email_content,
        terms=deal.terms.model_dump_json(),
        research=json.dumps(research_summary, indent=2),
        deck_section=deck_section
    )
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are a skeptical VC analyst. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        content = response.choices[0].message.content
        # Clean potential markdown
        content = content.replace("```json", "").replace("```", "").strip()
        
        result = json.loads(content)
        
        # Build verdict with signal score
        verdict = InvestmentVerdict(
            signal_score=signal_score,
            one_line_pitch=result.get("one_line_pitch", deal.email_subject),
            executive_summary=result.get("executive_summary", ""),
            bull_case=result.get("bull_case", []),
            bear_case=result.get("bear_case", []),
            metrics=[
                DealMetric(
                    label=m.get("label", ""),
                    value=m.get("value", ""),
                    sentiment=Sentiment(m.get("sentiment", "neutral"))
                )
                for m in result.get("metrics", [])
            ],
            competitors=[
                Competitor(
                    name=c.get("name", ""),
                    differentiation=c.get("differentiation", "")
                )
                for c in result.get("competitors", [])
            ],
            action=ActionType(get_action_from_score(signal_score))
        )
        
        print(f"[Analyzer] Verdict: {verdict.action} (Score: {signal_score})")
        return verdict
        
    except Exception as e:
        print(f"[Analyzer] Error: {e}")
        # Return basic verdict on error
        return InvestmentVerdict(
            signal_score=signal_score,
            one_line_pitch=deal.email_subject,
            executive_summary="Analysis pending - error during processing",
            action=ActionType(get_action_from_score(signal_score))
        )


async def analyze_deals(deals: List[Deal]) -> List[Deal]:
    """Analyze multiple deals and update with verdicts"""
    from database import save_deal
    
    analyzed = []
    for deal in deals:
        verdict = await analyze_deal(deal)
        deal.verdict = verdict
        save_deal(deal)
        analyzed.append(deal)
    
    return analyzed


if __name__ == "__main__":
    # Test analyzer
    from models import InvestmentTerms
    
    test_deal = Deal(
        id="test-1",
        deal_hash="test123",
        company_name="TechStartup AI",
        website="https://techstartup.ai",
        stage="Seed",
        terms=InvestmentTerms(min_check=5000, valuation="$10M"),
        email_id="email-1",
        email_subject="Invest in TechStartup AI - Seed Round",
        email_from="deals@angellist.com",
        email_snippet="TechStartup AI is revolutionizing enterprise analytics with AI. $2M ARR, 200% YoY growth. a16z is leading."
    )
    
    async def test():
        verdict = await analyze_deal(test_deal)
        print(verdict.model_dump_json(indent=2))
    
    asyncio.run(test())
