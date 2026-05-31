import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.typography) private var typography
    @StateObject var viewModel: SettingsViewModel

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    NavigationLink {
                        AppearanceSettingsView()
                    } label: {
                        Label("Appearance", systemImage: "paintpalette")
                    }

                    NavigationLink {
                        TypographySettingsView()
                    } label: {
                        Label("Typography", systemImage: "textformat")
                    }
                } header: {
                    Text("General")
                }

                Section {
                    NavigationLink {
                        ProviderSettingsView(viewModel: viewModel)
                    } label: {
                        Label("AI & Providers", systemImage: "brain.head.profile")
                    }
                } header: {
                    Text("Intelligence")
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}


