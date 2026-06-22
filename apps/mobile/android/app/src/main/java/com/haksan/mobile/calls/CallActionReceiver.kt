package com.haksan.mobile.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val suggestionId = intent.getStringExtra(EXTRA_SUGGESTION_ID) ?: return
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        val pending = goAsync()
        Executors.newSingleThreadExecutor().execute {
            try {
                CallAssistantApiClient(context.applicationContext).sendSuggestionAction(suggestionId, action)
                NotificationHelper(context.applicationContext).cancelSuggestion(suggestionId)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION = "com.haksan.mobile.CALL_ASSISTANT_ACTION"
        const val EXTRA_SUGGESTION_ID = "suggestionId"
        const val EXTRA_ACTION = "action"
    }
}
