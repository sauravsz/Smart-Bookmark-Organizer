This folder scaffolds a macOS share extension for Osmo.

What is included:
- `Info.plist` template for a share services extension target.
- `ShareViewController.swift` that collects shared URLs and appends them to an App Group queue (`shared_urls_queue`).

To finish wiring:
1. Add a new Share Extension target in Xcode.
2. Point its sources to this folder and set `INFOPLIST_FILE` to `ShareExtension/Info.plist`.
3. Configure an App Group (replace `group.com.yourcompany.osmo`).
4. In the main app launch flow, drain `shared_urls_queue` and pass URLs to `BookmarkListViewModel.addAndProcessBookmarks`.
