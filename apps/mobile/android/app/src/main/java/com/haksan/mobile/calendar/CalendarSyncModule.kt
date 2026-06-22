package com.haksan.mobile.calendar

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.time.Instant
import java.util.concurrent.TimeUnit

class CalendarSyncModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "HaksanCalendar"

    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Int) = Unit

    @ReactMethod
    fun requestAccess(promise: Promise) = promise.resolve(hasPermissions())

    @ReactMethod
    fun getDeviceId(promise: Promise) {
        promise.resolve(Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "android-device")
    }

    @ReactMethod
    fun listCalendars(promise: Promise) {
        try {
            requirePermissions()
            val result = Arguments.createArray()
            val projection = arrayOf(
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.VISIBLE,
            )
            context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, null, null, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)?.use { cursor ->
                while (cursor.moveToNext()) {
                    if (cursor.getInt(4) == 0) continue
                    result.pushMap(Arguments.createMap().apply {
                        putString("id", cursor.getLong(0).toString())
                        putString("title", cursor.getString(1) ?: "Takvim")
                        putString("color", String.format("#%06X", 0xFFFFFF and cursor.getInt(2)))
                        putBoolean("writable", cursor.getInt(3) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                    })
                }
            }
            promise.resolve(result)
        } catch (error: Exception) { promise.reject("CALENDAR_LIST", error) }
    }

    @ReactMethod
    fun readEvents(fromIso: String, toIso: String, calendarIds: ReadableArray, promise: Promise) {
        try {
            requirePermissions()
            val selected = (0 until calendarIds.size()).mapNotNull { calendarIds.getString(it) }.toSet()
            val from = Instant.parse(fromIso).toEpochMilli()
            val to = Instant.parse(toIso).toEpochMilli()
            val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
                ContentUris.appendId(it, from)
                ContentUris.appendId(it, to)
            }.build()
            val projection = arrayOf(
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.CALENDAR_ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.DESCRIPTION,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.EVENT_TIMEZONE,
                CalendarContract.Instances.RRULE,
                "dtstamp",
                CalendarContract.Instances.CUSTOM_APP_URI,
            )
            val result = Arguments.createArray()
            val seenEventIds = mutableSetOf<String>()
            context.contentResolver.query(uri, projection, null, null, CalendarContract.Instances.BEGIN)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val calendarId = cursor.getLong(1).toString()
                    if (!selected.contains(calendarId)) continue
                    val eventId = cursor.getLong(0).toString()
                    if (!seenEventIds.add(eventId)) continue
                    val begin = cursor.getLong(5)
                    val rrule = cursor.getString(9)
                    val customUri = cursor.getString(11)
                    result.pushMap(Arguments.createMap().apply {
                        putString("crmEventId", customUri?.substringAfter("haksan://calendar/", "")?.takeIf { it.isNotBlank() })
                        putString("externalCalendarId", calendarId)
                        putString("externalEventId", eventId)
                        putString("occurrenceId", "")
                        putString("title", cursor.getString(2) ?: "İsimsiz etkinlik")
                        putString("description", cursor.getString(3))
                        putString("location", cursor.getString(4))
                        putString("startsAt", Instant.ofEpochMilli(begin).toString())
                        putString("endsAt", Instant.ofEpochMilli(cursor.getLong(6)).toString())
                        putBoolean("allDay", cursor.getInt(7) == 1)
                        putString("timezone", cursor.getString(8) ?: "Europe/Istanbul")
                        putString("recurrenceRule", rrule)
                        val modified = cursor.getLong(10).takeIf { it > 0 } ?: begin
                        putString("modifiedAt", Instant.ofEpochMilli(modified).toString())
                        putBoolean("deleted", false)
                    })
                }
            }
            promise.resolve(result)
        } catch (error: Exception) { promise.reject("CALENDAR_READ", error) }
    }

    @ReactMethod
    fun upsertEvents(commands: ReadableArray, promise: Promise) {
        try {
            requirePermissions()
            val written = Arguments.createArray()
            for (index in 0 until commands.size()) {
                val command = commands.getMap(index) ?: continue
                val calendarId = command.string("externalCalendarId")?.toLongOrNull() ?: continue
                val values = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, calendarId)
                    put(CalendarContract.Events.TITLE, command.string("title") ?: "CRM etkinliği")
                    put(CalendarContract.Events.DESCRIPTION, command.string("description"))
                    put(CalendarContract.Events.EVENT_LOCATION, command.string("location"))
                    put(CalendarContract.Events.DTSTART, Instant.parse(command.string("startsAt")).toEpochMilli())
                    put(CalendarContract.Events.DTEND, Instant.parse(command.string("endsAt")).toEpochMilli())
                    put(CalendarContract.Events.ALL_DAY, if (command.getBoolean("allDay")) 1 else 0)
                    put(CalendarContract.Events.EVENT_TIMEZONE, command.string("timezone") ?: "Europe/Istanbul")
                    command.string("recurrenceRule")?.takeIf { it.isNotBlank() }?.let { put(CalendarContract.Events.RRULE, it) }
                    put(CalendarContract.Events.CUSTOM_APP_PACKAGE, context.packageName)
                    put(CalendarContract.Events.CUSTOM_APP_URI, "haksan://calendar/${command.string("crmEventId")}")
                }
                val existingId = command.string("externalEventId")?.toLongOrNull()
                val eventId = if (existingId != null) {
                    context.contentResolver.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, existingId), values, null, null)
                    existingId
                } else {
                    ContentUris.parseId(context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values) ?: error("Etkinlik oluşturulamadı"))
                }
                written.pushMap(commandToEvent(command, calendarId.toString(), eventId.toString()))
            }
            promise.resolve(written)
        } catch (error: Exception) { promise.reject("CALENDAR_WRITE", error) }
    }

    @ReactMethod
    fun deleteEvents(commands: ReadableArray, promise: Promise) {
        try {
            requirePermissions()
            for (index in 0 until commands.size()) {
                val id = commands.getMap(index)?.string("externalEventId")?.toLongOrNull() ?: continue
                context.contentResolver.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null)
            }
            promise.resolve(null)
        } catch (error: Exception) { promise.reject("CALENDAR_DELETE", error) }
    }

    @ReactMethod
    fun setBackgroundSyncEnabled(enabled: Boolean, promise: Promise) {
        val manager = WorkManager.getInstance(context)
        if (!enabled) manager.cancelUniqueWork(CalendarSyncWorker.WORK_NAME)
        else {
            val request = PeriodicWorkRequestBuilder<CalendarSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            manager.enqueueUniquePeriodicWork(CalendarSyncWorker.WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }
        promise.resolve(null)
    }

    private fun hasPermissions() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED

    private fun requirePermissions() { if (!hasPermissions()) error("Takvim okuma ve yazma izni gerekli") }

    private fun commandToEvent(command: ReadableMap, calendarId: String, eventId: String): WritableMap = Arguments.createMap().apply {
        putString("crmEventId", command.string("crmEventId")); putString("externalCalendarId", calendarId); putString("externalEventId", eventId)
        putString("occurrenceId", command.string("occurrenceId") ?: ""); putString("title", command.string("title") ?: "CRM etkinliği")
        putString("description", command.string("description")); putString("location", command.string("location")); putString("startsAt", command.string("startsAt")); putString("endsAt", command.string("endsAt"))
        putBoolean("allDay", command.getBoolean("allDay")); putString("timezone", command.string("timezone") ?: "Europe/Istanbul"); putString("recurrenceRule", command.string("recurrenceRule")); putString("modifiedAt", Instant.now().toString()); putBoolean("deleted", false)
    }
}

private fun ReadableMap.string(key: String): String? = if (hasKey(key) && !isNull(key)) getString(key) else null
