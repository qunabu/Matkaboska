package pl.wojczal.sitelimit

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to the Matka Boska worker. Rules are managed there and pulled down
 * here; habits are read and checked in from the block screen.
 *
 * Every call is blocking — callers must be off the main thread. A null return
 * means "couldn't reach the server", which the caller treats as "keep using
 * what's cached" rather than "there are no rules".
 */
object Api {

    private const val TAG = "SiteLimit"
    private const val TIMEOUT_MS = 8_000

    /** A habit as the block screen needs it. */
    data class Habit(val id: Int, val name: String, val streak: Int)

    private fun request(c: Context, path: String, method: String, body: String?): String? {
        val base = Store.serverUrl(c).trimEnd('/')
        val token = Store.deviceToken(c)
        if (base.isEmpty() || token.isEmpty()) return null

        var conn: HttpURLConnection? = null
        return try {
            conn = (URL("$base$path").openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }
            if (body != null) {
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "$method $path -> HTTP $code")
                return null
            }
            conn.inputStream.bufferedReader().use(BufferedReader::readText)
        } catch (e: Exception) {
            Log.w(TAG, "$method $path failed: ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** Active rules as configured in the PWA, or null if the server is unreachable. */
    fun rules(c: Context): List<Rule>? {
        val body = request(c, "/api/blocks", "GET", null) ?: return null
        return try {
            val items = JSONObject(body).getJSONArray("items")
            (0 until items.length()).mapNotNull { i ->
                val o = items.getJSONObject(i)
                // The server can park a rule without deleting it; treat that as gone.
                if (!o.optBoolean("active", true)) null
                else Rule(o.getString("pattern"), o.optInt("daily_limit_minutes", 0))
            }
        } catch (e: Exception) {
            Log.w(TAG, "bad /api/blocks payload: ${e.message}")
            null
        }
    }

    /**
     * Today's active habits that haven't been checked in yet — the ones that can
     * still buy an unlock. Null if the server is unreachable.
     */
    fun openHabits(c: Context): List<Habit>? {
        val body = request(c, "/api/habits", "GET", null) ?: return null
        return try {
            val items = JSONObject(body).getJSONArray("items")
            (0 until items.length()).mapNotNull { i ->
                val o = items.getJSONObject(i)
                // today: "yes" = already done, "no" = explicitly failed, null = open.
                if (!o.optBoolean("active", true)) return@mapNotNull null
                if (!o.isNull("today")) return@mapNotNull null
                Habit(o.getInt("id"), o.getString("name"), o.optInt("streak", 0))
            }
        } catch (e: Exception) {
            Log.w(TAG, "bad /api/habits payload: ${e.message}")
            null
        }
    }

    /** Record the habit as done today. True only if the server accepted it. */
    fun checkIn(c: Context, habitId: Int): Boolean {
        val payload = JSONObject().put("success", true).toString()
        val body = request(c, "/api/habits/$habitId/checkin", "POST", payload) ?: return false
        return try {
            JSONObject(body).optBoolean("ok", false)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Push one whole day of stats. The server replaces the day rather than
     * merging, so re-sending after a dropped response is harmless.
     */
    fun pushUsage(c: Context, day: String): Boolean {
        val totals = JSONObject()
        for (entry in Store.spendForDay(c, day)) totals.put(entry.target, entry.seconds)
        val stats = Store.statsFor(c, day)
        val payload = JSONObject()
            .put("date", day)
            .put("totals", totals)
            .put("blocks", stats.blocks)
            .put("unlocks", stats.unlocks)
            .put("screen_unlocks", stats.screenUnlocks)
            .toString()
        return request(c, "/api/blocks/usage", "POST", payload) != null
    }

    /** Cheap credentials check for the settings screen. */
    fun ping(c: Context): Boolean = request(c, "/api/blocks", "GET", null) != null
}
