package expo.modules.haksancallassistant

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.interfaces.permissions.PermissionsStatus

class HaksanCallAssistantModule : Module() {
  private val context get() = appContext.reactContext ?: error("App context unavailable")
  private var recognizer: SpeechRecognizer? = null
  private var speechPromise: Promise? = null
  private var rolePromise: Promise? = null
  private val speechTimer = android.os.Handler(android.os.Looper.getMainLooper())
  private val expireSpeech = Runnable { stopSpeech("Speech time limit reached") }
  private fun roles(): RoleManager? = if (Build.VERSION.SDK_INT >= 29) context.getSystemService(RoleManager::class.java) else null
  override fun definition() = ModuleDefinition {
    Name("HaksanCallAssistant")
    Events("pendingAction")
    AsyncFunction("availability") {
      mapOf("speech" to (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)), "callScreening" to (Build.VERSION.SDK_INT >= 30 && roles()?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) == true), "appFunctions" to false)
    }
    AsyncFunction("getCallScreeningStatus") { roles()?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true }
    AsyncFunction("requestCallScreeningRole") { promise: Promise ->
      val manager = roles()
      if (Build.VERSION.SDK_INT < 30 || manager?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) != true) promise.resolve(false)
      else if (manager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) promise.resolve(true)
      else {
        check(rolePromise == null) { "Role request already pending" }
        rolePromise = promise
        try { appContext.throwingActivity.startActivityForResult(manager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), 7714) }
        catch (e: Exception) { rolePromise = null; promise.reject("E_ROLE", "Call screening role could not be requested", e) }
      }
    }.runOnQueue(Queues.MAIN)
    OnActivityResult { _, (requestCode, resultCode, _) ->
      if (requestCode == 7714) { rolePromise?.resolve(resultCode == Activity.RESULT_OK); rolePromise = null }
    }
    AsyncFunction("requestContactsPermission") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) promise.resolve(false)
      else permissions.askForPermissions({ result -> promise.resolve(result[Manifest.permission.READ_CONTACTS]?.status == PermissionsStatus.GRANTED) }, Manifest.permission.READ_CONTACTS)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("activateScope") { scope: String? -> AssistantStore(context).activateScope(scope) }
    AsyncFunction("setPhoneIndex") { input: Map<String, Any?> -> AssistantStore(context).setIndex(input) }
    AsyncFunction("setEnabled") { enabled: Boolean, scope: String? -> AssistantStore(context).setEnabled(enabled, scope); installShortcuts(context) }
    AsyncFunction("clearContext") { AssistantStore(context).clear() }
    AsyncFunction("drainPendingActions") { AssistantStore(context).drain() }
    AsyncFunction("acknowledgePendingActions") { ids: List<String> -> AssistantStore(context).acknowledge(ids) }
    AsyncFunction("startSpeech") { locale: String?, promise: Promise ->
      if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
        promise.reject("E_ON_DEVICE_UNAVAILABLE", "On-device speech recognition is unavailable", null)
      } else if (speechPromise != null) promise.reject("E_BUSY", "Speech recognition is already active", null)
      else {
        val permissions = appContext.permissions
        if (permissions == null) promise.reject("E_PERMISSION", "Microphone permission unavailable", null)
        else { speechPromise = promise; permissions.askForPermissions({ result ->
          if (speechPromise !== promise) return@askForPermissions
          if (result[Manifest.permission.RECORD_AUDIO]?.status != PermissionsStatus.GRANTED) { speechPromise = null; promise.reject("E_PERMISSION", "Microphone permission denied", null) }
          else context.mainExecutor.execute { beginSpeech(locale ?: "tr-TR", promise) }
        }, Manifest.permission.RECORD_AUDIO) }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancelSpeech") { stopSpeech("Speech recognition cancelled") }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { speechTimer.post { stopSpeech("Speech cancelled in background") } }
    OnDestroy { android.os.Handler(android.os.Looper.getMainLooper()).post { stopSpeech("Module destroyed") }; rolePromise?.resolve(false); rolePromise = null }
  }
  private fun stopSpeech(message: String) {
    speechTimer.removeCallbacks(expireSpeech)
    speechPromise?.reject("E_CANCELLED", message, null); speechPromise = null
    recognizer?.cancel(); recognizer?.destroy(); recognizer = null
  }
  private fun beginSpeech(locale: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < 31) { promise.reject("E_ON_DEVICE_UNAVAILABLE", "On-device speech unavailable", null); return }
    if (speechPromise !== promise) return
    try {
      recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      recognizer?.setRecognitionListener(object : RecognitionListener {
        override fun onResults(results: Bundle?) { if (speechPromise !== promise) return; speechTimer.removeCallbacks(expireSpeech); val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty(); speechPromise?.resolve(text.take(4000)); speechPromise = null; recognizer?.destroy(); recognizer = null }
        override fun onError(error: Int) { if (speechPromise !== promise) return; speechTimer.removeCallbacks(expireSpeech); speechPromise?.reject("E_SPEECH", "On-device speech failed ($error)", null); speechPromise = null; recognizer?.destroy(); recognizer = null }
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
      })
      speechTimer.postDelayed(expireSpeech, 30000)
      recognizer?.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false))
    } catch (e: Exception) { speechPromise?.reject("E_SPEECH", "On-device recognizer could not start", e); speechPromise = null; recognizer?.destroy(); recognizer = null }
  }
}
