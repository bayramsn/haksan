package com.haksan.mobile.calls

import android.content.Context

object CallAssistantPrefs {
    private const val PREF_NAME = "haksan_call_assistant"
    private const val KEY_API_BASE_URL = "apiBaseUrl"
    private const val KEY_ACCESS_TOKEN = "accessToken"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_RINGING_NUMBER = "ringingNumber"
    private const val KEY_STARTED_AT = "startedAt"
    private const val KEY_WAS_OFFHOOK = "wasOffhook"

    fun apiBaseUrl(context: Context): String? =
        prefs(context).getString(KEY_API_BASE_URL, null)?.takeIf { it.isNotBlank() }

    fun accessToken(context: Context): String? =
        prefs(context).getString(KEY_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun saveConfig(context: Context, apiBaseUrl: String, accessToken: String) {
        prefs(context).edit()
            .putString(KEY_API_BASE_URL, apiBaseUrl.trim().trimEnd('/'))
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .apply()
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun markRinging(context: Context, number: String?, startedAt: Long) {
        prefs(context).edit()
            .putString(KEY_RINGING_NUMBER, number)
            .putLong(KEY_STARTED_AT, startedAt)
            .putBoolean(KEY_WAS_OFFHOOK, false)
            .apply()
    }

    fun markOffhook(context: Context) {
        prefs(context).edit().putBoolean(KEY_WAS_OFFHOOK, true).apply()
    }

    fun pendingCall(context: Context): PendingCall? {
        val p = prefs(context)
        val startedAt = p.getLong(KEY_STARTED_AT, 0L)
        if (startedAt <= 0L) return null
        return PendingCall(
            number = p.getString(KEY_RINGING_NUMBER, null)?.takeIf { it.isNotBlank() },
            startedAt = startedAt,
            wasOffhook = p.getBoolean(KEY_WAS_OFFHOOK, false),
        )
    }

    fun clearPendingCall(context: Context) {
        prefs(context).edit()
            .remove(KEY_RINGING_NUMBER)
            .remove(KEY_STARTED_AT)
            .remove(KEY_WAS_OFFHOOK)
            .apply()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
}

data class PendingCall(
    val number: String?,
    val startedAt: Long,
    val wasOffhook: Boolean,
)
