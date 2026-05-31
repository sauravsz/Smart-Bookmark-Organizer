import Foundation

protocol WebContextSource {
    func fetchContext(for url: URL, existingMetadata: Bookmark?) async throws -> String
}

struct JinaWebContextSource: WebContextSource {
    private let httpClient = HTTPClient()
    private let apiKey: String

    init?(apiKey: String?) {
        guard let key = apiKey, !key.isEmpty else { return nil }
        self.apiKey = key
    }

    func fetchContext(for url: URL, existingMetadata: Bookmark?) async throws -> String {
        // Query Jina search API for information related to this URL.
        let endpoint = URL(string: "https://api.jina.ai/v1/search")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        struct JinaRequest: Encodable {
            let query: String
            let size: Int
        }

        let queryText = "Information and context about this URL: \(url.absoluteString)"
        let body = JinaRequest(query: queryText, size: 3)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await httpClient.send(request: request)
        guard (200..<300).contains(response.statusCode) else {
            throw HTTPError.badStatusCode(response.statusCode, data)
        }

        // Shape of response can vary; we conservatively try to pull out text snippets.
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let results = json["results"] as? [[String: Any]] {
            let texts: [String] = results.compactMap { $0["text"] as? String }
            if !texts.isEmpty {
                return texts.joined(separator: "\n\n")
            }
        }

        return ""
    }
}

struct TavilyWebContextSource: WebContextSource {
    private let httpClient = HTTPClient()
    private let apiKey: String

    init?(apiKey: String?) {
        guard let key = apiKey, !key.isEmpty else { return nil }
        self.apiKey = key
    }

    func fetchContext(for url: URL, existingMetadata: Bookmark?) async throws -> String {
        let endpoint = URL(string: "https://api.tavily.com/search")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        struct TavilyRequest: Encodable {
            let api_key: String
            let query: String
            let max_results: Int
        }

        let queryText = "Information and context about this URL: \(url.absoluteString)"
        let body = TavilyRequest(api_key: apiKey, query: queryText, max_results: 5)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await httpClient.send(request: request)
        guard (200..<300).contains(response.statusCode) else {
            throw HTTPError.badStatusCode(response.statusCode, data)
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let results = json["results"] as? [[String: Any]] {
            let texts: [String] = results.compactMap { $0["content"] as? String ?? $0["snippet"] as? String }
            if !texts.isEmpty {
                return texts.joined(separator: "\n\n")
            }
        }

        return ""
    }
}

final class WebContextService {
    static let shared = WebContextService()

    private init() {}

    func buildSources() -> [WebContextSource] {
        var sources: [WebContextSource] = []
        let jinaKey = KeychainStore.shared.string(forKey: "jina_api_key")
        let tavilyKey = KeychainStore.shared.string(forKey: "tavily_api_key")

        if let jina = JinaWebContextSource(apiKey: jinaKey) {
            sources.append(jina)
        }
        if let tavily = TavilyWebContextSource(apiKey: tavilyKey) {
            sources.append(tavily)
        }
        return sources
    }

    func fetchCombinedContext(for url: URL, existingMetadata: Bookmark?) async -> String? {
        let sources = buildSources()
        guard !sources.isEmpty else { return nil }

        var parts: [String] = []
        for source in sources {
            do {
                let context = try await source.fetchContext(for: url, existingMetadata: existingMetadata)
                if !context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    parts.append(context)
                }
            } catch {
                continue
            }
        }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: "\n\n---\n\n")
    }
}

