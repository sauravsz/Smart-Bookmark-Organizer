import SwiftUI
import CloudKit

@main
struct OsmoTheAIBookmarkOrganiserApp: App {
    @StateObject private var bookmarkStore = BookmarkStore()
    @StateObject private var aiProviderRegistry = AIProviderRegistry()
    @StateObject private var themeManager = ThemeManager()
    @StateObject private var typographyManager = TypographyManager()

    var body: some Scene {
        WindowGroup {
            BookmarkListView(store: bookmarkStore)
                .environmentObject(bookmarkStore)
                .environmentObject(aiProviderRegistry)
                .environmentObject(themeManager)
                .typographyEnvironment(typographyManager)
                .tint(themeManager.accentColor)
                .preferredColorScheme(themeManager.colorScheme)
                .background(themeManager.rootBackgroundColor.ignoresSafeArea())
        }
    }
}


