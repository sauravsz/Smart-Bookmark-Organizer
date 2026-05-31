import SwiftUI

struct BookmarkDetailView: View {
    @StateObject var viewModel: BookmarkDetailViewModel

    @State private var notesText: String = ""
    @State private var tagsText: String = ""

    var body: some View {
        Form {
            Section("Link") {
                Text(viewModel.bookmark.title ?? viewModel.bookmark.url)
                    .font(.headline)
                Text(viewModel.bookmark.url)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Section("Notes") {
                TextEditor(text: $notesText)
                    .frame(minHeight: 80)
                    .animation(.easeInOut(duration: 0.25), value: notesText)
            }

            Section("Tags") {
                TextField("comma, separated, tags", text: $tagsText)
                    .animation(.easeInOut(duration: 0.25), value: tagsText)
            }

            Section("AI Summary") {
                if viewModel.bookmark.processingState != .none {
                    Text(statusText)
                        .font(.footnote)
                        .foregroundStyle(statusColor)
                }

                Group {
                    if let summary = viewModel.bookmark.aiSummary {
                        Text(summary)
                    } else {
                        Text("No AI summary yet.")
                            .foregroundStyle(.secondary)
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: viewModel.bookmark.aiSummary)

                if viewModel.isAnalyzing {
                    ProgressView("Analyzing…")
                        .transition(.opacity.combined(with: .scale))
                } else {
                    Button("Analyze with AI") {
                        Task {
                            await viewModel.runAIAnalysis()
                            syncLocalFields()
                        }
                    }
                    .transition(.opacity)
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .transition(.opacity)
                }
            }
        }
        .navigationTitle("Bookmark")
        .onAppear {
            notesText = viewModel.bookmark.notes ?? ""
            tagsText = viewModel.bookmark.tags.joined(separator: ", ")
        }
        .onDisappear {
            persistEdits()
        }
    }

    private func persistEdits() {
        viewModel.updateNotes(notesText)
        let tags = tagsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        viewModel.updateTags(tags)
    }

    private func syncLocalFields() {
        notesText = viewModel.bookmark.notes ?? ""
        tagsText = viewModel.bookmark.tags.joined(separator: ", ")
    }

    private var statusText: String {
        switch viewModel.bookmark.processingState {
        case .none:
            return ""
        case .queued:
            return "Queued for AI analysis"
        case .processing:
            return "Analyzing (attempt \(viewModel.bookmark.processingAttemptCount))"
        case .completed:
            return "Analysis complete"
        case .failed:
            return "Analysis failed: \(viewModel.bookmark.processingError ?? "Unknown error")"
        }
    }

    private var statusColor: Color {
        switch viewModel.bookmark.processingState {
        case .failed:
            return .red
        case .completed:
            return .green
        default:
            return .secondary
        }
    }
}

