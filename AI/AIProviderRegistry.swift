import Foundation

final class AIProviderRegistry: ObservableObject, AIProviderRegistryProtocol {
    @Published var fallbackEnabled: Bool {
        didSet {
            UserDefaults.standard.set(fallbackEnabled, forKey: "provider_fallback_enabled")
        }
    }

    @Published var currentProviderID: String = "openai" {
        didSet {
            currentProvider = makeProvider(for: currentProviderID)
        }
    }

    @Published private(set) var currentProvider: AIProvider

    init() {
        self.fallbackEnabled = UserDefaults.standard.object(forKey: "provider_fallback_enabled") as? Bool ?? true
        self.currentProvider = OpenAIProvider()
    }

    var availableProviderIDs: [String] {
        ["openai", "groq", "cerebras", "gemini"]
    }

    func makeProvider(for id: String) -> AIProvider {
        switch id {
        case "openai":
            return OpenAIProvider()
        case "groq":
            return GroqProvider()
        case "cerebras":
            return CerebrasProvider()
        case "gemini":
            return GeminiProvider()
        default:
            return OpenAIProvider()
        }
    }

    func providerChain(startingWith providerID: String? = nil) -> [AIProvider] {
        let primaryID = providerID ?? currentProviderID
        if !fallbackEnabled {
            return [makeProvider(for: primaryID)]
        }

        var ids = [primaryID]
        ids.append(contentsOf: availableProviderIDs.filter { $0 != primaryID })
        return ids.map { makeProvider(for: $0) }
    }
}

