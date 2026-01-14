/**
 * Investment Models - Swift Data Structures
 * Mirrors Pydantic models from Python backend
 */

import Foundation

// MARK: - Deal Summary (for list views)
struct DealSummary: Identifiable, Codable {
    let id: String
    let companyName: String
    let logoUrl: String?
    let stage: String?
    let signalScore: Int?
    let action: String?
    let minCheck: Int?
    let deadline: String?
    let status: DealStatus
    
    enum CodingKeys: String, CodingKey {
        case id
        case companyName = "company_name"
        case logoUrl = "logo_url"
        case stage
        case signalScore = "signal_score"
        case action
        case minCheck = "min_check"
        case deadline
        case status
    }
}

// MARK: - Full Deal (for detail view)
struct Deal: Identifiable, Codable {
    let id: String
    let dealHash: String
    let companyName: String
    let logoUrl: String?
    let website: String?
    let industry: String?
    let stage: String?
    let terms: InvestmentTerms?
    let verdict: InvestmentVerdict?
    let emailId: String
    let emailSubject: String
    let emailFrom: String
    let emailSnippet: String
    let status: DealStatus
    
    enum CodingKeys: String, CodingKey {
        case id
        case dealHash = "deal_hash"
        case companyName = "company_name"
        case logoUrl = "logo_url"
        case website, industry, stage, terms, verdict
        case emailId = "email_id"
        case emailSubject = "email_subject"
        case emailFrom = "email_from"
        case emailSnippet = "email_snippet"
        case status
    }
    
    var signalScore: Int { verdict?.signalScore ?? 0 }
}

// MARK: - Investment Terms
struct InvestmentTerms: Codable {
    let minCheck: Int?
    let valuation: String?
    let roundType: String?
    let leadInvestor: String?
    let carry: String?
    let proRata: Bool?
    let deadline: String?
    
    enum CodingKeys: String, CodingKey {
        case minCheck = "min_check"
        case valuation
        case roundType = "round_type"
        case leadInvestor = "lead_investor"
        case carry
        case proRata = "pro_rata"
        case deadline
    }
}

// MARK: - Investment Verdict
struct InvestmentVerdict: Codable {
    let signalScore: Int
    let oneLinePitch: String
    let executiveSummary: String
    let bullCase: [String]
    let bearCase: [String]
    let metrics: [DealMetric]
    let competitors: [Competitor]
    let action: ActionStatus
    
    enum CodingKeys: String, CodingKey {
        case signalScore = "signal_score"
        case oneLinePitch = "one_line_pitch"
        case executiveSummary = "executive_summary"
        case bullCase = "bull_case"
        case bearCase = "bear_case"
        case metrics, competitors, action
    }
}

// MARK: - Deal Metric
struct DealMetric: Codable, Identifiable {
    var id: String { label }
    let label: String
    let value: String
    let sentiment: String
}

// MARK: - Competitor
struct Competitor: Codable, Identifiable {
    var id: String { name }
    let name: String
    let differentiation: String
}

// MARK: - Enums
enum ActionStatus: String, Codable {
    case mustRead = "MUST READ"
    case interesting = "INTERESTING"
    case pass = "PASS"
}

enum DealStatus: String, Codable {
    case pending
    case invested
    case passed
    case saved
}

// MARK: - WebSocket Notification
struct NewDealNotification: Codable {
    let type: String
    let data: NotificationData
}

struct NotificationData: Codable {
    let count: Int
    let deals: [DealSummary]
}
