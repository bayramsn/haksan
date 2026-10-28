package expo.modules.haksancallassistant

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.telecom.DisconnectCause
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** No token or recording is stored. Index, call context and pending actions are
 * encrypted under a nonexportable per-install Android Keystore key. */
internal class AssistantStore(context: Context) {
  private val prefs = context.getSharedPreferences("haksan_assistant_private", Context.MODE_PRIVATE)
  private val keyAlias = "haksan_assistant_aes_v1"
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }
  private fun read(): JSONObject {
    val sealed = prefs.getString("sealed", null) ?: return JSONObject()
    val bytes = Base64.decode(sealed, Base64.NO_WRAP)
    require(bytes.size > 12)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
  }
  private fun write(value: JSONObject) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val bytes = cipher.iv + cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))
    check(prefs.edit().putString("sealed", Base64.encodeToString(bytes, Base64.NO_WRAP)).commit())
  }
  companion object {
    private val lock = Any()
    const val TTL = 30 * 60 * 1000L
    val actions = setOf("post_call", "after_call", "open_today", "find_opportunities", "new_opportunity", "add_note", "create_task", "new_service_ticket")
    fun normalize(value: String): String { val digits = value.filter { it.isDigit() }; return if (digits.length == 10) "90$digits" else if (digits.length == 11 && digits.startsWith("0")) "90${digits.drop(1)}" else if (digits.startsWith("00")) digits.drop(2) else digits }
  }
  fun clear() = synchronized(lock) { check(prefs.edit().clear().commit()) }
  fun activateScope(scope: String?) = synchronized(lock) {
    if (scope == null) { clear(); return@synchronized }
    require(scope.isNotBlank() && scope.length <= 512)
    val value = read()
    if (value.optString("scope") != scope) { clear(); write(JSONObject().put("scope", scope).put("enabled", false)) }
  }
  fun setEnabled(enabled: Boolean, scope: String?) = synchronized(lock) {
    if (!enabled) { clear(); return@synchronized }
    require(!scope.isNullOrBlank() && scope.length <= 512)
    val value = read()
    if (value.optString("scope") != scope) { clear(); write(JSONObject().put("scope", scope).put("enabled", true)) }
    else write(value.put("enabled", true))
  }
  fun setIndex(input: Map<String, Any?>) = synchronized(lock) {
    val scope = input["scope"] as? String ?: error("Scope required")
    val entries = input["entries"] as? List<*> ?: error("Entries required")
    val expires = (input["expiresAt"] as? Number)?.toLong() ?: error("Expiry required")
    require(entries.size <= 10000 && expires > System.currentTimeMillis() && expires <= System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L)
    val value = read(); require(value.optBoolean("enabled") && value.optString("scope") == scope)
    val rows = JSONArray()
    entries.forEach { raw ->
      val entry = raw as? Map<*, *> ?: return@forEach
      val phone = normalize(entry["phoneNumber"] as? String ?: "")
      val company = entry["companyId"] as? String ?: ""
      if (phone.length in 7..15 && company.length in 1..128) rows.put(JSONObject().put("phoneNumber", phone).put("companyId", company).put("contactId", entry["contactId"] as? String ?: JSONObject.NULL))
    }
    write(value.put("entries", rows).put("expiresAt", expires))
  }
  fun match(phone: String): JSONObject? = synchronized(lock) {
    val value = read()
    if (!value.optBoolean("enabled") || value.optLong("expiresAt") <= System.currentTimeMillis()) return@synchronized null
    val rows = value.optJSONArray("entries") ?: return@synchronized null
    val matches = (0 until rows.length()).map { rows.getJSONObject(it) }.filter { it.optString("phoneNumber") == normalize(phone) }
    if (matches.isEmpty()) return@synchronized null
    // A known but ambiguous number must reach the server's authorized selection
    // flow. The local index is only a presence filter, never an authority to
    // choose one company/contact from several matching records.
    val match = JSONObject().put("scope", value.optString("scope"))
    if (matches.map { it.optString("companyId") }.distinct().size == 1) {
      match.put("companyId", matches.first().getString("companyId"))
      if (matches.map { it.optString("contactId") }.distinct().size == 1) match.put("contactId", matches.first().opt("contactId"))
    }
    match
  }
  private fun screenedCalls(value: JSONObject, limit: Int = 20): JSONArray {
    val rows = value.optJSONArray("screenedCalls") ?: JSONArray()
    // Retain an in-flight call from the previous single-call store on upgrade.
    value.optJSONObject("screened")?.let { rows.put(it) }
    value.remove("screened")
    val result = JSONArray(); val now = System.currentTimeMillis()
    for (i in maxOf(0, rows.length() - limit) until rows.length()) {
      val row = rows.optJSONObject(i) ?: continue
      if (now - row.optLong("createdAt") in 0..TTL) result.put(row)
    }
    return result
  }
  fun rememberScreened(phone: String, direction: String, createdAt: Long) = synchronized(lock) {
    if (match(phone) == null) return@synchronized
    val value = read()
    val calls = screenedCalls(value, 19)
    calls.put(JSONObject().put("phoneNumber", normalize(phone)).put("direction", direction).put("createdAt", createdAt).put("id", UUID.randomUUID().toString()))
    value.put("screenedCalls", calls)
    write(value)
  }
  fun completeCall(phone: String, disconnectCause: Int): String? = synchronized(lock) {
    val match = match(phone) ?: return@synchronized null
    val value = read(); val calls = screenedCalls(value)
    val matches = (0 until calls.length()).filter { calls.getJSONObject(it).optString("phoneNumber") == normalize(phone) }
    // POST_CALL has no stable call identifier. Two simultaneous calls to the
    // same number cannot be correlated safely; consume them without guessing.
    if (matches.size != 1) {
      val remaining = JSONArray()
      for (i in 0 until calls.length()) if (i !in matches) remaining.put(calls.getJSONObject(i))
      write(value.put("screenedCalls", remaining))
      return@synchronized null
    }
    val screened = calls.getJSONObject(matches.first())
    calls.remove(matches.first()); value.put("screenedCalls", calls)
    // EXTRA_CALL_DURATION is a DURATION_* category, not elapsed seconds.
    // Only the explicit platform MISSED cause proves a missed call; a local
    // or remote disconnect alone does not prove the customer answered.
    val eventType = if (disconnectCause == DisconnectCause.MISSED) "missed" else "unknown"
    val action = JSONObject().put("id", screened.getString("id")).put("action", "post_call").put("createdAt", System.currentTimeMillis()).put("scope", match.getString("scope")).put("phoneNumber", normalize(phone)).put("direction", screened.optString("direction")).put("eventType", eventType)
    val pending = fresh(value, 19); pending.put(action); write(value.put("pending", pending)); action.getString("id")
  }
  fun enqueue(action: String): String = synchronized(lock) {
    require(action in actions && action != "post_call")
    val value = read(); val id = UUID.randomUUID().toString()
    val pending = fresh(value, 19); pending.put(JSONObject().put("id", id).put("action", action).put("createdAt", System.currentTimeMillis()).put("scope", value.optString("scope")))
    write(value.put("pending", pending)); id
  }
  private fun fresh(value: JSONObject, limit: Int = 20): JSONArray {
    val source = value.optJSONArray("pending") ?: JSONArray()
    val result = JSONArray(); val now = System.currentTimeMillis()
    for (i in maxOf(0, source.length() - limit) until source.length()) { val row = source.optJSONObject(i) ?: continue; if (now - row.optLong("createdAt") in 0..TTL && row.optString("action") in actions) result.put(row) }
    return result
  }
  fun drain(): List<Map<String, Any?>> = synchronized(lock) {
    // JS acknowledges only after saving the handoff in encrypted storage.
    val value = read(); val pending = fresh(value); write(value.put("pending", pending))
    (0 until pending.length()).map { i -> val row = pending.getJSONObject(i); row.keys().asSequence().associateWith { k -> if (row.isNull(k)) null else row.get(k) } }
  }
  fun acknowledge(ids: List<String>) = synchronized(lock) {
    require(ids.size <= 20 && ids.all { it.length <= 128 })
    val value = read(); val pending = fresh(value); val remaining = JSONArray()
    for (i in 0 until pending.length()) {
      val row = pending.getJSONObject(i)
      if (row.optString("id") !in ids) remaining.put(row)
    }
    write(value.put("pending", remaining))
  }
}
