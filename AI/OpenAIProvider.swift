import Foundation

struct OpenAIProvider: AIProvider {
    let id = "openai"
    let displayName = "OpenAI"
    let supportsBrowsing: Bool = false

    private let httpClient = HTTPClient()
    private let model: String

    init(model: String = "gpt-4.1-mini") {
        self.model = model
    }

    func analyze(url: URL, existingMetadata: Bookmark?, webContext: String?) async throws -> AIAnalysis {
        guard let apiKey = KeychainStore.shared.string(forKey: "openai_api_key") else {
            throw ProviderError.missingAPIKey
        }

        let endpoint = URL(string: "https://api.openai.com/v1/chat/completions")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let systemPrompt = """
        You are an assistant that summarizes web pages and produces structured bookmark metadata.
        Given a URL and optional existing metadata, return a concise summary, bullet points, topics, suggested tags, and estimated reading time in minutes.
        Respond ONLY as JSON with keys: summary, bulletPoints, topics, suggestedTags, readingTimeMinutes.
        """

        var userContent = "URL: \(url.absoluteString)\n"
        if let title = existingMetadata?.title {
            userContent += "Existing title: \(title)\n"
        }
        if let notes = existingMetadata?.notes {
            userContent += "User notes: \(notes)\n"
        }
        if let webContext, !webContext.isEmpty {
            userContent += "\nWeb search context:\n\(webContext)\n"
        }

        struct OpenAIRequest: Encodable {
            struct Message: Encodable {
                let role: String
                let content: String
            }

            let model: String
            let messages: [Message]
            let temperature: Double
        }

        let body = OpenAIRequest(
            model: model,
            messages: [
                .init(role: "system", content: systemPrompt),
                .init(role: "user", content: userContent)
            ],
            temperature: 0.2
        )

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await httpClient.send(request: request)
        guard (200..<300).contains(response.statusCode) else {
            throw HTTPError.badStatusCode(response.statusCode, data)
        }

        struct OpenAIResponse: Decodable {
            struct Choice: Decodable {
                struct Message: Decodable {
                    let content: String
                }
                let message: Message
            }
            let choices: [Choice]
        }

        let decoded = try JSONDecoder().decode(OpenAIResponse.self, from: data)
        guard let content = decoded.choices.first?.message.content else {
            throw ProviderError.invalidResponse
        }

        struct AnalysisJSON: Decodable {
            let summary: String
            let bulletPoints: [String]
            let topics: [String]
            let suggestedTags: [String]
            let readingTimeMinutes: Int?
        }

        guard let contentData = content.data(using: .utf8) else {
            throw ProviderError.invalidResponse
        }

        let analysisJSON = try JSONDecoder().decode(AnalysisJSON.self, from: contentData)

        return AIAnalysis(
            summary: analysisJSON.summary,
            bulletPoints: analysisJSON.bulletPoints,
            topics: analysisJSON.topics,
            suggestedTags: analysisJSON.suggestedTags,
            readingTimeMinutes: analysisJSON.readingTimeMinutes
        )
    }
}

enum ProviderError: Error {
    case missingAPIKey
    case invalidResponse
}

