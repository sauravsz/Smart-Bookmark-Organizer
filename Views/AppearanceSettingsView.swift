import SwiftUI

struct AppearanceSettingsView: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Mode", selection: $theme.appearanceMode) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
            }

            Section("Accent style") {
                Picker("Mode", selection: $theme.accentMode) {
                    Text("Presets").tag(AccentMode.preset)
                    Text("Custom").tag(AccentMode.custom)
                }
                .pickerStyle(.segmented)
            }

            if theme.accentMode == .preset {
                Section("Presets") {
                    HStack {
                        ForEach(AccentPreset.allCases) { preset in
                            Button {
                                theme.selectedPreset = preset
                            } label: {
                                Circle()
                                    .fill(preset.color)
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(Color.primary.opacity(theme.selectedPreset == preset ? 0.7 : 0), lineWidth: 2)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section("Custom accent") {
                    ColorPicker("Accent color", selection: $theme.customColor, supportsOpacity: false)

                    HStack {
                        Text("Hex")
#if os(macOS)
                        TextField("#RRGGBB", text: $theme.customHex)
#else
                        TextField("#RRGGBB", text: $theme.customHex)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.asciiCapable)
#endif
                    }
                }
            }
        }
        .navigationTitle("Appearance")
    }
}

