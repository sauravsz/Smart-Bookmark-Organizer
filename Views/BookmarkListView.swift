import SwiftUI
import UniformTypeIdentifiers
#if canImport(AppKit)
import AppKit
#endif

struct BookmarkListView: View {
    @EnvironmentObject private var bookmarkStore: BookmarkStore
    @EnvironmentObject private var aiProviderRegistry: AIProviderRegistry

    @StateObject private var viewModel: BookmarkListViewModel
    @State private var showingAddSheet = false
    @State private var showingSettings = false
    @State private var useGridLayout = false
    @State private var showingImporter = false
    @State private var importErrorMessage: String?

    init(store: BookmarkStore) {
        _viewModel = StateObject(wrappedValue: BookmarkListViewModel(store: store))
    }

    var body: some View {
        NavigationStack {
            contentView
                .navigationTitle("Osmo - The AI Bookmark Organiser")
                .searchable(text: $viewModel.searchText)
                .onChange(of: viewModel.searchText) { _ in
                    viewModel.applyFilter()
                }
                .onChange(of: viewModel.selectedFolderId) { _ in
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.9)) {
                        viewModel.applyFilter()
                    }
                }
                .onChange(of: viewModel.selectedTag) { _ in
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.9)) {
                        viewModel.applyFilter()
                    }
                }
                .onChange(of: viewModel.selectedProcessingFilter) { _ in
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.9)) {
                        viewModel.applyFilter()
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .automatic) {
                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        HStack {
                            if viewModel.failedBookmarkCount > 0 {
                                Button {
                                    Task {
                                        await viewModel.retryFailedBookmarks(with: aiProviderRegistry.providerChain())
                                    }
                                } label: {
                                    Image(systemName: "arrow.clockwise.circle")
                                }
                                .help("Retry failed analyses")
                            }

                            if viewModel.isQueueRunning {
                                Button {
                                    if viewModel.isQueuePaused {
                                        viewModel.resumeProcessingQueue()
                                    } else {
                                        viewModel.pauseProcessingQueue()
                                    }
                                } label: {
                                    Image(systemName: viewModel.isQueuePaused ? "play.circle" : "pause.circle")
                                }
                                .help(viewModel.isQueuePaused ? "Resume processing queue" : "Pause processing queue")

                                Button {
                                    viewModel.cancelProcessingQueue()
                                } label: {
                                    Image(systemName: "xmark.circle")
                                }
                                .help("Cancel processing queue")
                            }

                            Button {
                                showingImporter = true
                            } label: {
                                Image(systemName: "square.and.arrow.down")
                            }

                            Button {
                                withAnimation(.spring(response: 0.45, dampingFraction: 0.9)) {
                                    useGridLayout.toggle()
                                }
                            } label: {
                                Image(systemName: useGridLayout ? "square.grid.2x2" : "list.bullet")
                            }

                            Button {
                                showingAddSheet = true
                            } label: {
                                Image(systemName: "plus")
                            }
                        }
                    }
                }
                .navigationDestination(for: Bookmark.self) { bookmark in
                    BookmarkDetailView(
                        viewModel: BookmarkDetailViewModel(
                            bookmark: bookmark,
                            store: bookmarkStore,
                            providerRegistry: aiProviderRegistry
                        )
                    )
                }
                .task {
                    await viewModel.refreshFromCloudKit()
                    await viewModel.importSharedURLsIfAvailable(
                        providers: aiProviderRegistry.providerChain()
                    )
                }
                .sheet(isPresented: $showingAddSheet) {
                    AddBookmarkView { urls, tags in
                        Task {
                            await viewModel.addAndProcessBookmarks(
                                urlStrings: urls,
                                providers: aiProviderRegistry.providerChain(),
                                tags: tags
                            )
                        }
                    }
                }
                .fileImporter(
                    isPresented: $showingImporter,
                    allowedContentTypes: [UTType.json, UTType.commaSeparatedText]
                ) { result in
                    switch result {
                    case .success(let url):
                        Task {
                            do {
                                let imported = try await BookmarkImportService.importFile(at: url, into: bookmarkStore)
                                await viewModel.processBookmarks(imported, with: aiProviderRegistry.providerChain())
                            } catch {
                                await MainActor.run {
                                    importErrorMessage = "Failed to import: \(error.localizedDescription)"
                                }
                            }
                        }
                    case .failure(let error):
                        importErrorMessage = "Failed to select file: \(error.localizedDescription)"
                    }
                }
                .alert("Import error", isPresented: .constant(importErrorMessage != nil)) {
                    Button("OK") {
                        importErrorMessage = nil
                    }
                } message: {
                    Text(importErrorMessage ?? "")
                }
                .sheet(isPresented: $showingSettings) {
                    SettingsView(
                        viewModel: SettingsViewModel(providerRegistry: aiProviderRegistry)
                    )
                }
        }
    }

    @ViewBuilder
    private var contentView: some View {
        if viewModel.filteredBookmarks.isEmpty && viewModel.searchText.isEmpty && viewModel.selectedFolderId == nil && viewModel.selectedTag == nil {
            EmptyStateView(
                systemImage: "bookmark",
                title: "No bookmarks yet",
                message: "Save links from Safari, paste a URL, or import a JSON/CSV file to get started.",
                actionTitle: "Add bookmark"
            ) {
                showingAddSheet = true
            }
        } else if viewModel.filteredBookmarks.isEmpty {
            EmptyStateView(
                systemImage: "magnifyingglass",
                title: "No results",
                message: "Try different keywords or clear filters.",
                actionTitle: "Clear filters"
            ) {
                viewModel.searchText = ""
                viewModel.selectedFolderId = nil
                viewModel.selectedTag = nil
                viewModel.applyFilter()
            }
        } else {
            List {
                if !viewModel.allFolders.isEmpty {
                    Section("Folders") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                Button {
                                    viewModel.selectedFolderId = nil
                                    withAnimation(.spring(response: 0.4, dampingFraction: 0.9)) {
                                        viewModel.applyFilter()
                                    }
                                } label: {
                                    Text("All")
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(viewModel.selectedFolderId == nil ? Color.accentColor.opacity(0.2) : Color.clear)
                                        .clipShape(Capsule())
                                }

                                ForEach(viewModel.allFolders) { folder in
                                    Button {
                                        viewModel.selectedFolderId = folder.id
                                        withAnimation(.spring(response: 0.4, dampingFraction: 0.9)) {
                                            viewModel.applyFilter()
                                        }
                                    } label: {
                                        Text(folder.name)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(viewModel.selectedFolderId == folder.id ? Color.accentColor.opacity(0.2) : Color.clear)
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                    }
                }

                if !viewModel.allTags.isEmpty {
                    Section("Tags") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                Button {
                                    viewModel.selectedTag = nil
                                    withAnimation(.spring(response: 0.4, dampingFraction: 0.9)) {
                                        viewModel.applyFilter()
                                    }
                                } label: {
                                    Text("All")
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(viewModel.selectedTag == nil ? Color.accentColor.opacity(0.2) : Color.clear)
                                        .clipShape(Capsule())
                                }

                                ForEach(viewModel.allTags, id: \.self) { tag in
                                    Button {
                                        viewModel.selectedTag = tag
                                        withAnimation(.spring(response: 0.4, dampingFraction: 0.9)) {
                                            viewModel.applyFilter()
                                        }
                                    } label: {
                                        Text(tag)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(viewModel.selectedTag == tag ? Color.accentColor.opacity(0.2) : Color.clear)
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                    }
                }

                if viewModel.failedBookmarkCount > 0 {
                    Section("State") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(BookmarkListViewModel.ProcessingFilter.allCases) { filter in
                                    Button {
                                        viewModel.selectedProcessingFilter = filter
                                    } label: {
                                        Text(filter.rawValue)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(viewModel.selectedProcessingFilter == filter ? Color.accentColor.opacity(0.2) : Color.clear)
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                    }
                }

                Section {
                    if useGridLayout {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                            ForEach(viewModel.filteredBookmarks) { bookmark in
                                NavigationLink(value: bookmark) {
                                    BookmarkGridItemView(bookmark: bookmark)
                                        .contentShape(RoundedRectangle(cornerRadius: 12))
                                        .scaleEffect(0.98)
                                        .animation(.spring(response: 0.4, dampingFraction: 0.9), value: viewModel.filteredBookmarks)
                                }
                            }
                        }
                    } else {
                        ForEach(viewModel.filteredBookmarks) { bookmark in
                            NavigationLink(value: bookmark) {
                                BookmarkRowView(bookmark: bookmark)
                                    .contentShape(Rectangle())
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                let id = viewModel.filteredBookmarks[index].id
                                viewModel.deleteBookmark(id: id)
                            }
                        }
                    }
                }
            }
        }
    }
}

struct BookmarkRowView: View {
    let bookmark: Bookmark

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(bookmark.title ?? bookmark.url)
                .font(.headline)
                .lineLimit(1)
            if let summary = bookmark.aiSummary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            } else if let notes = bookmark.notes, !notes.isEmpty {
                Text(notes)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if !bookmark.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(bookmark.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            if bookmark.processingState != .none {
                Text(processingStatusText)
                    .font(.caption2)
                    .foregroundStyle(processingStatusColor)
            }
        }
    }

    private var processingStatusText: String {
        switch bookmark.processingState {
        case .none:
            return ""
        case .queued:
            return "Queued for AI analysis"
        case .processing:
            return "Analyzing (attempt \(bookmark.processingAttemptCount))"
        case .completed:
            return "AI analysis complete"
        case .failed:
            return "Analysis failed: \(bookmark.processingError ?? "Unknown error")"
        }
    }

    private var processingStatusColor: Color {
        switch bookmark.processingState {
        case .failed:
            return .red
        case .completed:
            return .green
        default:
            return .secondary
        }
    }
}

struct BookmarkGridItemView: View {
    let bookmark: Bookmark

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(bookmark.title ?? bookmark.url)
                .font(.headline)
                .lineLimit(2)
            if let summary = bookmark.aiSummary {
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(4)
            }

            if !bookmark.tags.isEmpty {
                HStack {
                    ForEach(bookmark.tags.prefix(3), id: \.self) { tag in
                        Text(tag)
                            .font(.caption2)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }

            if bookmark.processingState != .none {
                Text(shortProcessingStatus)
                    .font(.caption2)
                    .foregroundStyle(shortStatusColor)
                    .lineLimit(1)
            }
        }
        .padding(8)
        .background(gridBackgroundColor)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var shortProcessingStatus: String {
        switch bookmark.processingState {
        case .none:
            return ""
        case .queued:
            return "Queued"
        case .processing:
            return "Analyzing"
        case .completed:
            return "Analyzed"
        case .failed:
            return "Failed"
        }
    }

    private var shortStatusColor: Color {
        switch bookmark.processingState {
        case .failed:
            return .red
        case .completed:
            return .green
        default:
            return .secondary
        }
    }

    private var gridBackgroundColor: Color {
        #if canImport(AppKit)
        return Color(nsColor: .controlBackgroundColor)
        #else
        return Color(.secondarySystemBackground)
        #endif
    }
}

struct AddBookmarkView: View {
    enum InputMode: String, CaseIterable, Identifiable {
        case single = "Single Link"
        case multiple = "Multiple Links"

        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var inputMode: InputMode = .single
    @State private var urlText: String = ""
    @State private var multipleLinksText: String = ""
    @State private var tagsText: String = ""

    let onAdd: ([String], [String]) -> Void

    private var parsedURLs: [String] {
        switch inputMode {
        case .single:
            let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? [] : [trimmed]
        case .multiple:
            return parseURLs(from: multipleLinksText)
        }
    }

    private var canAdd: Bool {
        !parsedURLs.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Picker("Input", selection: $inputMode) {
                    ForEach(InputMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)

                if inputMode == .single {
                    TextField("https://example.com", text: $urlText)
                } else {
                    TextEditor(text: $multipleLinksText)
                        .frame(minHeight: 160)
                    Text("Paste one link per line. Bullets and numbered lists are supported.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                TextField("Tags (comma separated)", text: $tagsText)
            }
            .navigationTitle("Add Bookmark")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        guard canAdd else { return }
                        onAdd(parsedURLs, parsedTags)
                        dismiss()
                    }
                    .disabled(!canAdd)
                }
            }
        }
    }

    private func parseURLs(from text: String) -> [String] {
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var urls: [String] = []
        var seen = Set<String>()

        for line in lines {
            var candidate = line
            candidate = candidate.replacingOccurrences(
                of: #"^([-*•]|\d+[.)])\s+"#,
                with: "",
                options: .regularExpression
            )

            if let range = candidate.range(of: #"https?://\S+"#, options: .regularExpression) {
                candidate = String(candidate[range])
            }

            candidate = candidate.trimmingCharacters(in: CharacterSet(charactersIn: "<>\"'.,;"))

            if !candidate.isEmpty && !seen.contains(candidate) {
                seen.insert(candidate)
                urls.append(candidate)
            }
        }

        return urls
    }

    private var parsedTags: [String] {
        Array(
            Set(
                tagsText
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()
    }
}
