import Foundation

@MainActor
protocol AIProviderRegistryProtocol: AnyObject {
    var currentProviderID: String { get set }
    var currentProvider: AIProvider { get }
    var fallbackEnabled: Bool { get set }

    func makeProvider(for id: String) -> AIProvider
    func providerChain(startingWith providerID: String?) -> [AIProvider]
}
