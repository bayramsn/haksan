import Foundation
import CryptoKit
import Security

/// An app-private encrypted handoff, never a URL payload or auth credential.
enum AssistantVault {
  static let lock = NSRecursiveLock()
  static let service = "com.haksan.mobileapp.assistant"
  static let ttl: Double = 30 * 60 * 1000
  static let allowed = Set(["post_call", "after_call", "open_today", "find_opportunities", "new_opportunity", "add_note", "create_task", "new_service_ticket"])
  static var file: URL {
    get throws {
      let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      return root.appendingPathComponent("haksan-assistant.sealed")
    }
  }
  static func key() throws -> SymmetricKey {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "aes", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecSuccess, let data = result as? Data { return SymmetricKey(data: data) }
    guard status == errSecItemNotFound else { throw NSError(domain: service, code: Int(status)) }
    let newKey = SymmetricKey(size: .bits256)
    let data = newKey.withUnsafeBytes { Data($0) }
    let insert: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "aes", kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    let inserted = SecItemAdd(insert as CFDictionary, nil)
    guard inserted == errSecSuccess else { throw NSError(domain: service, code: Int(inserted)) }
    return newKey
  }
  static func read() throws -> [String: Any] {
    let url = try file
    if !FileManager.default.fileExists(atPath: url.path) { return [:] }
    let data = try AES.GCM.open(AES.GCM.SealedBox(combined: Data(contentsOf: url)), using: key())
    guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NSError(domain: service, code: 1) }
    return result
  }
  static func write(_ value: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: value)
    guard let sealed = try AES.GCM.seal(data, using: key()).combined else { throw NSError(domain: service, code: 2) }
    var url = try file
    try sealed.write(to: url, options: [.atomic, .completeFileProtection])
    var resource = URLResourceValues(); resource.isExcludedFromBackup = true
    try url.setResourceValues(resource)
  }
  static func clear() throws {
    lock.lock(); defer { lock.unlock() }
    let url = try file
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }
  static func activateScope(_ scope: String?) throws {
    lock.lock(); defer { lock.unlock() }
    guard let scope else { try clear(); return }
    guard !scope.isEmpty, scope.count <= 512 else { throw NSError(domain: service, code: 3) }
    let value = try read()
    if value["scope"] as? String != scope { try clear(); try write(["scope": scope, "enabled": false]) }
  }
  static func setEnabled(_ enabled: Bool, scope: String?) throws {
    lock.lock(); defer { lock.unlock() }
    if !enabled { try clear(); return }
    guard let scope, !scope.isEmpty, scope.count <= 512 else { throw NSError(domain: service, code: 3) }
    var value = try read()
    if value["scope"] as? String != scope { value = [:] }
    value["scope"] = scope; value["enabled"] = true
    try write(value)
  }
  static func fresh(_ value: [String: Any]) -> [[String: Any]] {
    let now = Date().timeIntervalSince1970 * 1000
    return ((value["pending"] as? [[String: Any]]) ?? []).filter { row in
      guard let date = row["createdAt"] as? Double, let action = row["action"] as? String else { return false }
      return now - date >= 0 && now - date < ttl && allowed.contains(action)
    }.suffix(20).map { $0 }
  }
  static func enqueue(action: String, utterance: String? = nil, command: String? = nil, query: String? = nil, dueAt: Date? = nil) throws -> String {
    lock.lock(); defer { lock.unlock() }
    guard allowed.contains(action), action != "post_call" else { throw NSError(domain: service, code: 4) }
    var value = try read(); var pending = fresh(value)
    let id = UUID().uuidString
    var row: [String: Any] = ["id": id, "action": action, "createdAt": Date().timeIntervalSince1970 * 1000, "scope": value["scope"] as? String ?? ""]
    if let utterance, !utterance.isEmpty { row["text"] = String(utterance.prefix(2000)) }
    if let command = command?.trimmingCharacters(in: .whitespacesAndNewlines), !command.isEmpty { row["command"] = String(command.prefix(2000)) }
    if let query = query?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty { row["query"] = String(query.prefix(300)) }
    if let dueAt, dueAt.timeIntervalSince1970.isFinite { row["dueAt"] = ISO8601DateFormatter().string(from: dueAt) }
    pending.append(row); value["pending"] = pending; try write(value)
    NotificationCenter.default.post(name: NSNotification.Name("HaksanPendingAction"), object: nil)
    return id
  }
  static func acknowledge(_ ids: [String]) throws {
    lock.lock(); defer { lock.unlock() }
    var value = try read()
    let consumed = Set(ids)
    value["pending"] = fresh(value).filter { row in !consumed.contains(row["id"] as? String ?? "") }
    try write(value)
  }
  static func drain() throws -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return fresh(try read())
  }
}
