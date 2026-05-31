import Foundation

protocol AIProvider {
    var id: String { get }
    var displayName: String { get }
    var supportsBrowsing: Bool { get }

    func analyze(url: URL, existingMetadata: Bookmark?, webContext: String?) async throws -> AIAnalysis
}

