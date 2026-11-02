import Foundation

/// Kept free of persistence so consent and JS string bounds can be tested directly.
enum AssistantHandoffPolicy {
  static func activeScope(enabled: Bool, scope: String?) -> String? {
    guard enabled, let scope, !scope.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          scope.utf16.count <= 512 else { return nil }
    return scope
  }

  static func boundedText(_ text: String, limit: Int) -> String {
    var units = 0
    let scalars = text.unicodeScalars.prefix { scalar in
      let count = scalar.value > 0xFFFF ? 2 : 1
      guard units + count <= limit else { return false }
      units += count
      return true
    }
    return String(String.UnicodeScalarView(scalars))
  }
}
