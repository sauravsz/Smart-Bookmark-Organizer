import SwiftUI

enum TypographyStyle: String, CaseIterable, Identifiable {
    case helvetica
    case sfRounded
    case avenir

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .helvetica: return "Helvetica Neue"
        case .sfRounded: return "SF Rounded"
        case .avenir: return "Avenir Next"
        }
    }
}

final class TypographyManager: ObservableObject {
    @Published var style: TypographyStyle {
        didSet {
            UserDefaults.standard.set(style.rawValue, forKey: storageKey)
        }
    }

    private let storageKey = "typography_style"

    init() {
        if let stored = UserDefaults.standard.string(forKey: storageKey),
           let s = TypographyStyle(rawValue: stored) {
            style = s
        } else {
            style = .helvetica
        }
    }

    func titleFont() -> Font {
        switch style {
        case .helvetica:
            return .custom("HelveticaNeue-Bold", size: 20)
        case .sfRounded:
            return .system(size: 20, weight: .semibold, design: .rounded)
        case .avenir:
            return .custom("AvenirNext-DemiBold", size: 20)
        }
    }

    func bodyFont() -> Font {
        switch style {
        case .helvetica:
            return .custom("HelveticaNeue", size: 15)
        case .sfRounded:
            return .system(size: 15, weight: .regular, design: .rounded)
        case .avenir:
            return .custom("AvenirNext-Regular", size: 15)
        }
    }

    func captionFont() -> Font {
        switch style {
        case .helvetica:
            return .custom("HelveticaNeue-Medium", size: 12)
        case .sfRounded:
            return .system(size: 12, weight: .medium, design: .rounded)
        case .avenir:
            return .custom("AvenirNext-Medium", size: 12)
        }
    }
}

struct TypographyEnvironmentKey: EnvironmentKey {
    static let defaultValue = TypographyManager()
}

extension EnvironmentValues {
    var typography: TypographyManager {
        get { self[TypographyEnvironmentKey.self] }
        set { self[TypographyEnvironmentKey.self] = newValue }
    }
}

extension View {
    func typographyEnvironment(_ manager: TypographyManager) -> some View {
        environment(\.typography, manager)
    }
}

