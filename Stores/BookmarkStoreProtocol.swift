import Foundation

@MainActor
protocol BookmarkStoreProtocol: AnyObject {
    var bookmarks: [Bookmark] { get }
    var folders: [Folder] { get }

    @discardableResult
    func addBookmark(url: String, title: String?, notes: String?, folderId: UUID?, tags: [String]) -> Bookmark
    func updateBookmark(_ bookmark: Bookmark)
    func deleteBookmark(id: UUID)
    func refreshFromCloudKit() async
}
