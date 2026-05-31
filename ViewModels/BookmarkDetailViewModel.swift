import Foundation

@MainActor
final class BookmarkDetailViewModel: ObservableObject {
    @Published private(set) var bookmark: Bookmark
    @Published var isAnalyzing: Bool = false
    @Published var errorMessage: String?

    private let store: BookmarkStoreProtocol
    private let providerRegistry: AIProviderRegistryProtocol
    private let maxAttempts = 3

    init(bookmark: Bookmark, store: BookmarkStoreProtocol, providerRegistry: AIProviderRegistryProtocol) {
        self.bookmark = bookmark
        self.store = store
        self.providerRegistry = providerRegistry
    }

    func updateNotes(_ notes: String) {
        bookmark.notes = notes
        store.updateBookmark(bookmark)
    }

    func updateTags(_ tags: [String]) {
        bookmark.tags = tags
        store.updateBookmark(bookmark)
    }

    func runAIAnalysis() async {
        isAnalyzing = true
        errorMessage = nil
        defer { isAnalyzing = false }

        let providers = providerRegistry.providerChain(startingWith: nil)
        guard let url = URL(string: bookmark.url) else {
            bookmark.processingState = .failed
            bookmark.processingError = "Invalid URL"
            store.updateBookmark(bookmark)
            return
        }

        bookmark.processingState = .processing
        bookmark.processingError = nil
        store.updateBookmark(bookmark)

        for attempt in 1...maxAttempts {
            bookmark.processingAttemptCount = attempt
            store.updateBookmark(bookmark)

            var analyzed = false
            var lastErrorMessage = "Unknown error"
            let webContext = await WebContextService.shared.fetchCombinedContext(for: url, existingMetadata: bookmark)

            for provider in providers {
                do {
                    let analysis = try await provider.analyze(url: url, existingMetadata: bookmark, webContext: webContext)
                    bookmark.aiSummary = analysis.summary
                    bookmark.aiTopics = analysis.topics
                    bookmark.tags = Array(Set(bookmark.tags + analysis.suggestedTags)).sorted()
                    bookmark.lastAnalyzedAt = Date()
                    bookmark.aiProviderId = provider.id
                    bookmark.processingState = .completed
                    bookmark.processingError = nil
                    store.updateBookmark(bookmark)
                    analyzed = true
                    break
                } catch {
                    lastErrorMessage = error.localizedDescription
                }
            }

            if analyzed {
                return
            }

            if attempt < maxAttempts {
                let delayNs = UInt64(attempt) * 500_000_000
                try? await Task.sleep(nanoseconds: delayNs)
                continue
            }

            let message = "Failed to analyze bookmark: \(lastErrorMessage)"
            bookmark.processingState = .failed
            bookmark.processingError = lastErrorMessage
            store.updateBookmark(bookmark)
            errorMessage = message
        }
    }
}

