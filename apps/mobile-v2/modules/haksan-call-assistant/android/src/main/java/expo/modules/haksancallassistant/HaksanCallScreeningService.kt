package expo.modules.haksancallassistant

import android.telecom.Call
import android.telecom.CallScreeningService

class HaksanCallScreeningService : CallScreeningService() {
  override fun onScreenCall(details: Call.Details) {
    // Never block a real call. Response precedes all local IO, well inside 5s.
    if (details.callDirection == Call.Details.DIRECTION_INCOMING) respondToCall(details, CallResponse.Builder().setDisallowCall(false).setRejectCall(false).setSilenceCall(false).setSkipCallLog(false).setSkipNotification(false).build())
    try {
      val handle = details.handle ?: return
      if (handle.scheme != "tel") return
      AssistantStore(this).rememberScreened(handle.schemeSpecificPart, if (details.callDirection == Call.Details.DIRECTION_INCOMING) "inbound" else "outbound", System.currentTimeMillis())
    } catch (_: Exception) { /* Locked/corrupt store fails closed; never delay telecom. */ }
  }
}
