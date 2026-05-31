import SwiftUI

struct ProviderSettingsView: View {
    @StateObject var viewModel: SettingsViewModel

    var body: some View {
        Form {
            Section("Default Provider") {
                Picker("Provider", selection: $viewModel.selectedProviderID) {
                    Text("OpenAI").tag("openai")
                    Text("Groq").tag("groq")
                    Text("Cerebras").tag("cerebras")
                    Text("Gemini").tag("gemini")
                }
                .pickerStyle(.segmented)

                Toggle("Auto fallback to other providers", isOn: $viewModel.fallbackEnabled)
            }

            Section("OpenAI") {
                SecureField("API Key", text: $viewModel.openAIKey)
            }

            Section("Groq") {
                SecureField("API Key", text: $viewModel.groqKey)
            }

            Section("Cerebras") {
                SecureField("API Key", text: $viewModel.cerebrasKey)
            }

            Section("Gemini") {
                SecureField("API Key", text: $viewModel.geminiKey)
            }

            Section("Web search") {
                SecureField("Jina API Key", text: $viewModel.jinaKey)
                SecureField("Tavily API Key", text: $viewModel.tavilyKey)
            }
        }
        .navigationTitle("AI & Providers")
    }
}

