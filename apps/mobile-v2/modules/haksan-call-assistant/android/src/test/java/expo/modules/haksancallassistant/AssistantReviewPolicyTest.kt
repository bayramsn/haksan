package expo.modules.haksancallassistant

import org.junit.Assert.*
import org.junit.Test

class AssistantReviewPolicyTest {
  @Test fun consentAndActiveBoundedScopeAreRequired() {
    assertTrue(AssistantReviewPolicy.canEnqueue(true, "tenant:user", false))
    assertFalse(AssistantReviewPolicy.canEnqueue(false, "tenant:user", false))
    assertFalse(AssistantReviewPolicy.canEnqueue(true, "", false))
    assertFalse(AssistantReviewPolicy.canEnqueue(true, " \t\n", false))
    assertTrue(AssistantReviewPolicy.canEnqueue(true, "s".repeat(512), false))
    assertFalse(AssistantReviewPolicy.canEnqueue(true, "s".repeat(513), false))
  }

  @Test fun lockedDeviceCannotEnqueueEvenWithConsentAndScope() {
    assertFalse(AssistantReviewPolicy.canEnqueue(true, "tenant:user", true))
    assertFalse(AssistantReviewPolicy.canEnqueue(false, "", true))
  }

  @Test fun commandsAreNonblankAndBoundedWithoutTruncation() {
    assertNull(AssistantReviewPolicy.command(""))
    assertNull(AssistantReviewPolicy.command(" \n\t"))
    assertEquals("ABC Makina için fırsat hazırla", AssistantReviewPolicy.command("  ABC Makina için fırsat hazırla  "))
    assertEquals("a".repeat(2000), AssistantReviewPolicy.command("a".repeat(2000)))
    assertNull(AssistantReviewPolicy.command("a".repeat(2001)))
    // One supplementary Unicode character occupies two UTF-16 units.
    assertNotNull(AssistantReviewPolicy.command("\uD83D\uDE00".repeat(1000)))
    assertNull(AssistantReviewPolicy.command("\uD83D\uDE00".repeat(1001)))
  }
}
