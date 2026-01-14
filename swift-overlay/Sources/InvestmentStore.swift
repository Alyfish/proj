/**
 * Investment Store - WebSocket Connection & State Management
 * Connects to Python backend (port 3003) using Sidecar pattern
 * Uses ObservableObject for macOS 13 compatibility
 */

import SwiftUI
import Combine

class InvestmentStore: ObservableObject {
    // MARK: - State
    @Published var deals: [DealSummary] = []
    @Published var selectedDeal: Deal?
    @Published var showNotification: Bool = false
    @Published var latestDeals: [DealSummary] = []
    @Published var isLoading: Bool = false
    @Published var isConnected: Bool = false
    
    private var webSocketTask: URLSessionWebSocketTask?
    private let baseURL = "http://localhost:3003"
    
    // MARK: - WebSocket Connection
    func connect() {
        guard let url = URL(string: "ws://localhost:3003/ws") else { return }
        
        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        
        DispatchQueue.main.async {
            self.isConnected = true
        }
        
        receiveMessage()
        print("📡 [InvestmentStore] WebSocket connected")
    }
    
    func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        DispatchQueue.main.async {
            self.isConnected = false
        }
        print("📡 [InvestmentStore] WebSocket disconnected")
    }
    
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleIncomingJSON(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleIncomingJSON(text)
                    }
                @unknown default:
                    break
                }
                self?.receiveMessage() // Keep listening
                
            case .failure(let error):
                print("📡 [InvestmentStore] WS Error: \(error)")
                DispatchQueue.main.async {
                    self?.isConnected = false
                }
                // Reconnect after delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    self?.connect()
                }
            }
        }
    }
    
    private func handleIncomingJSON(_ json: String) {
        guard let data = json.data(using: .utf8) else { return }
        
        do {
            let notification = try JSONDecoder().decode(NewDealNotification.self, from: data)
            
            if notification.type == "new_opportunities" {
                DispatchQueue.main.async {
                    // Add new deals to the front
                    self.latestDeals = notification.data.deals
                    self.deals.insert(contentsOf: notification.data.deals, at: 0)
                    self.showNotification = true
                    
                    print("📡 [InvestmentStore] Received \(notification.data.count) new deals")
                    
                    // Auto-hide toast after 8s
                    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                        self.showNotification = false
                    }
                }
            }
        } catch {
            print("📡 [InvestmentStore] JSON parse error: \(error)")
        }
    }
    
    // MARK: - HTTP API Calls
    func loadDeals(status: String? = nil) {
        isLoading = true
        
        var urlString = "\(baseURL)/opportunities"
        if let status = status, !status.isEmpty {
            urlString += "?status=\(status)"
        }
        
        guard let url = URL(string: urlString) else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            DispatchQueue.main.async {
                self?.isLoading = false
            }
            
            if let error = error {
                print("📡 [InvestmentStore] Fetch error: \(error)")
                return
            }
            
            guard let data = data else { return }
            
            do {
                let fetchedDeals = try JSONDecoder().decode([DealSummary].self, from: data)
                DispatchQueue.main.async {
                    self?.deals = fetchedDeals
                }
            } catch {
                print("📡 [InvestmentStore] Decode error: \(error)")
            }
        }.resume()
    }
    
    func loadDeal(id: String) {
        guard let url = URL(string: "\(baseURL)/opportunities/\(id)") else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            if let error = error {
                print("📡 [InvestmentStore] Fetch deal error: \(error)")
                return
            }
            
            guard let data = data else { return }
            
            do {
                let deal = try JSONDecoder().decode(Deal.self, from: data)
                DispatchQueue.main.async {
                    self?.selectedDeal = deal
                }
            } catch {
                print("📡 [InvestmentStore] Decode deal error: \(error)")
            }
        }.resume()
    }
    
    func updateStatus(dealId: String, status: DealStatus) {
        guard let url = URL(string: "\(baseURL)/opportunities/\(dealId)/status") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["status": status.rawValue])
        
        URLSession.shared.dataTask(with: request) { [weak self] _, _, error in
            if let error = error {
                print("📡 [InvestmentStore] Update status error: \(error)")
                return
            }
            self?.loadDeals()
        }.resume()
    }
    
    func triggerEmailScan() {
        guard let url = URL(string: "\(baseURL)/check-emails") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error = error {
                print("📡 [InvestmentStore] Email scan error: \(error)")
                return
            }
            print("📡 [InvestmentStore] Email scan triggered")
        }.resume()
    }
}
