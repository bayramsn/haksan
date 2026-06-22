package com.haksan.mobile.calls

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

class CallAssistantModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HaksanCallAssistant"

    @ReactMethod
    fun configure(apiBaseUrl: String, accessToken: String, promise: Promise) {
        CallAssistantPrefs.saveConfig(reactContext, apiBaseUrl, accessToken)
        promise.resolve(statusMap())
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        CallAssistantPrefs.setEnabled(reactContext, enabled)
        promise.resolve(statusMap())
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(statusMap())
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        promise.resolve(null)
    }

    private fun statusMap(): WritableMap {
        val permissions = Arguments.createMap().apply {
            putBoolean("readPhoneState", hasPermission(Manifest.permission.READ_PHONE_STATE))
            putBoolean("readCallLog", hasPermission(Manifest.permission.READ_CALL_LOG))
            putBoolean(
                "postNotifications",
                Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS)
            )
        }
        return Arguments.createMap().apply {
            putBoolean("available", true)
            putBoolean("enabled", CallAssistantPrefs.isEnabled(reactContext))
            putString("apiBaseUrl", CallAssistantPrefs.apiBaseUrl(reactContext))
            putBoolean("hasToken", CallAssistantPrefs.accessToken(reactContext) != null)
            putMap("permissions", permissions)
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(reactContext, permission) == PackageManager.PERMISSION_GRANTED
}
