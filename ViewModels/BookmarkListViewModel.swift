import Foundation

@MainActor
final class BookmarkListViewModel: ObservableObject {
    enum ProcessingFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case failed = "Failed"

        var id: String { rawValue }
    }

    @Published var searchText: String = ""
    @Published var selectedFolderId: UUID?
    @Published var selectedTag: String?
    @Published var selectedProcessingFilter: ProcessingFilter = .all

    @Published private(set) var filteredBookmarks: [Bookmark] = []
    @Published private(set) var allFolders: [Folder] = []
    @Published private(set) var allTags: [String] = []
    @Published private(set) var isQueuePaused: Bool = false
    @Published private(set) var isQueueRunning: Bool = false
    @Published private(set) var queuedBookmarkCount: Int = 0

    var failedBookmarkCount: Int {
        store.bookmarks.filter { $0.processingState == .failed }.count
    }

    private let store: BookmarkStoreProtocol
    private let maxProcessingAttempts = 3
    private var processingQueue: [Bookmark] = []
    private var queueProviders: [AIProvider] = []
    private var processingTask: Task<Void, Never>?
    private var queueCancelled: Bool = false

    init(store: BookmarkStoreProtocol) {
        self.store = store
        applyFilter()
    }

    func applyFilter() {
        allFolders = store.folders
        allTags = Array(
            Set(
                store.bookmarks
                    .flatMap { $0.tags }
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()

        var results = store.bookmarks

        if let folderId = selectedFolderId {
            results = results.filter { $0.folderId == folderId }
        }

        if let tag = selectedTag, !tag.isEmpty {
            results = results.filter { $0.tags.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame }) }
        }

        if selectedProcessingFilter == .failed {
            results = results.filter { $0.processingState == .failed }
        }

        if !searchText.isEmpty {
            let query = searchText.lowercased()
            results = results.filter { bookmark in
                if bookmark.title?.lowercased().contains(query) == true { return true }
                if bookmark.notes?.lowercased().contains(query) == true { return true }
                if bookmark.aiSummary?.lowercased().contains(query) == true { return true }
                if bookmark.tags.contains(where: { $0.lowercased().contains(query) }) { return true }
                return false
            }
        }

        filteredBookmarks = results
    }

    func addBookmark(urlString: String, folderId: UUID? = nil, tags: [String] = []) {
        guard let normalized = URLNormalizer.normalize(urlString), !hasBookmark(withNormalizedURL: normalized) else {
            return
        }
        var bookmark = store.addBookmark(url: normalized, title: nil, notes: nil, folderId: folderId, tags: [])
        bookmark.tags = cleanedTags(tags)
        bookmark.processingState = .queued
        bookmark.processingError = nil
        bookmark.processingAttemptCount = 0
        store.updateBookmark(bookmark)
        applyFilter()
    }

    func addBookmarks(urlStrings: [String], folderId: UUID? = nil, tags: [String] = []) {
        let existing = normalizedExistingURLs()
        let cleaned = cleanedTags(tags)
        for normalized in URLNormalizer.deduplicatedNormalized(urlStrings) where !existing.contains(normalized) {
            var bookmark = store.addBookmark(url: normalized, title: nil, notes: nil, folderId: folderId, tags: [])
            bookmark.tags = cleaned
            bookmark.processingState = .queued
            bookmark.processingError = nil
            bookmark.processingAttemptCount = 0
            store.updateBookmark(bookmark)
        }
        applyFilter()
    }

    func addAndProcessBookmarks(urlStrings: [String], providers: [AIProvider], folderId: UUID? = nil, tags: [String] = []) async {
        let existing = normalizedExistingURLs()
        let cleaned = cleanedTags(tags)
        var added: [Bookmark] = []
        for normalized in URLNormalizer.deduplicatedNormalized(urlStrings) where !existing.contains(normalized) {
            var bookmark = store.addBookmark(url: normalized, title: nil, notes: nil, folderId: folderId, tags: [])
            bookmark.tags = cleaned
            bookmark.processingState = .queued
            bookmark.processingError = nil
            bookmark.processingAttemptCount = 0
            store.updateBookmark(bookmark)
            added.append(bookmark)
        }
        applyFilter()
        enqueueBookmarksForProcessing(added, providers: providers)
    }

    func processBookmarks(_ bookmarks: [Bookmark], with providers: [AIProvider]) async {
        enqueueBookmarksForProcessing(bookmarks, providers: providers)
    }

    func retryFailedBookmarks(with providers: [AIProvider]) async {
        let failed = store.bookmarks.filter { $0.processingState == .failed }
        guard !failed.isEmpty else { return }

        var queued: [Bookmark] = []
        for bookmark in failed {
            var updated = bookmark
            updated.processingState = .queued
            updated.processingError = nil
            updated.processingAttemptCount = 0
            store.updateBookmark(updated)
            queued.append(updated)
        }

        applyFilter()
        enqueueBookmarksForProcessing(queued, providers: providers)
    }

    func pauseProcessingQueue() {
        isQueuePaused = true
    }

    func resumeProcessingQueue() {
        isQueuePaused = false
        startQueueIfNeeded(defaultProviders: queueProviders)
    }

    func cancelProcessingQueue() {
        queueCancelled = true
        processingTask?.cancel()
        processingTask = nil
        isQueueRunning = false

        for bookmark in processingQueue {
            var updated = bookmark
            if updated.processingState == .queued || updated.processingState == .processing {
                updated.processingState = .none
                updated.processingError = "Cancelled"
                store.updateBookmark(updated)
            }
        }
        processingQueue.removeAll()
        queuedBookmarkCount = 0
        applyFilter()
    }

    private func enqueueBookmarksForProcessing(_ bookmarks: [Bookmark], providers: [AIProvider]) {
        guard !bookmarks.isEmpty else { return }
        if !providers.isEmpty {
            queueProviders = providers
        }

        let queuedIDs = Set(processingQueue.map { $0.id })
        for bookmark in bookmarks where !queuedIDs.contains(bookmark.id) {
            processingQueue.append(bookmark)
        }

        queuedBookmarkCount = processingQueue.count
        startQueueIfNeeded(defaultProviders: providers)
    }

    private func startQueueIfNeeded(defaultProviders: [AIProvider]) {
        guard processingTask == nil else { return }

        processingTask = Task { [weak self] in
            guard let self else { return }
            await self.runQueue(defaultProviders: defaultProviders)
        }
    }

    private func runQueue(defaultProviders: [AIProvider]) async {
        isQueueRunning = true
        queueCancelled = false
        defer {
            isQueueRunning = false
            processingTask = nil
            queuedBookmarkCount = processingQueue.count
        }

        while !processingQueue.isEmpty {
            if queueCancelled || Task.isCancelled {
                return
            }

            if isQueuePaused {
                try? await Task.sleep(nanoseconds: 250_000_000)
                continue
            }

            let bookmark = processingQueue.removeFirst()
            queuedBookmarkCount = processingQueue.count
            let providers = defaultProviders.isEmpty ? queueProviders : defaultProviders
            await processBookmark(bookmark, with: providers)
            applyFilter()
        }
    }

    private func processBookmark(_ bookmark: Bookmark, with providers: [AIProvider]) async {
        guard let url = URL(string: bookmark.url) else { return }
        guard !providers.isEmpty else { return }

        var updatedBookmark = bookmark
        updatedBookmark.processingState = .processing
        updatedBookmark.processingError = nil
        store.updateBookmark(updatedBookmark)

        var lastErrorMessage = "Unknown error"
        for attempt in 1...maxProcessingAttempts {
            updatedBookmark.processingAttemptCount = attempt
            store.updateBookmark(updatedBookmark)

            let webContext = await WebContextService.shared.fetchCombinedContext(for: url, existingMetadata: updatedBookmark)

            var analyzed = false
            for provider in providers {
                do {
                    let analysis = try await provider.analyze(url: url, existingMetadata: updatedBookmark, webContext: webContext)
                    updatedBookmark.aiSummary = analysis.summary
                    updatedBookmark.aiTopics = analysis.topics
                    updatedBookmark.tags = Array(Set(updatedBookmark.tags + analysis.suggestedTags)).sorted()
                    updatedBookmark.lastAnalyzedAt = Date()
                    updatedBookmark.aiProviderId = provider.id
                    updatedBookmark.processingState = .completed
                    updatedBookmark.processingError = nil
                    store.updateBookmark(updatedBookmark)
                    analyzed = true
                    break
                } catch {
                    lastErrorMessage = error.localizedDescription
                }
            }

            if analyzed {
                return
            }

            if attempt < maxProcessingAttempts {
                let delayNs = UInt64(attempt) * 500_000_000
                try? await Task.sleep(nanoseconds: delayNs)
            }
        }

        updatedBookmark.processingState = .failed
        updatedBookmark.processingError = lastErrorMessage
        store.updateBookmark(updatedBookmark)
    }

    private func normalizedExistingURLs() -> Set<String> {
        Set(store.bookmarks.compactMap { URLNormalizer.normalize($0.url) })
    }

    private func hasBookmark(withNormalizedURL normalizedURL: String) -> Bool {
        normalizedExistingURLs().contains(normalizedURL)
    }

    private func cleanedTags(_ tags: [String]) -> [String] {
        Array(
            Set(
                tags
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()
    }

    func deleteBookmark(id: UUID) {
        store.deleteBookmark(id: id)
        applyFilter()
    }

    func refreshFromCloudKit() async {
        await store.refreshFromCloudKit()
        applyFilter()
    }

    func importSharedURLsIfAvailable(
        appGroupID: String = "group.com.yourcompany.osmo",
        queueKey: String = "shared_urls_queue",
        providers: [AIProvider]
    ) async {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupID) else {
            return
        }

        let queuedURLs = sharedDefaults.stringArray(forKey: queueKey) ?? []
        guard !queuedURLs.isEmpty else { return }

        sharedDefaults.set([], forKey: queueKey)
        await addAndProcessBookmarks(urlStrings: queuedURLs, providers: providers)
    }
}

