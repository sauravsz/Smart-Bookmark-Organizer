import Foundation

struct URLNormalizer {
    private static let removableTrackingParams: Set<String> = [
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "utm_id", "utm_name", "utm_cid", "utm_reader", "utm_referrer",
        "gclid", "fbclid", "mc_cid", "mc_eid", "igshid"
    ]

    static func normalize(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let candidate = ensureSchemeIfMissing(trimmed)
        guard var components = URLComponents(string: candidate) else { return nil }

        let scheme = (components.scheme ?? "").lowercased()
        guard scheme == "http" || scheme == "https" else { return nil }
        guard let host = components.host, !host.isEmpty else { return nil }

        components.scheme = scheme
        components.host = host.lowercased()
        components.fragment = nil

        if let items = components.queryItems, !items.isEmpty {
            let filtered = items.filter { item in
                !removableTrackingParams.contains(item.name.lowercased())
            }
            components.queryItems = filtered.isEmpty ? nil : filtered
        }

        var normalized = components.string?.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized?.hasSuffix("/") == true,
           let path = components.percentEncodedPath.removingPercentEncoding,
           (path.isEmpty || path == "/"),
           components.queryItems == nil {
            normalized?.removeLast()
        }

        return normalized
    }

    static func deduplicatedNormalized(_ rawURLs: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []

        for raw in rawURLs {
            guard let normalized = normalize(raw), !seen.contains(normalized) else { continue }
            seen.insert(normalized)
            result.append(normalized)
        }
        return result
    }

    private static func ensureSchemeIfMissing(_ value: String) -> String {
        if value.range(of: #"^[a-zA-Z][a-zA-Z0-9+.-]*://"#, options: .regularExpression) != nil {
            return value
        }
        return "https://\(value)"
    }
}
