import SwiftUI
#if canImport(AppKit)
import AppKit
#endif

enum AccentPreset: String, CaseIterable, Identifiable {
    case red, orange, yellow, green, blue, indigo, purple

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .red: return .red
        case .orange: return .orange
        case .yellow: return .yellow
        case .green: return .green
        case .blue: return .blue
        case .indigo: return .indigo
        case .purple: return .purple
        }
    }
}

enum AccentMode: String {
    case preset
    case custom
}

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark
    case pitchBlack

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        case .pitchBlack: return "Pitch Black"
        }
    }
}

final class ThemeManager: ObservableObject {
    @Published var appearanceMode: AppearanceMode {
        didSet { persist() }
    }

    @Published var accentMode: AccentMode {
        didSet { persist() }
    }

    @Published var selectedPreset: AccentPreset {
        didSet { persist() }
    }

    @Published var customColor: Color {
        didSet { persist() }
    }

    @Published var customHex: String {
        didSet {
            if let color = Color(hex: customHex) {
                customColor = color
            }
            persist()
        }
    }

    var accentColor: Color {
        switch accentMode {
        case .preset:
            return selectedPreset.color
        case .custom:
            return customColor
        }
    }

    private let defaults = UserDefaults.standard
    private let appearanceModeKey = "theme_appearance_mode"
    private let accentModeKey = "theme_accent_mode"
    private let presetKey = "theme_accent_preset"
    private let customHexKey = "theme_custom_hex"

    init() {
        if let storedAppearance = defaults.string(forKey: appearanceModeKey),
           let mode = AppearanceMode(rawValue: storedAppearance) {
            appearanceMode = mode
        } else {
            appearanceMode = .system
        }

        if let storedMode = defaults.string(forKey: accentModeKey),
           let mode = AccentMode(rawValue: storedMode) {
            accentMode = mode
        } else {
            accentMode = .preset
        }

        if let storedPreset = defaults.string(forKey: presetKey),
           let preset = AccentPreset(rawValue: storedPreset) {
            selectedPreset = preset
        } else {
            selectedPreset = .blue
        }

        let hex = defaults.string(forKey: customHexKey) ?? "#007AFF"
        customHex = hex
        customColor = Color(hex: hex) ?? .blue
    }

    var colorScheme: ColorScheme? {
        switch appearanceMode {
        case .system:
            return nil
        case .light:
            return .light
        case .dark, .pitchBlack:
            return .dark
        }
    }

    var rootBackgroundColor: Color {
        switch appearanceMode {
        case .system, .light:
            #if canImport(AppKit)
            return Color(nsColor: .windowBackgroundColor)
            #else
            return Color(.systemGroupedBackground)
            #endif
        case .dark:
            return Color(.black).opacity(0.93)
        case .pitchBlack:
            return Color.black
        }
    }

    private func persist() {
        defaults.set(appearanceMode.rawValue, forKey: appearanceModeKey)
        defaults.set(accentMode.rawValue, forKey: accentModeKey)
        defaults.set(selectedPreset.rawValue, forKey: presetKey)
        defaults.set(customHex, forKey: customHexKey)
    }
}

extension Color {
    init?(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") {
            cleaned.removeFirst()
        }
        guard cleaned.count == 6,
              let value = Int(cleaned, radix: 16) else {
            return nil
        }
        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0
        self = Color(red: r, green: g, blue: b)
    }

    func toHex() -> String? {
        #if canImport(UIKit)
        let uiColor = UIColor(self)
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        guard uiColor.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        let value = (Int(r * 255) << 16) | (Int(g * 255) << 8) | Int(b * 255)
        return String(format: "#%06X", value)
        #else
        return nil
        #endif
    }
}

