import Foundation

struct BookmarkImportRow {
    var url: String
    var title: String?
    var notes: String?
    var tags: [String]
}

enum BookmarkImportError: Error {
    case unsupportedFormat
    case invalidData
}

struct BookmarkImportService {
    static func importFile(at url: URL, into store: BookmarkStore) async throws -> [Bookmark] {
        let data = try Data(contentsOf: url)
        let ext = url.pathExtension.lowercased()

        let rows: [BookmarkImportRow]
        switch ext {
        case "json":
            rows = try parseJSON(data: data)
        case "csv":
            rows = try parseCSV(data: data)
        default:
            throw BookmarkImportError.unsupportedFormat
        }

        return await MainActor.run {
            var added: [Bookmark] = []
            var existingNormalized = Set(store.bookmarks.compactMap { URLNormalizer.normalize($0.url) })

            for row in rows {
                guard let normalized = URLNormalizer.normalize(row.url) else { continue }
                if existingNormalized.contains(normalized) {
                    continue
                }

                let bookmark = store.addBookmark(
                    url: normalized,
                    title: row.title,
                    notes: row.notes,
                    tags: row.tags
                )
                var queued = bookmark
                queued.processingState = .queued
                queued.processingError = nil
                queued.processingAttemptCount = 0
                store.updateBookmark(queued)
                added.append(queued)
                existingNormalized.insert(normalized)
            }
            return added
        }
    }

    private static func parseJSON(data: Data) throws -> [BookmarkImportRow] {
        // Expected formats:
        // 1) [{ "url": "...", "title": "...", "notes": "...", "tags": ["a","b"] }, ...]
        // 2) { "bookmarks": [ { ... } ] }
        struct JSONRow: Decodable {
            var url: String
            var title: String?
            var notes: String?
            var tags: [String]?
        }

        if let array = try? JSONDecoder().decode([JSONRow].self, from: data) {
            return array.map {
                BookmarkImportRow(
                    url: $0.url,
                    title: $0.title,
                    notes: $0.notes,
                    tags: $0.tags ?? []
                )
            }
        }

        struct Wrapper: Decodable {
            var bookmarks: [JSONRow]
        }

        if let wrapper = try? JSONDecoder().decode(Wrapper.self, from: data) {
            return wrapper.bookmarks.map {
                BookmarkImportRow(
                    url: $0.url,
                    title: $0.title,
                    notes: $0.notes,
                    tags: $0.tags ?? []
                )
            }
        }

        throw BookmarkImportError.invalidData
    }

    static func parseCSV(data: Data) throws -> [BookmarkImportRow] {
        guard let text = String(data: data, encoding: .utf8) else {
            throw BookmarkImportError.invalidData
        }

        let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard let headerLine = lines.first else {
            return []
        }

        let headers = parseCSVLine(headerLine)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

        func index(of key: String) -> Int? {
            headers.firstIndex(of: key)
        }

        let urlIndex = index(of: "url")
        let titleIndex = index(of: "title")
        let notesIndex = index(of: "notes")
        let tagsIndex = index(of: "tags")

        var rows: [BookmarkImportRow] = []

        for line in lines.dropFirst() {
            let columns = parseCSVLine(line).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            guard let urlIndex, urlIndex < columns.count else { continue }

            let url = columns[urlIndex]
            let title = titleIndex.flatMap { $0 < columns.count ? columns[$0] : nil }
            let notes = notesIndex.flatMap { $0 < columns.count ? columns[$0] : nil }
            let tagsString = tagsIndex.flatMap { $0 < columns.count ? columns[$0] : nil }
            let tags = tagsString?
                .split(separator: ";")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? []

            rows.append(
                BookmarkImportRow(
                    url: url,
                    title: title,
                    notes: notes,
                    tags: tags
                )
            )
        }

        return rows
    }

    static func parseCSVLine(_ line: String) -> [String] {
        var result: [String] = []
        var current = ""
        var isInQuotes = false
        var index = line.startIndex

        while index < line.endIndex {
            let char = line[index]

            if char == "\"" {
                let next = line.index(after: index)
                if isInQuotes, next < line.endIndex, line[next] == "\"" {
                    current.append("\"")
                    index = next
                } else {
                    isInQuotes.toggle()
                }
            } else if char == ",", !isInQuotes {
                result.append(current)
                current = ""
            } else {
                current.append(char)
            }

            index = line.index(after: index)
        }

        result.append(current)
        return result
    }
}

