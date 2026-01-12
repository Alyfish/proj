// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SidebarOverlay",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "SidebarOverlay",
            path: "Sources",
            exclude: ["Info.plist"]
        )
    ]
)
