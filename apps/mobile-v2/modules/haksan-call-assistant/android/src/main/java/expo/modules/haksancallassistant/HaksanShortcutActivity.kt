package expo.modules.haksancallassistant

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Bundle

class HaksanShortcutActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val action = intent.action
      if (action !in setOf("after_call", "open_today")) return
      val id = AssistantStore(this).enqueue(action!!)
      packageManager.getLaunchIntentForPackage(packageName)?.let { launch -> launch.action = Intent.ACTION_VIEW; launch.data = Uri.parse("haksan:///modules/call-assistant/$id"); startActivity(launch) }
    } catch (_: Exception) {} finally { finish() }
  }
}
internal fun installShortcuts(context: Context) {
  val manager = context.getSystemService(ShortcutManager::class.java)
  manager.dynamicShortcuts = listOf("after_call" to "Görüşme sonrası", "open_today" to "Bugünümü aç").map { (action, label) ->
    ShortcutInfo.Builder(context, "haksan_$action").setShortLabel(label).setIcon(Icon.createWithResource(context, context.applicationInfo.icon)).setIntent(Intent(context, HaksanShortcutActivity::class.java).setAction(action)).build()
  }
}
