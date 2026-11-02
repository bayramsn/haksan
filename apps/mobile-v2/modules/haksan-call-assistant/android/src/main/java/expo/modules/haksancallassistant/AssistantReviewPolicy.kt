package expo.modules.haksancallassistant

/** Pure boundary policy shared by shortcut and future external review callers. */
internal object AssistantReviewPolicy {
  fun canEnqueue(enabled: Boolean, scope: String, deviceLocked: Boolean): Boolean =
    enabled && scope.isNotBlank() && scope.length <= 512 && !deviceLocked

  /** Kotlin String.length counts UTF-16 code units, matching the JS payload bound.
   * Reject oversized input rather than silently changing a spoken command. */
  fun command(input: String): String? {
    if (input.length > 2000) return null
    return input.trim().takeIf { it.isNotEmpty() }
  }
}
