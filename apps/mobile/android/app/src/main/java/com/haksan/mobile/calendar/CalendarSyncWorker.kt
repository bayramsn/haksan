package com.haksan.mobile.calendar

import android.content.Context
import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters

class CalendarSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = try {
        applicationContext.startService(Intent(applicationContext, CalendarSyncTaskService::class.java))
        Result.success()
    } catch (_: Exception) { Result.retry() }

    companion object { const val WORK_NAME = "haksan-calendar-sync" }
}

