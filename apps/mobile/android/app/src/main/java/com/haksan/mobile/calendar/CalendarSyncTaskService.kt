package com.haksan.mobile.calendar

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class CalendarSyncTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
        HeadlessJsTaskConfig("HaksanCalendarSync", null, 60_000, true)
}

