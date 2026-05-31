import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var selectedProviderID: String {
        didSet {
            providerRegistry.currentProviderID = selectedProviderID
            UserDefaults.standard.set(selectedProviderID, forKey: "selected_provider_id")
        }
    }

    @Published var openAIKey: String {
        didSet {
            KeychainStore.shared.set(openAIKey, forKey: "openai_api_key")
        }
    }

    @Published var groqKey: String {
        didSet {
            KeychainStore.shared.set(groqKey, forKey: "groq_api_key")
        }
    }

    @Published var cerebrasKey: String {
        didSet {
            KeychainStore.shared.set(cerebrasKey, forKey: "cerebras_api_key")
        }
    }

    @Published var geminiKey: String {
        didSet {
            KeychainStore.shared.set(geminiKey, forKey: "gemini_api_key")
        }
    }

    @Published var jinaKey: String {
        didSet {
            KeychainStore.shared.set(jinaKey, forKey: "jina_api_key")
        }
    }

    @Published var tavilyKey: String {
        didSet {
            KeychainStore.shared.set(tavilyKey, forKey: "tavily_api_key")
        }
    }

    @Published var fallbackEnabled: Bool {
        didSet {
            providerRegistry.fallbackEnabled = fallbackEnabled
        }
    }

    private let providerRegistry: AIProviderRegistryProtocol

    init(providerRegistry: AIProviderRegistryProtocol) {
        self.providerRegistry = providerRegistry
        let storedProvider = UserDefaults.standard.string(forKey: "selected_provider_id") ?? "openai"
        self.selectedProviderID = storedProvider
        self.openAIKey = KeychainStore.shared.string(forKey: "openai_api_key") ?? ""
        self.groqKey = KeychainStore.shared.string(forKey: "groq_api_key") ?? ""
        self.cerebrasKey = KeychainStore.shared.string(forKey: "cerebras_api_key") ?? ""
        self.geminiKey = KeychainStore.shared.string(forKey: "gemini_api_key") ?? ""
        self.jinaKey = KeychainStore.shared.string(forKey: "jina_api_key") ?? ""
        self.tavilyKey = KeychainStore.shared.string(forKey: "tavily_api_key") ?? ""
        self.fallbackEnabled = providerRegistry.fallbackEnabled
        providerRegistry.currentProviderID = storedProvider
    }
}

