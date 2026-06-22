package com.haksan.mobile.calls

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.haksan.mobile.MainActivity
import com.haksan.mobile.R
import kotlin.math.abs

class NotificationHelper(private val context: Context) {
    fun showSuggestions(suggestions: List<NotificationSuggestion>) {
        ensureChannel()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        suggestions.forEach { suggestion ->
            val notificationId = notificationId(suggestion.id)
            val openIntent = PendingIntent.getActivity(
                context,
                notificationId,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_call_assistant)
                .setContentTitle("${suggestion.companyName} aradı")
                .setContentText(suggestion.phoneNumber ?: suggestion.body ?: "CRM önerisi hazır")
                .setStyle(NotificationCompat.BigTextStyle().bigText(suggestion.body ?: suggestion.title))
                .setContentIntent(openIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)

            if (suggestion.canCreateQuote) builder.addAction(action(notificationId, suggestion.id, "create_quote", "Teklif"))
            if (suggestion.canCreateServiceTicket) builder.addAction(action(notificationId + 1, suggestion.id, "create_service_ticket", "Servis"))
            if (suggestion.canLogCall) builder.addAction(action(notificationId + 2, suggestion.id, "log_call", "Arama kaydı"))
            builder.addAction(action(notificationId + 3, suggestion.id, "dismiss", "Yoksay"))

            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
        }
    }

    fun cancelSuggestion(suggestionId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(suggestionId))
    }

    private fun action(requestCode: Int, suggestionId: String, action: String, title: String): NotificationCompat.Action {
        val intent = Intent(context, CallActionReceiver::class.java)
            .setAction(CallActionReceiver.ACTION)
            .putExtra(CallActionReceiver.EXTRA_SUGGESTION_ID, suggestionId)
            .putExtra(CallActionReceiver.EXTRA_ACTION, action)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Action.Builder(R.drawable.ic_call_assistant, title, pendingIntent).build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Arama önerileri",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Kayıtlı firma aramalarından teklif ve servis önerileri"
        }
        manager.createNotificationChannel(channel)
    }

    private fun notificationId(suggestionId: String): Int = abs(suggestionId.hashCode())

    companion object {
        private const val CHANNEL_ID = "call_assistant_suggestions"
    }
}
