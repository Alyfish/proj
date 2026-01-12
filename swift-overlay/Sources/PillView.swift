import SwiftUI

struct PillView: View {
    // State for animations
    @State private var isHovering = false
    @State private var isThinking = false // Placeholder for future state
    @State private var pulse = false
    
    // Callback to expand the window
    var onExpand: () -> Void
    
    var body: some View {
        HStack(spacing: 8) {
            // Star Icon (Sparkles)
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .shadow(color: .white.opacity(0.6), radius: 4, x: 0, y: 0) // Glowy icon
            
            Text("Sentex AI")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.95))
                .tracking(0.5) // Slight letter spacing
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            ZStack {
                // 1. The "Gem" Base - Deep Charcoal/Blue Gradient Glass
                LinearGradient(
                    colors: [
                        Color(red: 0.15, green: 0.20, blue: 0.35).opacity(0.9), // Deep Translucent Blue Top
                        Color(red: 0.05, green: 0.05, blue: 0.10).opacity(0.95) // Almost Black Bottom
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                
                // 2. Subtle Noise/Texture Overlay (Optional - skipped for now, sticking to glass)
            }
        )
        // Shape
        .clipShape(Capsule())
        
        // 3. Rim Light (The "Physical" Edge)
        .overlay(
            Capsule()
                .strokeBorder(
                    LinearGradient(
                        stops: [
                            .init(color: .white.opacity(0.6), location: 0.0),   // Top Catchlight
                            .init(color: .white.opacity(0.1), location: 0.4),   // Fade sides
                            .init(color: .black.opacity(0.6), location: 1.0)    // Bottom Shadow
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1.0
                )
        )
        // 4. Inner Depth Highlight (Top Edge Glow)
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.15), lineWidth: 2)
                .blur(radius: 2)
                .offset(y: 1)
                .mask(Capsule().stroke(lineWidth: 2))
                .padding(1)
        )
        
        // 5. The "Glow" (Colored Diffuse Shadow)
        .shadow(
            color: Color(red: 0.0, green: 0.6, blue: 1.0).opacity(isHovering ? 0.5 : 0.3), // Cyan/Blue glow
            radius: isHovering ? 25 : 15,
            x: 0,
            y: 8 // Casts downwards
        )
        // 6. Secondary Ambient Glow (Wider)
        .shadow(
            color: Color(red: 0.4, green: 0.2, blue: 0.9).opacity(isHovering ? 0.3 : 0.1), // Purple ambient
            radius: 40,
            x: 0,
            y: 0
        )
        
        // Interactions & Animations
        .scaleEffect(isHovering ? 1.05 : 1.0)
        .opacity(pulse ? 1.0 : 0.9) // Heartbeat
        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: isHovering)
        .animation(.easeInOut(duration: 3).repeatForever(autoreverses: true), value: pulse)
        
        // Invisible Canvas (The Buffer Zone for Shadows)
        .padding(40) // CRITICAL: This allows shadows to spill out without clipping!
        
        .onHover { hover in
            isHovering = hover
            // Keep cursor arrow
            if hover {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
        .onTapGesture {
            onExpand()
        }
        .onAppear {
            pulse = true // Start heartbeat
        }
    }
}
