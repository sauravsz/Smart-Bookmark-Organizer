import SwiftUI

struct TypographySettingsView: View {
    @Environment(\.typography) private var typography

    var body: some View {
        Form {
            Section("Font style") {
                Picker("Style", selection: binding) {
                    ForEach(TypographyStyle.allCases) { style in
                        Text(style.displayName).tag(style)
                    }
                }
            }
        }
        .navigationTitle("Typography")
    }

    private var binding: Binding<TypographyStyle> {
        Binding(
            get: { typography.style },
            set: { typography.style = $0 }
        )
    }
}

