"""
Investment Scout - Email Monitor
Monitors Gmail for investment opportunity emails from Angel Squad, etc.
Polls 2x daily and uses existing Gmail tokens.
"""

import os
import re
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple
import base64

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from dotenv import load_dotenv

from models import Deal, InvestmentTerms, Founder
from database import get_deal_hash, deal_exists, update_deadline, save_deal

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")

# Gmail token/credentials paths (reuse from email-assistant)
TOKEN_PATH = os.getenv("GMAIL_TOKEN_PATH", str(Path(__file__).parent.parent / "email-assistant/agents/gmail/token.json"))
CREDENTIALS_PATH = os.getenv("GMAIL_CREDENTIALS_PATH", str(Path(__file__).parent.parent / "email-assistant/agents/gmail/credentials.json"))

# Investment email filter criteria
INVESTMENT_SENDERS = [
    "angel.co",
    "angellist.com",
    "squad",
    "syndicate"
]

INVESTMENT_KEYWORDS = [
    "investment opportunity",
    "deal flow",
    "allocation",
    "syndicate",
    "minimum check",
    "carry",
    "pro-rata",
    "invest now",
    "closing soon",
    "last call"
]


def get_gmail_service():
    """Get authenticated Gmail API service using existing tokens"""
    creds = None
    
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, 'r') as f:
            token_data = json.load(f)
        creds = Credentials.from_authorized_user_info(token_data)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Save refreshed token
            with open(TOKEN_PATH, 'w') as f:
                f.write(creds.to_json())
        else:
            raise Exception(f"Gmail token not found or invalid at {TOKEN_PATH}. Run email-assistant setup first.")
    
    return build('gmail', 'v1', credentials=creds)


def build_investment_query() -> str:
    """Build Gmail search query for investment emails"""
    sender_filter = " OR ".join([f"from:{s}" for s in INVESTMENT_SENDERS])
    keyword_filter = " OR ".join([f'"{kw}"' for kw in INVESTMENT_KEYWORDS[:5]])  # Limit keywords
    
    # Search emails from last 7 days
    return f"({sender_filter}) newer_than:7d"


async def fetch_investment_emails() -> List[dict]:
    """Fetch emails matching investment criteria"""
    try:
        service = get_gmail_service()
        query = build_investment_query()
        
        print(f"[EmailMonitor] Searching: {query}")
        
        result = service.users().messages().list(
            userId='me',
            q=query,
            maxResults=20
        ).execute()
        
        messages = result.get('messages', [])
        print(f"[EmailMonitor] Found {len(messages)} potential investment emails")
        
        emails = []
        for msg in messages:
            full = service.users().messages().get(
                userId='me',
                id=msg['id'],
                format='full'
            ).execute()
            
            parsed = parse_email(full)
            if parsed and is_investment_email(parsed):
                emails.append(parsed)
        
        print(f"[EmailMonitor] {len(emails)} confirmed investment emails")
        return emails
        
    except Exception as e:
        print(f"[EmailMonitor] Error fetching emails: {e}")
        return []


def parse_email(message: dict) -> Optional[dict]:
    """Parse Gmail API message into structured data"""
    try:
        headers = {h['name']: h['value'] for h in message.get('payload', {}).get('headers', [])}
        
        # Get body
        body = ""
        payload = message.get('payload', {})
        
        if 'body' in payload and payload['body'].get('data'):
            body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
        elif 'parts' in payload:
            for part in payload['parts']:
                if part.get('mimeType') == 'text/plain' and part.get('body', {}).get('data'):
                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
                    break
                elif part.get('mimeType') == 'text/html' and not body:
                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
        
        # Check for PDF attachments
        attachments = []
        if 'parts' in payload:
            for part in payload['parts']:
                filename = part.get('filename', '')
                if filename.lower().endswith('.pdf'):
                    attachments.append({
                        'filename': filename,
                        'attachment_id': part.get('body', {}).get('attachmentId'),
                        'message_id': message['id']
                    })
        
        return {
            'id': message['id'],
            'thread_id': message.get('threadId'),
            'subject': headers.get('Subject', '(No Subject)'),
            'from': headers.get('From', ''),
            'date': headers.get('Date', ''),
            'snippet': message.get('snippet', ''),
            'body': body,
            'attachments': attachments
        }
        
    except Exception as e:
        print(f"[EmailMonitor] Error parsing email: {e}")
        return None


def is_investment_email(email: dict) -> bool:
    """Check if email is likely an investment opportunity"""
    text = f"{email['subject']} {email['body']}".lower()
    
    # Must contain at least one investment keyword
    has_keyword = any(kw.lower() in text for kw in INVESTMENT_KEYWORDS)
    
    # Check sender domain
    from_addr = email['from'].lower()
    has_sender = any(s in from_addr for s in INVESTMENT_SENDERS)
    
    return has_keyword or has_sender


def extract_company_info(email: dict) -> Tuple[str, Optional[str], Optional[str]]:
    """Extract company name, website, and round from email"""
    text = f"{email['subject']} {email['body']}"
    
    # Try to extract company name from subject
    subject = email['subject']
    
    # Common patterns: "Invest in [Company]", "[Company] - Seed Round"
    patterns = [
        r"invest in (\w+(?:\s+\w+)?)",
        r"^(\w+(?:\s+\w+)?)\s*[-–:]\s*(?:seed|series|pre-seed)",
        r"opportunity[:\s]+(\w+(?:\s+\w+)?)",
        r"introducing (\w+(?:\s+\w+)?)",
    ]
    
    company_name = None
    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            company_name = match.group(1).strip()
            break
    
    if not company_name:
        company_name = subject.split('-')[0].strip()[:50]  # Fallback
    
    # Extract website
    website = None
    url_match = re.search(r'https?://(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})', text)
    if url_match:
        website = url_match.group(0)
    
    # Extract round type
    round_type = None
    round_patterns = [
        (r'pre-?seed', 'Pre-seed'),
        (r'seed\s*round', 'Seed'),
        (r'series\s*a', 'Series A'),
        (r'series\s*b', 'Series B'),
    ]
    for pattern, name in round_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            round_type = name
            break
    
    return company_name, website, round_type


def extract_terms(email: dict) -> InvestmentTerms:
    """Extract investment terms from email body"""
    text = email['body']
    terms = InvestmentTerms()
    
    # Min check
    min_match = re.search(r'(?:minimum|min)[:\s]*\$?([0-9,]+)', text, re.IGNORECASE)
    if min_match:
        terms.min_check = int(min_match.group(1).replace(',', ''))
    
    # Valuation
    val_match = re.search(r'valuation[:\s]*\$?([0-9.]+\s*[MB])', text, re.IGNORECASE)
    if val_match:
        terms.valuation = val_match.group(1)
    
    # Deadline
    deadline_match = re.search(r'(?:deadline|closes?|closing)[:\s]*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?)', text, re.IGNORECASE)
    if deadline_match:
        terms.deadline = deadline_match.group(1)
    
    return terms


async def process_emails(emails: List[dict]) -> List[Deal]:
    """Process emails and create/update deals"""
    new_deals = []
    
    for email in emails:
        company, website, round_type = extract_company_info(email)
        
        # Generate deal hash for deduplication
        hash_key = get_deal_hash(company, round_type or 'unknown')
        
        # Check if deal already exists
        if deal_exists(hash_key):
            print(f"[EmailMonitor] Deal exists: {company} - updating deadline only")
            terms = extract_terms(email)
            if terms.deadline:
                update_deadline(hash_key, terms.deadline)
            continue
        
        # Create new deal
        import uuid
        deal = Deal(
            id=str(uuid.uuid4()),
            deal_hash=hash_key,
            company_name=company,
            website=website,
            stage=round_type,
            terms=extract_terms(email),
            email_id=email['id'],
            email_subject=email['subject'],
            email_from=email['from'],
            email_snippet=email['snippet']
        )
        
        save_deal(deal)
        new_deals.append(deal)
        print(f"[EmailMonitor] New deal: {company}")
    
    return new_deals


async def run_email_check() -> List[Deal]:
    """Main entry point - check for new investment emails"""
    print(f"\n{'='*50}")
    print(f"[EmailMonitor] Running check at {datetime.now().isoformat()}")
    print(f"{'='*50}")
    
    emails = await fetch_investment_emails()
    if not emails:
        print("[EmailMonitor] No investment emails found")
        return []
    
    new_deals = await process_emails(emails)
    print(f"[EmailMonitor] Processed {len(new_deals)} new deals")
    
    return new_deals


if __name__ == "__main__":
    # Test run
    asyncio.run(run_email_check())
