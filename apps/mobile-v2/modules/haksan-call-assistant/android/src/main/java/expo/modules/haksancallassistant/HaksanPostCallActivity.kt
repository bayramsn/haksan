package expo.modules.haksancallassistant

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.role.RoleManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager
import android.telecom.DisconnectCause
import android.content.pm.PackageManager
import android.Manifest

/** Entry point is protected by BIND_SCREENING_SERVICE (signature permission).
 * Additionally require a fresh locally screened known number and held OS role. */
class HaksanPostCallActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      if (Build.VERSION.SDK_INT < 30 || intent.action != TelecomManager.ACTION_POST_CALL) return
      val manager = getSystemService(RoleManager::class.java)
      if (!manager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) return
      @Suppress("DEPRECATION") val handle = intent.getParcelableExtra<Uri>(TelecomManager.EXTRA_HANDLE) ?: return
      if (handle.scheme != "tel") return
      val id = AssistantStore(this).completeCall(handle.schemeSpecificPart, intent.getIntExtra(TelecomManager.EXTRA_DISCONNECT_CAUSE, DisconnectCause.UNKNOWN)) ?: return
      if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
      val notifications = getSystemService(NotificationManager::class.java)
      notifications.createNotificationChannel(NotificationChannel("haksan_after_call", "Görüşme sonrası", NotificationManager.IMPORTANCE_DEFAULT).apply { setShowBadge(false) })
      val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
      launch.action = Intent.ACTION_VIEW
      launch.data = Uri.parse("haksan:///modules/call-assistant/$id")
      val pending = PendingIntent.getActivity(this, id.hashCode(), launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val note = android.app.Notification.Builder(this, "haksan_after_call").setSmallIcon(applicationInfo.icon).setContentTitle("Haksan").setContentText("Arama sonrası işlem eklemek ister misiniz?").setVisibility(android.app.Notification.VISIBILITY_PRIVATE).setContentIntent(pending).setAutoCancel(true).build()
      notifications.notify(id.hashCode(), note)
    } catch (_: Exception) { /* No raw phone/context in logs or notification text. */ }
    finally { finish() }
  }
}
