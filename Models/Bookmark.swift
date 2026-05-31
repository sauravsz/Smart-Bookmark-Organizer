import Foundation

enum BookmarkProcessingState: String, Codable, Hashable {
    case none
    case queued
    case processing
    case completed
    case failed
}

struct Bookmark: Identifiable, Hashable {
    let id: UUID
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

    init(
        id: UUID = UUID(),
        url: String,
        title: String? = nil,
        notes: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        folderId: UUID? = nil,
        tags: [String] = [],
        aiSummary: String? = nil,
        aiTopics: [String] = [],
        aiSentimentScore: Double? = nil,
        lastAnalyzedAt: Date? = nil,
        aiProviderId: String? = nil,
        processingState: BookmarkProcessingState = .none,
        processingError: String? = nil,
        processingAttemptCount: Int = 0
    ) {
        self.id = id
        self.url = url
        self.title = title
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.folderId = folderId
        self.tags = tags
        self.aiSummary = aiSummary
        self.aiTopics = aiTopics
        self.aiSentimentScore = aiSentimentScore
        self.lastAnalyzedAt = lastAnalyzedAt
        self.aiProviderId = aiProviderId
        self.processingState = processingState
        self.processingError = processingError
        self.processingAttemptCount = processingAttemptCount
    }
}

