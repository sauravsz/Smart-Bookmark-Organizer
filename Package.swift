// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "Osmo",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "Osmo", targets: ["Osmo"])
    ],
    targets: [
        .executableTarget(
            name: "Osmo",
            path: ".",
            exclude: [
                "Info.plist",
                "Osmo.xcconfig",
                "project.yml",
                ".DS_Store",
                "ShareExtension",
                "Tests"
            ],
            sources: [
                "OsmoApp.swift",
                "AI",
                "Import",
                "Models",
                "Security",
                "Stores",
                "Theme",
                "ViewModels",
                "Views"
            ]
        ),
        .testTarget(
            name: "OsmoTests",
            dependencies: ["Osmo"],
            path: "Tests"
        )
    ]
)
