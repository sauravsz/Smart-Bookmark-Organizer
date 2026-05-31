import Foundation

struct AIAnalysis: Hashable {
    var summary: String
    var bulletPoints: [String]
    var topics: [String]
    var suggestedTags: [String]
    var readingTimeMinutes: Int?
}

