import Testing
@testable import Osmo

struct BookmarkImportServiceTests {
    @Test
    func parseCSVLineHandlesQuotedCommas() {
        let columns = BookmarkImportService.parseCSVLine("\"https://example.com\",\"A, title\",\"notes, with comma\",\"tag1;tag2\"")

        #expect(columns.count == 4)
        #expect(columns[0] == "https://example.com")
        #expect(columns[1] == "A, title")
        #expect(columns[2] == "notes, with comma")
        #expect(columns[3] == "tag1;tag2")
    }

    @Test
    func parseCSVBuildsRowsWithTags() throws {
        let csv = "url,title,notes,tags\n\"https://example.com\",\"A, title\",\"N,1\",\"swift;ai\"\n"
        let data = Data(csv.utf8)

        let rows = try BookmarkImportService.parseCSV(data: data)

        #expect(rows.count == 1)
        #expect(rows[0].url == "https://example.com")
        #expect(rows[0].title == "A, title")
        #expect(rows[0].notes == "N,1")
        #expect(rows[0].tags == ["swift", "ai"])
    }
}
