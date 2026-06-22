package com.haksan.mobile.calls

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class CallAssistantApiClient(private val context: Context) {
    fun sendMobileEvent(event: CapturedCallEvent): List<NotificationSuggestion> {
        val payload = JSONObject()
            .put("eventId", event.eventId)
            .put("direction", "inbound")
            .put("eventType", event.eventType)
            .put("phoneNumber", event.phoneNumber)
            .put("startedAt", event.startedAtIso)
            .put("endedAt", event.endedAtIso)
            .put("durationSeconds", event.durationSeconds)
        val response = post("/mobile/calls/events", payload)
        return parseSuggestions(response.optJSONArray("suggestions") ?: JSONArray())
    }

    fun sendSuggestionAction(suggestionId: String, action: String) {
        post("/call-assistant/suggestions/$suggestionId/actions", JSONObject().put("action", action))
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val baseUrl = CallAssistantPrefs.apiBaseUrl(context) ?: error("API URL yok")
        val token = CallAssistantPrefs.accessToken(context) ?: error("Access token yok")
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
        }
        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
            writer.write(body.toString())
        }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        if (status !in 200..299) error("CRM API hata verdi: $status $text")
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    private fun parseSuggestions(items: JSONArray): List<NotificationSuggestion> {
        val result = mutableListOf<NotificationSuggestion>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val company = item.optJSONObject("company")
            val event = item.optJSONObject("event")
            result += NotificationSuggestion(
                id = item.optString("id"),
                title = item.optString("title", "Arama önerisi"),
                body = item.optString("body", null),
                companyName = company?.optString("shortName")?.takeIf { it.isNotBlank() }
                    ?: company?.optString("legalTitle")?.takeIf { it.isNotBlank() }
                    ?: "Kayıtlı firma",
                eventType = event?.optString("eventType", "completed") ?: "completed",
                phoneNumber = event?.optString("normalizedPhone", null),
                canCreateQuote = item.optJSONObject("availableActions")?.optBoolean("createQuote", false) ?: false,
                canCreateServiceTicket = item.optJSONObject("availableActions")?.optBoolean("createServiceTicket", false) ?: false,
                canLogCall = item.optJSONObject("availableActions")?.optBoolean("logCall", false) ?: false,
            )
        }
        return result
    }
}

data class CapturedCallEvent(
    val eventId: String,
    val phoneNumber: String,
    val eventType: String,
    val startedAtIso: String,
    val endedAtIso: String,
    val durationSeconds: Int,
)

data class NotificationSuggestion(
    val id: String,
    val title: String,
    val body: String?,
    val companyName: String,
    val eventType: String,
    val phoneNumber: String?,
    val canCreateQuote: Boolean,
    val canCreateServiceTicket: Boolean,
    val canLogCall: Boolean,
)
