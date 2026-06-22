package com.haksan.mobile.calls

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CallLog
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors

class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!CallAssistantPrefs.isEnabled(context)) return
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                CallAssistantPrefs.markRinging(context, incomingNumber, System.currentTimeMillis())
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                CallAssistantPrefs.markOffhook(context)
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                val pending = CallAssistantPrefs.pendingCall(context) ?: return
                CallAssistantPrefs.clearPendingCall(context)
                val pendingResult = goAsync()
                Executors.newSingleThreadExecutor().execute {
                    try {
                        handleCallEnded(context.applicationContext, pending)
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }

    private fun handleCallEnded(context: Context, pending: PendingCall) {
        val endedAt = System.currentTimeMillis()
        val callLog = readLatestMatchingCallLog(context, pending.startedAt)
        val phoneNumber = pending.number ?: callLog?.number ?: return
        val wasAnswered = pending.wasOffhook || callLog?.answered == true
        val eventType = if (wasAnswered) "completed" else "missed"
        val duration = callLog?.durationSeconds ?: if (wasAnswered) ((endedAt - pending.startedAt) / 1000L).toInt() else 0
        val event = CapturedCallEvent(
            eventId = "android:${UUID.randomUUID()}",
            phoneNumber = phoneNumber,
            eventType = eventType,
            startedAtIso = iso(pending.startedAt),
            endedAtIso = iso(endedAt),
            durationSeconds = duration.coerceAtLeast(0),
        )
        val suggestions = CallAssistantApiClient(context).sendMobileEvent(event)
        if (suggestions.isNotEmpty()) {
            NotificationHelper(context).showSuggestions(suggestions)
        }
    }

    private fun readLatestMatchingCallLog(context: Context, startedAt: Long): CallLogMatch? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val projection = arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.TYPE,
            CallLog.Calls.DURATION,
        )
        val minDate = startedAt - 180_000L
        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} >= ?",
            arrayOf(minDate.toString()),
            "${CallLog.Calls.DATE} DESC"
        ) ?: return null
        cursor.use {
            if (!it.moveToFirst()) return null
            val number = it.getString(0)?.takeIf { value -> value.isNotBlank() } ?: return null
            val type = it.getInt(2)
            val duration = it.getInt(3)
            return CallLogMatch(
                number = number,
                answered = type == CallLog.Calls.INCOMING_TYPE,
                durationSeconds = duration,
            )
        }
    }

    private fun iso(epochMillis: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(epochMillis))
    }
}

private data class CallLogMatch(
    val number: String,
    val answered: Boolean,
    val durationSeconds: Int,
)
