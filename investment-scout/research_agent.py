"""
Investment Scout - Research Agent
Red Team research using Exa API to validate/invalidate investment claims
"""

import os
import asyncio
from typing import List, Dict, Optional
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

# Try Exa first, fallback to Tavily
EXA_API_KEY = os.getenv("EXA_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


@dataclass
class ResearchResult:
    """Single research finding"""
    source: str
    title: str
    content: str
    url: str
    relevance: float = 0.0


@dataclass
class CompanyResearch:
    """Complete research on a company"""
    company_name: str
    validation: List[ResearchResult]  # LinkedIn, founder background
    sentiment: List[ResearchResult]   # Reddit, HN discussions
    competitors: List[ResearchResult] # Alternative products
    news: List[ResearchResult]        # Recent funding, layoffs
    website_content: Optional[str] = None


class ExaResearchAgent:
    """Exa-powered research agent"""
    
    def __init__(self):
        if not EXA_API_KEY:
            raise ValueError("EXA_API_KEY not set")
        from exa_py import Exa
        self.client = Exa(api_key=EXA_API_KEY)
    
    async def search(self, query: str, num_results: int = 5) -> List[ResearchResult]:
        """Search with Exa neural search"""
        try:
            results = self.client.search_and_contents(
                query,
                num_results=num_results,
                use_autoprompt=True
            )
            
            return [
                ResearchResult(
                    source="exa",
                    title=r.title or "",
                    content=r.text[:500] if r.text else "",
                    url=r.url,
                    relevance=r.score if hasattr(r, 'score') else 0.0
                )
                for r in results.results
            ]
        except Exception as e:
            print(f"[Research] Exa search error: {e}")
            return []
    
    async def get_website(self, url: str) -> Optional[str]:
        """Get website content"""
        try:
            result = self.client.get_contents([url])
            if result.results:
                return result.results[0].text[:2000]
            return None
        except Exception as e:
            print(f"[Research] Website fetch error: {e}")
            return None


class TavilyResearchAgent:
    """Tavily-powered research agent (fallback)"""
    
    def __init__(self):
        if not TAVILY_API_KEY:
            raise ValueError("TAVILY_API_KEY not set")
        from tavily import TavilyClient
        self.client = TavilyClient(api_key=TAVILY_API_KEY)
    
    async def search(self, query: str, num_results: int = 5) -> List[ResearchResult]:
        """Search with Tavily"""
        try:
            results = self.client.search(
                query,
                max_results=num_results,
                include_raw_content=True
            )
            
            return [
                ResearchResult(
                    source="tavily",
                    title=r.get('title', ''),
                    content=r.get('content', '')[:500],
                    url=r.get('url', ''),
                    relevance=r.get('score', 0.0)
                )
                for r in results.get('results', [])
            ]
        except Exception as e:
            print(f"[Research] Tavily search error: {e}")
            return []
    
    async def get_website(self, url: str) -> Optional[str]:
        """Get website content via Tavily extract"""
        try:
            result = self.client.extract(urls=[url])
            if result.get('results'):
                return result['results'][0].get('raw_content', '')[:2000]
            return None
        except Exception as e:
            print(f"[Research] Website fetch error: {e}")
            return None


def get_research_agent():
    """Get available research agent (Exa preferred, Tavily fallback)"""
    if EXA_API_KEY:
        try:
            return ExaResearchAgent()
        except Exception as e:
            print(f"[Research] Exa init failed: {e}")
    
    if TAVILY_API_KEY:
        try:
            return TavilyResearchAgent()
        except Exception as e:
            print(f"[Research] Tavily init failed: {e}")
    
    raise ValueError("No research API configured. Set EXA_API_KEY or TAVILY_API_KEY")


async def research_company(
    company_name: str,
    founder_name: Optional[str] = None,
    website: Optional[str] = None
) -> CompanyResearch:
    """
    Red Team research on a company.
    Runs parallel searches to validate claims and find risks.
    """
    agent = get_research_agent()
    
    print(f"[Research] Starting Red Team research for: {company_name}")
    
    # Build research tasks (parallel execution)
    tasks = []
    
    # 1. Founder validation (LinkedIn background)
    if founder_name:
        tasks.append(("validation", agent.search(
            f"{founder_name} LinkedIn background founder"
        )))
    else:
        tasks.append(("validation", agent.search(
            f"{company_name} founder CEO background"
        )))
    
    # 2. Real user sentiment (Reddit, HN)
    tasks.append(("sentiment", agent.search(
        f"{company_name} site:reddit.com OR site:news.ycombinator.com"
    )))
    
    # 3. Competitors analysis
    tasks.append(("competitors", agent.search(
        f"Alternatives to {company_name} pricing comparison"
    )))
    
    # 4. Recent news (funding, layoffs, etc.)
    tasks.append(("news", agent.search(
        f"{company_name} funding layoffs 2024 2025"
    )))
    
    # Execute all searches in parallel
    results = {}
    search_results = await asyncio.gather(*[t[1] for t in tasks])
    
    for i, (category, _) in enumerate(tasks):
        results[category] = search_results[i]
    
    # 5. Website content (if provided)
    website_content = None
    if website:
        website_content = await agent.get_website(website)
    
    research = CompanyResearch(
        company_name=company_name,
        validation=results.get('validation', []),
        sentiment=results.get('sentiment', []),
        competitors=results.get('competitors', []),
        news=results.get('news', []),
        website_content=website_content
    )
    
    print(f"[Research] Completed: {len(research.validation)} validation, "
          f"{len(research.sentiment)} sentiment, {len(research.competitors)} competitors")
    
    return research


def summarize_research(research: CompanyResearch) -> Dict:
    """Summarize research for LLM consumption"""
    return {
        "company": research.company_name,
        "founder_info": [
            {"title": r.title, "content": r.content} 
            for r in research.validation[:3]
        ],
        "user_sentiment": [
            {"title": r.title, "content": r.content, "source": r.url}
            for r in research.sentiment[:3]
        ],
        "competitors": [
            {"title": r.title, "content": r.content}
            for r in research.competitors[:3]
        ],
        "recent_news": [
            {"title": r.title, "content": r.content}
            for r in research.news[:3]
        ],
        "website_summary": research.website_content[:500] if research.website_content else None
    }


if __name__ == "__main__":
    # Test research
    async def test():
        research = await research_company(
            "OpenAI",
            founder_name="Sam Altman"
        )
        print(summarize_research(research))
    
    asyncio.run(test())
