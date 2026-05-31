import Foundation

struct HTTPClient {
    func send(request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPError.invalidResponse
        }
        return (data, httpResponse)
    }
}

enum HTTPError: Error {
    case invalidResponse
    case badStatusCode(Int, Data)
}

