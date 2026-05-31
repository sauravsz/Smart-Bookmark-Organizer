import Testing
@testable import Osmo

struct URLNormalizerTests {
    @Test
    func normalizeAddsSchemeAndLowercasesHost() {
        let normalized = URLNormalizer.normalize("Example.com/Path")
        #expect(normalized == "https://example.com/Path")
    }

    @Test
    func normalizeRemovesTrackingParameters() {
        let normalized = URLNormalizer.normalize("https://example.com/article?utm_source=x&fbclid=y&id=42")
        #expect(normalized == "https://example.com/article?id=42")
    }

    @Test
    func normalizeRejectsUnsupportedScheme() {
        #expect(URLNormalizer.normalize("ftp://example.com/file") == nil)
    }

    @Test
    func deduplicatedNormalizedPreservesOrder() {
        let values = [
            "https://example.com",
            "example.com",
            "https://example.com?utm_source=ads",
            "https://swift.org"
        ]

        let deduped = URLNormalizer.deduplicatedNormalized(values)
        #expect(deduped == ["https://example.com", "https://swift.org"])
    }
}
