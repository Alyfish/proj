/**
 * Investment UI Views - SwiftUI Components
 * DealCardView, SignalBadge, and DealToastView
 * Compatible with macOS 13+
 */

import SwiftUI

// MARK: - Signal Badge (Score Ring)
struct SignalBadge: View {
    let score: Int
    
    private var color: Color {
        if score >= 80 { return Color(hex: "4ADE80") }  // Green
        if score >= 60 { return Color(hex: "FACC15") }  // Yellow
        return Color(hex: "F87171")  // Red
    }
    
    var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(Color.white.opacity(0.1), lineWidth: 3)
            
            // Progress ring
            Circle()
                .trim(from: 0, to: CGFloat(score) / 100)
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            
            // Score text
            Text("\(score)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(color)
        }
        .frame(width: 36, height: 36)
    }
}

// MARK: - Deal Card View
struct DealCardView: View {
    let deal: DealSummary
    var onTap: () -> Void = {}
    
    private var actionColor: Color {
        switch deal.action {
        case "MUST READ": return Color(hex: "4ADE80")
        case "INTERESTING": return Color(hex: "FACC15")
        case "PASS": return Color(hex: "F87171")
        default: return Color.white.opacity(0.5)
        }
    }
    
    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 16) {
                // Logo
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.1))
                    
                    if let logoUrl = deal.logoUrl, let url = URL(string: logoUrl) {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Text(String(deal.companyName.prefix(1)))
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    } else {
                        Text(String(deal.companyName.prefix(1)))
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1)))
                
                // Content
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(deal.companyName)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                        
                        Spacer()
                        
                        if let score = deal.signalScore {
                            SignalBadge(score: score)
                        }
                    }
                    
                    if let stage = deal.stage {
                        Text(stage.uppercased())
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4))
                    }
                    
                    // Action badge
                    if let action = deal.action {
                        Text(action)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(actionColor)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(actionColor.opacity(0.2))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .padding(.top, 4)
                    }
                    
                    // Footer info
                    HStack(spacing: 12) {
                        if let minCheck = deal.minCheck {
                            Text("min: $\(minCheck >= 1000 ? "\(minCheck/1000)k" : "\(minCheck)")")
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.4))
                        }
                        
                        if let deadline = deal.deadline {
                            Text("⏰ \(deadline)")
                                .font(.system(size: 10))
                                .foregroundColor(Color(hex: "F87171"))
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(16)
            .sentexGlass()
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Deal Toast View (Floating Notification)
struct DealToastView: View {
    let deals: [DealSummary]
    var onTap: () -> Void = {}
    var onDismiss: () -> Void = {}
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Icon
                Image(systemName: "bolt.fill")
                    .foregroundColor(.yellow)
                    .font(.system(size: 14))
                
                // Text
                VStack(alignment: .leading, spacing: 2) {
                    Text("Deal Flow")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white.opacity(0.6))
                    
                    Text("\(deals.count) New Opportunit\(deals.count == 1 ? "y" : "ies")")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                }
                
                Spacer()
                
                // Deal pills
                HStack(spacing: 4) {
                    ForEach(deals.prefix(2)) { deal in
                        Text("\(deal.companyName) (\(deal.signalScore ?? 0))")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(hex: "4ADE80"))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(hex: "4ADE80").opacity(0.2))
                            .clipShape(Capsule())
                    }
                    
                    if deals.count > 2 {
                        Text("+\(deals.count - 2)")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
                
                // Dismiss
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                        .padding(6)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: 400)
            .sentexGlass(radius: 30)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Investment Panel View
struct InvestmentPanelView: View {
    @ObservedObject var store: InvestmentStore
    @State private var selectedFilter: String = "pending"
    var onClose: () -> Void = {}
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "dollarsign.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: "4ADE80"))
                
                Text("Deal Flow")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                
                Spacer()
                
                Button(action: {
                    store.triggerEmailScan()
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.6))
                }
                .buttonStyle(.plain)
                .padding(.trailing, 8)
                
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.6))
                }
                .buttonStyle(.plain)
            }
            .padding()
            .background(Color.black.opacity(0.3))
            
            // Filter tabs
            HStack(spacing: 8) {
                ForEach(["pending", "saved", "all"], id: \.self) { filter in
                    Button(action: {
                        selectedFilter = filter
                        store.loadDeals(status: filter == "all" ? nil : filter)
                    }) {
                        Text(filter.capitalized)
                            .font(.system(size: 12, weight: selectedFilter == filter ? .semibold : .regular))
                            .foregroundColor(selectedFilter == filter ? .white : .white.opacity(0.5))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selectedFilter == filter ? Color.white.opacity(0.15) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            
            Divider().background(Color.white.opacity(0.1))
            
            // Deal list
            if store.isLoading {
                Spacer()
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                Spacer()
            } else if store.deals.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Text("📭")
                        .font(.system(size: 48))
                    Text("No opportunities yet")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.6))
                    Text("Check back later or scan emails")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.4))
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(store.deals) { deal in
                            DealCardView(deal: deal) {
                                store.loadDeal(id: deal.id)
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .sentexGlass(radius: 20, intensity: 0.5)
        .onAppear {
            store.loadDeals(status: selectedFilter)
        }
    }
}
