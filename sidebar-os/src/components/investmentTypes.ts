/**
 * Investment Scout - TypeScript Types
 */

export interface DealMetric {
    label: string;
    value: string;
    sentiment: 'positive' | 'neutral' | 'negative';
}

export interface Competitor {
    name: string;
    differentiation: string;
}

export interface InvestmentVerdict {
    signal_score: number;
    one_line_pitch: string;
    executive_summary: string;
    bull_case: string[];
    bear_case: string[];
    metrics: DealMetric[];
    competitors: Competitor[];
    action: 'MUST READ' | 'INTERESTING' | 'PASS';
}

export interface InvestmentTerms {
    min_check?: number;
    valuation?: string;
    round_type?: string;
    lead_investor?: string;
    carry?: string;
    pro_rata?: boolean;
    deadline?: string;
}

export interface DealSummary {
    id: string;
    company_name: string;
    logo_url?: string;
    stage?: string;
    signal_score?: number;
    action?: string;
    min_check?: number;
    deadline?: string;
    status: 'pending' | 'invested' | 'passed' | 'saved';
}

export interface Deal extends DealSummary {
    deal_hash: string;
    website?: string;
    industry?: string;
    founders?: { name: string; role?: string; linkedin?: string }[];
    terms: InvestmentTerms;
    deck_insights?: {
        revenue_arr?: string;
        burn_rate?: string;
        runway_months?: number;
        growth_rate?: string;
        key_metrics: string[];
        red_flags: string[];
    };
    verdict?: InvestmentVerdict;
    email_id: string;
    email_subject: string;
    email_from: string;
    email_snippet: string;
    created_at: string;
    updated_at: string;
}

export interface NewDealNotification {
    count: number;
    deals: DealSummary[];
}
