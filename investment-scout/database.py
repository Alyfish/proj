"""
Investment Scout - Database Layer
SQLite storage with deal hash deduplication
"""

import sqlite3
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from contextlib import contextmanager

from models import Deal, DealStatus, DealSummary

DB_PATH = Path(__file__).parent / "investment_scout.db"


def get_deal_hash(company_name: str, round_name: str) -> str:
    """Generate unique hash for deal deduplication"""
    key = f"{company_name}:{round_name}".lower().strip()
    return hashlib.md5(key.encode()).hexdigest()


@contextmanager
def get_db():
    """Database connection context manager"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Initialize database schema"""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS deals (
                id TEXT PRIMARY KEY,
                deal_hash TEXT UNIQUE,
                company_name TEXT NOT NULL,
                logo_url TEXT,
                website TEXT,
                industry TEXT,
                stage TEXT,
                founders_json TEXT,
                terms_json TEXT,
                deck_insights_json TEXT,
                verdict_json TEXT,
                email_id TEXT,
                email_subject TEXT,
                email_from TEXT,
                email_snippet TEXT,
                created_at TEXT,
                updated_at TEXT,
                status TEXT DEFAULT 'pending'
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_deal_hash ON deals(deal_hash)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_status ON deals(status)
        """)
        conn.commit()


def deal_exists(deal_hash: str) -> bool:
    """Check if deal already exists (deduplication)"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM deals WHERE deal_hash = ?", 
            (deal_hash,)
        ).fetchone()
        return row is not None


def get_deal_by_hash(deal_hash: str) -> Optional[dict]:
    """Get existing deal by hash"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM deals WHERE deal_hash = ?",
            (deal_hash,)
        ).fetchone()
        return dict(row) if row else None


def update_deadline(deal_hash: str, new_deadline: str):
    """Update just the deadline for existing deal (for 'Last Call' emails)"""
    with get_db() as conn:
        # Get current terms and update deadline
        row = conn.execute(
            "SELECT terms_json FROM deals WHERE deal_hash = ?",
            (deal_hash,)
        ).fetchone()
        
        if row:
            terms = json.loads(row['terms_json']) if row['terms_json'] else {}
            terms['deadline'] = new_deadline
            
            conn.execute(
                """UPDATE deals SET 
                    terms_json = ?,
                    updated_at = ?
                WHERE deal_hash = ?""",
                (json.dumps(terms), datetime.now().isoformat(), deal_hash)
            )
            conn.commit()


def save_deal(deal: Deal):
    """Save new deal to database"""
    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO deals (
                id, deal_hash, company_name, logo_url, website, industry, stage,
                founders_json, terms_json, deck_insights_json, verdict_json,
                email_id, email_subject, email_from, email_snippet,
                created_at, updated_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            deal.id,
            deal.deal_hash,
            deal.company_name,
            deal.logo_url,
            deal.website,
            deal.industry,
            deal.stage,
            json.dumps([f.model_dump() for f in deal.founders]),
            json.dumps(deal.terms.model_dump()),
            json.dumps(deal.deck_insights.model_dump()) if deal.deck_insights else None,
            json.dumps(deal.verdict.model_dump()) if deal.verdict else None,
            deal.email_id,
            deal.email_subject,
            deal.email_from,
            deal.email_snippet,
            deal.created_at.isoformat(),
            deal.updated_at.isoformat(),
            deal.status.value
        ))
        conn.commit()


def get_deals(
    status: Optional[str] = None,
    limit: int = 50
) -> List[DealSummary]:
    """Get deals with optional filtering"""
    with get_db() as conn:
        query = "SELECT * FROM deals"
        params = []
        
        if status:
            query += " WHERE status = ?"
            params.append(status)
        
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        rows = conn.execute(query, params).fetchall()
        
        summaries = []
        for row in rows:
            verdict = json.loads(row['verdict_json']) if row['verdict_json'] else {}
            terms = json.loads(row['terms_json']) if row['terms_json'] else {}
            
            summaries.append(DealSummary(
                id=row['id'],
                company_name=row['company_name'],
                logo_url=row['logo_url'],
                stage=row['stage'],
                signal_score=verdict.get('signal_score'),
                action=verdict.get('action'),
                min_check=terms.get('min_check'),
                deadline=terms.get('deadline'),
                status=row['status']
            ))
        
        return summaries


def get_deal(deal_id: str) -> Optional[Deal]:
    """Get full deal by ID"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM deals WHERE id = ?",
            (deal_id,)
        ).fetchone()
        
        if not row:
            return None
        
        return _row_to_deal(dict(row))


def update_deal_status(deal_id: str, status: DealStatus):
    """Update deal status (invested, passed, saved)"""
    with get_db() as conn:
        conn.execute(
            "UPDATE deals SET status = ?, updated_at = ? WHERE id = ?",
            (status.value, datetime.now().isoformat(), deal_id)
        )
        conn.commit()


def _row_to_deal(row: dict) -> Deal:
    """Convert database row to Deal model"""
    from models import Founder, InvestmentTerms, DeckInsights, InvestmentVerdict
    
    founders = []
    if row.get('founders_json'):
        founders = [Founder(**f) for f in json.loads(row['founders_json'])]
    
    terms = InvestmentTerms()
    if row.get('terms_json'):
        terms = InvestmentTerms(**json.loads(row['terms_json']))
    
    deck_insights = None
    if row.get('deck_insights_json'):
        deck_insights = DeckInsights(**json.loads(row['deck_insights_json']))
    
    verdict = None
    if row.get('verdict_json'):
        verdict = InvestmentVerdict(**json.loads(row['verdict_json']))
    
    return Deal(
        id=row['id'],
        deal_hash=row['deal_hash'],
        company_name=row['company_name'],
        logo_url=row.get('logo_url'),
        website=row.get('website'),
        industry=row.get('industry'),
        stage=row.get('stage'),
        founders=founders,
        terms=terms,
        deck_insights=deck_insights,
        verdict=verdict,
        email_id=row['email_id'],
        email_subject=row['email_subject'],
        email_from=row['email_from'],
        email_snippet=row['email_snippet'],
        created_at=datetime.fromisoformat(row['created_at']),
        updated_at=datetime.fromisoformat(row['updated_at']),
        status=DealStatus(row['status'])
    )


# Initialize database on import
init_db()
