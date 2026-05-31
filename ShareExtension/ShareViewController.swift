import Cocoa
import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool {
        true
    }

    override func didSelectPost() {
        let groupDefaults = UserDefaults(suiteName: "group.com.yourcompany.osmo")
        let key = "shared_urls_queue"
        var collected: [String] = []

        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        let dispatchGroup = DispatchGroup()

        for item in items {
            item.attachments?.forEach { provider in
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    dispatchGroup.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { object, _ in
                        defer { dispatchGroup.leave() }
                        if let url = object as? URL {
                            collected.append(url.absoluteString)
                        } else if let data = object as? Data,
                                  let text = String(data: data, encoding: .utf8) {
                            collected.append(text)
                        }
                    }
                }
            }
        }

        dispatchGroup.notify(queue: .main) {
            let existing = groupDefaults?.stringArray(forKey: key) ?? []
            groupDefaults?.set(existing + collected, forKey: key)
            self.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        []
    }
}
