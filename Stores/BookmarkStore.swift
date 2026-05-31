import Foundation
import CloudKit
import Combine

final class BookmarkStore: ObservableObject, BookmarkStoreProtocol {
    @Published private(set) var bookmarks: [Bookmark] = []
    @Published private(set) var folders: [Folder] = []

    private let container: CKContainer
    private let database: CKDatabase
    private let cacheURL: URL
    private let defaults = UserDefaults.standard
    private let lastCloudSyncDateKey = "bookmark_store_last_cloud_sync"
    private var cancellables = Set<AnyCancellable>()

    init(
        container: CKContainer = CKContainer.default()
    ) {
        self.container = container
        self.database = container.privateCloudDatabase

        let cachesDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        self.cacheURL = cachesDirectory.appendingPathComponent("bookmarks-cache.json")

        loadFromCache()
        Task {
            await refreshFromCloudKit()
        }
    }

    // MARK: - Public API

    func addBookmark(url: String, title: String? = nil, notes: String? = nil, folderId: UUID? = nil, tags: [String] = []) -> Bookmark {
        let normalizedURL = URLNormalizer.normalize(url) ?? url.trimmingCharacters(in: .whitespacesAndNewlines)
        if let existingIndex = bookmarks.firstIndex(where: { URLNormalizer.normalize($0.url) == normalizedURL }) {
            return bookmarks[existingIndex]
        }

        let now = Date()
        let bookmark = Bookmark(
            url: normalizedURL,
            title: title,
            notes: notes,
            createdAt: now,
            updatedAt: now,
            folderId: folderId,
            tags: cleanTags(tags)
        )
        bookmarks.append(bookmark)
        saveToCache()
        Task {
            await saveBookmarkToCloudKit(bookmark)
        }
        return bookmark
    }

    func updateBookmark(_ bookmark: Bookmark) {
        guard let index = bookmarks.firstIndex(where: { $0.id == bookmark.id }) else { return }
        var updated = bookmark
        updated.updatedAt = Date()
        bookmarks[index] = updated
        saveToCache()
        Task {
            await saveBookmarkToCloudKit(updated)
        }
    }

    func deleteBookmark(id: UUID) {
        guard let index = bookmarks.firstIndex(where: { $0.id == id }) else { return }
        let bookmark = bookmarks.remove(at: index)
        saveToCache()
        Task {
            await deleteBookmarkFromCloudKit(bookmark)
        }
    }

    // MARK: - Folder API

    func addFolder(name: String, parentId: UUID? = nil) {
        let folder = Folder(name: name, parentId: parentId)
        folders.append(folder)
        saveToCache()
        Task {
            await saveFolderToCloudKit(folder)
        }
    }

    func renameFolder(id: UUID, newName: String) {
        guard let index = folders.firstIndex(where: { $0.id == id }) else { return }
        folders[index].name = newName
        let folder = folders[index]
        saveToCache()
        Task {
            await saveFolderToCloudKit(folder)
        }
    }

    func deleteFolder(id: UUID) {
        let folder = folders.first(where: { $0.id == id })
        folders.removeAll { $0.id == id }
        // Remove folder reference from bookmarks that used it.
        bookmarks = bookmarks.map { bookmark in
            var updated = bookmark
            if updated.folderId == id {
                updated.folderId = nil
            }
            return updated
        }
        saveToCache()

        if let folder {
            Task {
                await deleteFolderFromCloudKit(folder)
            }
        }
    }

    @MainActor
    func refreshFromCloudKit() async {
        do {
            let lastSync = defaults.object(forKey: lastCloudSyncDateKey) as? Date
            let fetched = try await fetchBookmarksFromCloudKit(since: lastSync)
            let fetchedFolders = try await fetchFoldersFromCloudKit()
            self.bookmarks = mergeBookmarks(local: self.bookmarks, remote: fetched)
            self.folders = mergeFolders(local: self.folders, remote: fetchedFolders)
            defaults.set(Date(), forKey: lastCloudSyncDateKey)
            saveToCache()
        } catch {
            // In v1 we silently keep local cache on error; a future version can surface this in the UI.
        }
    }

    // MARK: - Local cache

    private struct CachePayload: Codable {
        var bookmarks: [BookmarkDTO]
        var folders: [FolderDTO]
    }

    private func loadFromCache() {
        guard let data = try? Data(contentsOf: cacheURL) else { return }
        do {
            let payload = try JSONDecoder().decode(CachePayload.self, from: data)
            self.bookmarks = payload.bookmarks.map { $0.toModel() }
            self.folders = payload.folders.map { $0.toModel() }
        } catch {
            // Ignore cache decoding failures
        }
    }

    private func saveToCache() {
        let payload = CachePayload(
            bookmarks: bookmarks.map(BookmarkDTO.init(model:)),
            folders: folders.map(FolderDTO.init(model:))
        )
        do {
            let data = try JSONEncoder().encode(payload)
            try data.write(to: cacheURL, options: .atomic)
        } catch {
            // Ignore cache write failures for v1
        }
    }

    // MARK: - CloudKit

    private func bookmarkRecordID(for id: UUID) -> CKRecord.ID {
        CKRecord.ID(recordName: id.uuidString)
    }

    private func folderRecordID(for id: UUID) -> CKRecord.ID {
        CKRecord.ID(recordName: id.uuidString)
    }

    @MainActor
    private func fetchBookmarksFromCloudKit(since: Date?) async throws -> [Bookmark] {
        let predicate: NSPredicate
        if let since {
            let bufferedDate = since.addingTimeInterval(-5)
            predicate = NSPredicate(format: "updatedAt >= %@", bufferedDate as NSDate)
        } else {
            predicate = NSPredicate(value: true)
        }

        let query = CKQuery(recordType: "Bookmark", predicate: predicate)
        var fetched: [Bookmark] = []

        let (results, _) = try await database.records(matching: query)
        for result in results {
            switch result.1 {
            case .success(let record):
                if let bookmark = BookmarkDTO(record: record)?.toModel() {
                    fetched.append(bookmark)
                }
            case .failure:
                continue
            }
        }
        return fetched
    }

    private func mergeBookmarks(local: [Bookmark], remote: [Bookmark]) -> [Bookmark] {
        var mergedByID: [UUID: Bookmark] = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })

        for remoteBookmark in remote {
            if let localBookmark = mergedByID[remoteBookmark.id] {
                mergedByID[remoteBookmark.id] = localBookmark.updatedAt >= remoteBookmark.updatedAt ? localBookmark : remoteBookmark
            } else {
                mergedByID[remoteBookmark.id] = remoteBookmark
            }
        }

        var normalizedToID: [String: UUID] = [:]
        for bookmark in mergedByID.values.sorted(by: { $0.updatedAt > $1.updatedAt }) {
            guard let normalized = URLNormalizer.normalize(bookmark.url) else { continue }
            if let existingID = normalizedToID[normalized],
               let existing = mergedByID[existingID],
               existing.updatedAt < bookmark.updatedAt {
                mergedByID[existingID] = nil
                normalizedToID[normalized] = bookmark.id
            } else if normalizedToID[normalized] == nil {
                normalizedToID[normalized] = bookmark.id
            }
        }

        return mergedByID.values.sorted { $0.updatedAt > $1.updatedAt }
    }

    private func cleanTags(_ tags: [String]) -> [String] {
        Array(
            Set(
                tags
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()
    }

    private func saveBookmarkToCloudKit(_ bookmark: Bookmark) async {
        let recordID = bookmarkRecordID(for: bookmark.id)
        do {
            let record: CKRecord
            if let existing = try? await database.record(for: recordID) {
                if let serverBookmark = BookmarkDTO(record: existing)?.toModel(), serverBookmark.updatedAt > bookmark.updatedAt {
                    let resolved = resolveBookmarkConflict(local: bookmark, server: serverBookmark)
                    let mergedRecord = existing
                    BookmarkDTO(model: resolved).apply(to: mergedRecord)
                    _ = try await database.save(mergedRecord)
                    return
                }
                record = existing
            } else {
                record = CKRecord(recordType: "Bookmark", recordID: recordID)
            }
            BookmarkDTO(model: bookmark).apply(to: record)
            _ = try await database.save(record)
        } catch {
            // For v1 we do not retry; CloudKit changes will be picked up on next sync.
        }
    }

    private func resolveBookmarkConflict(local: Bookmark, server: Bookmark) -> Bookmark {
        var resolved = local
        resolved.url = URLNormalizer.normalize(local.url) ?? local.url
        resolved.title = local.title ?? server.title
        resolved.notes = (local.notes?.isEmpty == false) ? local.notes : server.notes
        resolved.folderId = local.folderId ?? server.folderId
        resolved.tags = Array(Set(local.tags + server.tags)).sorted()
        resolved.aiSummary = local.aiSummary ?? server.aiSummary
        resolved.aiTopics = Array(Set(local.aiTopics + server.aiTopics)).sorted()
        resolved.aiSentimentScore = local.aiSentimentScore ?? server.aiSentimentScore
        resolved.lastAnalyzedAt = maxDate(local.lastAnalyzedAt, server.lastAnalyzedAt)
        resolved.aiProviderId = local.aiProviderId ?? server.aiProviderId
        resolved.processingState = local.processingState == .none ? server.processingState : local.processingState
        resolved.processingError = local.processingError ?? server.processingError
        resolved.processingAttemptCount = max(local.processingAttemptCount, server.processingAttemptCount)
        resolved.updatedAt = max(local.updatedAt, server.updatedAt)
        return resolved
    }

    private func maxDate(_ lhs: Date?, _ rhs: Date?) -> Date? {
        switch (lhs, rhs) {
        case let (l?, r?):
            return max(l, r)
        case let (l?, nil):
            return l
        case let (nil, r?):
            return r
        default:
            return nil
        }
    }

    private func deleteBookmarkFromCloudKit(_ bookmark: Bookmark) async {
        let recordID = bookmarkRecordID(for: bookmark.id)
        do {
            _ = try await database.deleteRecord(withID: recordID)
        } catch {
            // Ignore for v1; a later sync can re-attempt deletion if needed.
        }
    }

    @MainActor
    private func fetchFoldersFromCloudKit() async throws -> [Folder] {
        let query = CKQuery(recordType: "Folder", predicate: NSPredicate(value: true))
        var fetched: [Folder] = []

        let (results, _) = try await database.records(matching: query)
        for result in results {
            switch result.1 {
            case .success(let record):
                if let folder = FolderDTO(record: record)?.toModel() {
                    fetched.append(folder)
                }
            case .failure:
                continue
            }
        }

        return fetched
    }

    private func saveFolderToCloudKit(_ folder: Folder) async {
        let recordID = folderRecordID(for: folder.id)
        do {
            let record: CKRecord
            if let existing = try? await database.record(for: recordID) {
                record = existing
            } else {
                record = CKRecord(recordType: "Folder", recordID: recordID)
            }
            FolderDTO(model: folder).apply(to: record)
            _ = try await database.save(record)
        } catch {
            return
        }
    }

    private func deleteFolderFromCloudKit(_ folder: Folder) async {
        let recordID = folderRecordID(for: folder.id)
        do {
            _ = try await database.deleteRecord(withID: recordID)
        } catch {
            return
        }
    }

    private func mergeFolders(local: [Folder], remote: [Folder]) -> [Folder] {
        var merged = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        for folder in remote where merged[folder.id] == nil {
            merged[folder.id] = folder
        }
        return merged.values.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

// MARK: - DTOs for cache & CloudKit

private struct BookmarkDTO: Codable {
    var id: UUID
    var url: String
    var title: String?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date
    var folderId: UUID?
    var tags: [String]
    var aiSummary: String?
    var aiTopics: [String]
    var aiSentimentScore: Double?
    var lastAnalyzedAt: Date?
    var aiProviderId: String?
    var processingState: BookmarkProcessingState
    var processingError: String?
    var processingAttemptCount: Int

    init(model: Bookmark) {
        self.id = model.id
        self.url = model.url
        self.title = model.title
        self.notes = model.notes
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.folderId = model.folderId
        self.tags = model.tags
        self.aiSummary = model.aiSummary
        self.aiTopics = model.aiTopics
        self.aiSentimentScore = model.aiSentimentScore
        self.lastAnalyzedAt = model.lastAnalyzedAt
        self.aiProviderId = model.aiProviderId
        self.processingState = model.processingState
        self.processingError = model.processingError
        self.processingAttemptCount = model.processingAttemptCount
    }

    func toModel() -> Bookmark {
        Bookmark(
            id: id,
            url: url,
            title: title,
            notes: notes,
            createdAt: createdAt,
            updatedAt: updatedAt,
            folderId: folderId,
            tags: tags,
            aiSummary: aiSummary,
            aiTopics: aiTopics,
            aiSentimentScore: aiSentimentScore,
            lastAnalyzedAt: lastAnalyzedAt,
            aiProviderId: aiProviderId,
            processingState: processingState,
            processingError: processingError,
            processingAttemptCount: processingAttemptCount
        )
    }

    init?(record: CKRecord) {
        guard
            let url = record["url"] as? String,
            let createdAt = record["createdAt"] as? Date,
            let updatedAt = record["updatedAt"] as? Date
        else {
            return nil
        }
        self.id = UUID(uuidString: record.recordID.recordName) ?? UUID()
        self.url = url
        self.title = record["title"] as? String
        self.notes = record["notes"] as? String
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        if let folderRef = record["folderRef"] as? CKRecord.Reference {
            self.folderId = UUID(uuidString: folderRef.recordID.recordName)
        } else {
            self.folderId = nil
        }
        self.tags = record["tags"] as? [String] ?? []
        self.aiSummary = record["aiSummary"] as? String
        self.aiTopics = record["aiTopics"] as? [String] ?? []
        self.aiSentimentScore = record["aiSentimentScore"] as? Double
        self.lastAnalyzedAt = record["lastAnalyzedAt"] as? Date
        self.aiProviderId = record["aiProviderId"] as? String
        if let rawState = record["processingState"] as? String,
           let state = BookmarkProcessingState(rawValue: rawState) {
            self.processingState = state
        } else {
            self.processingState = .none
        }
        self.processingError = record["processingError"] as? String
        self.processingAttemptCount = record["processingAttemptCount"] as? Int ?? 0
    }

    func apply(to record: CKRecord) {
        record["url"] = url as CKRecordValue
        record["title"] = title as CKRecordValue?
        record["notes"] = notes as CKRecordValue?
        record["createdAt"] = createdAt as CKRecordValue
        record["updatedAt"] = updatedAt as CKRecordValue
        if let folderId {
            let folderRecordID = CKRecord.ID(recordName: folderId.uuidString)
            record["folderRef"] = CKRecord.Reference(recordID: folderRecordID, action: .none)
        } else {
            record["folderRef"] = nil
        }
        record["tags"] = tags as CKRecordValue
        record["aiSummary"] = aiSummary as CKRecordValue?
        record["aiTopics"] = aiTopics as CKRecordValue
        if let aiSentimentScore {
            record["aiSentimentScore"] = aiSentimentScore as CKRecordValue
        }
        record["lastAnalyzedAt"] = lastAnalyzedAt as CKRecordValue?
        record["aiProviderId"] = aiProviderId as CKRecordValue?
        record["processingState"] = processingState.rawValue as CKRecordValue
        record["processingError"] = processingError as CKRecordValue?
        record["processingAttemptCount"] = processingAttemptCount as CKRecordValue
    }
}

private struct FolderDTO: Codable {
    var id: UUID
    var name: String
    var parentId: UUID?

    init(model: Folder) {
        self.id = model.id
        self.name = model.name
        self.parentId = model.parentId
    }

    func toModel() -> Folder {
        Folder(id: id, name: name, parentId: parentId)
    }

    init?(record: CKRecord) {
        guard let name = record["name"] as? String else {
            return nil
        }
        self.id = UUID(uuidString: record.recordID.recordName) ?? UUID()
        self.name = name
        if let parentRef = record["parentRef"] as? CKRecord.Reference {
            self.parentId = UUID(uuidString: parentRef.recordID.recordName)
        } else {
            self.parentId = nil
        }
    }

    func apply(to record: CKRecord) {
        record["name"] = name as CKRecordValue
        if let parentId {
            let parentRecordID = CKRecord.ID(recordName: parentId.uuidString)
            record["parentRef"] = CKRecord.Reference(recordID: parentRecordID, action: .none)
        } else {
            record["parentRef"] = nil
        }
    }
}

