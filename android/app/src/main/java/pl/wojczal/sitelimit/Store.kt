package pl.wojczal.sitelimit

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * One blocking rule.
 *
 * [pattern] is a bare host ("reddit.com") or an app package name
 * ("com.instagram.android"). A host pattern also covers its subdomains.
 * [dailyLimitMinutes] of 0 means "always blocked"; anything higher is a
 * per-day time budget.
 */
data class Rule(
    val pattern: String,
    val dailyLimitMinutes: Int,
    /** Block screen may offer a no-habit unlock for this rule (e.g. mail). */
    val allowEmergency: Boolean = false,
) {
    val isAlwaysBlocked: Boolean get() = dailyLimitMinutes <= 0
}

/** A host or package and the seconds spent on it. */
data class Spend(val target: String, val seconds: Int)

/**
 * Rules, plus a rolling week of per-host time, kept in SharedPreferences as
 * JSON. Small enough that a database would be more moving parts than it's worth.
 *
 * Time is recorded against the concrete host or package ("old.reddit.com"), not
 * against the rule that matched it. That way the stats screen works for sites
 * you never wrote a rule for, and a rule's usage is just the sum of the hosts
 * it covers.
 */
object Store {

    private const val PREFS = "sitelimit"
    private const val KEY_RULES = "rules"
    private const val KEY_USAGE = "usage_v2"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val KEY_LAST_SYNC = "last_sync"
    private const val KEY_PASSES = "passes"
    private const val KEY_STATS = "stats_v1"

    /** Minutes of access one habit check-in buys. */
    const val PASS_MINUTES = 5

    /** Days of history retained; older days are pruned on write. */
    const val DAYS_KEPT = 7

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val dayFormat get() = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun today(): String = dayFormat.format(Date())

    /** Day key [offset] days ago; 0 = today, 1 = yesterday. */
    fun dayKey(offset: Int): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -offset)
        return dayFormat.format(cal.time)
    }

    private fun dayKeys(days: Int): List<String> {
        val cal = Calendar.getInstance()
        val fmt = dayFormat
        return (0 until days).map {
            val key = fmt.format(cal.time)
            cal.add(Calendar.DAY_OF_YEAR, -1)
            key
        }
    }

    // ---- rules ----------------------------------------------------------

    fun rules(c: Context): List<Rule> {
        val raw = prefs(c).getString(KEY_RULES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Rule(o.getString("p"), o.optInt("m", 0), o.optBoolean("e", false))
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun setRules(c: Context, rules: List<Rule>) {
        val arr = JSONArray()
        for (r in rules) {
            arr.put(
                JSONObject()
                    .put("p", r.pattern)
                    .put("m", r.dailyLimitMinutes)
                    .put("e", r.allowEmergency)
            )
        }
        prefs(c).edit().putString(KEY_RULES, arr.toString()).apply()
    }

    fun addRule(c: Context, rule: Rule) {
        val next = rules(c).filterNot { it.pattern == rule.pattern } + rule
        setRules(c, next.sortedBy { it.pattern })
    }

    fun removeRule(c: Context, pattern: String) {
        setRules(c, rules(c).filterNot { it.pattern == pattern })
    }

    /** The first rule whose pattern covers [target], or null. */
    fun ruleFor(c: Context, target: String): Rule? =
        rules(c).firstOrNull { matches(target, it.pattern) }

    /**
     * "reddit.com" covers "reddit.com" and "old.reddit.com" but not "notreddit.com".
     *
     * A pattern with no dot in it ("facebook") is treated as a name to look for
     * among the host's labels, so it covers facebook.com, m.facebook.com and
     * facebook.co.uk. Typing the bare name is the obvious thing to do, and the
     * strict reading would silently match nothing at all.
     */
    fun matches(target: String, pattern: String): Boolean {
        val p = pattern.trim().lowercase().removePrefix("www.")
        if (p.isEmpty()) return false
        val t = target.trim().lowercase().removePrefix("www.")
        if (t == p || t.endsWith(".$p")) return true
        return !p.contains('.') && t.split('.').contains(p)
    }

    // ---- server settings -------------------------------------------------

    fun serverUrl(c: Context): String = prefs(c).getString(KEY_SERVER_URL, "") ?: ""

    fun deviceToken(c: Context): String = prefs(c).getString(KEY_DEVICE_TOKEN, "") ?: ""

    fun setServer(c: Context, url: String, token: String) {
        prefs(c).edit()
            .putString(KEY_SERVER_URL, url.trim().trimEnd('/'))
            .putString(KEY_DEVICE_TOKEN, token.trim())
            .apply()
    }

    fun lastSyncAt(c: Context): Long = prefs(c).getLong(KEY_LAST_SYNC, 0L)

    fun markSynced(c: Context) {
        prefs(c).edit().putLong(KEY_LAST_SYNC, System.currentTimeMillis()).apply()
    }

    val isConfigured: (Context) -> Boolean = { c -> serverUrl(c).isNotEmpty() && deviceToken(c).isNotEmpty() }

    // ---- temporary passes -------------------------------------------------

    /**
     * Earned by checking a habit in on the block screen: this rule stops blocking
     * until the stored timestamp. Time still counts against the daily budget, so
     * a pass buys access, not amnesty.
     */
    private fun passes(c: Context): JSONObject = try {
        JSONObject(prefs(c).getString(KEY_PASSES, "{}") ?: "{}")
    } catch (e: Exception) {
        JSONObject()
    }

    fun grantPass(c: Context, pattern: String, minutes: Int = PASS_MINUTES) {
        val p = passes(c)
        p.put(pattern, System.currentTimeMillis() + minutes * 60_000L)
        prefs(c).edit().putString(KEY_PASSES, p.toString()).apply()
    }

    fun passExpiresAt(c: Context, pattern: String): Long = passes(c).optLong(pattern, 0L)

    fun hasActivePass(c: Context, pattern: String): Boolean =
        passExpiresAt(c, pattern) > System.currentTimeMillis()

    // ---- usage ----------------------------------------------------------

    /** `{ "2026-09-02": { "reddit.com": 812 } }` */
    private fun readUsage(c: Context): JSONObject = try {
        JSONObject(prefs(c).getString(KEY_USAGE, "{}") ?: "{}")
    } catch (e: Exception) {
        JSONObject()
    }

    private fun writeUsage(c: Context, usage: JSONObject) {
        // Day keys sort lexicographically, so the oldest kept day is a plain cutoff.
        val cutoff = dayKeys(DAYS_KEPT).last()
        for (key in usage.keys().asSequence().toList()) {
            if (key < cutoff) usage.remove(key)
        }
        prefs(c).edit().putString(KEY_USAGE, usage.toString()).apply()
    }

    fun addUsage(c: Context, target: String, seconds: Int) {
        if (seconds <= 0 || target.isEmpty()) return
        val usage = readUsage(c)
        val day = usage.optJSONObject(today()) ?: JSONObject()
        day.put(target, day.optInt(target, 0) + seconds)
        usage.put(today(), day)
        writeUsage(c, usage)
    }

    /** Seconds spent on one exact host or package today. */
    fun secondsToday(c: Context, target: String): Int =
        readUsage(c).optJSONObject(today())?.optInt(target, 0) ?: 0

    /** Seconds spent today across every host the rule covers. */
    fun usedTodayForRule(c: Context, rule: Rule): Int {
        val day = readUsage(c).optJSONObject(today()) ?: return 0
        var total = 0
        for (target in day.keys()) {
            if (matches(target, rule.pattern)) total += day.optInt(target, 0)
        }
        return total
    }

    /** Seconds left in today's budget. Always-blocked rules return 0. */
    fun remainingSeconds(c: Context, rule: Rule): Int {
        if (rule.isAlwaysBlocked) return 0
        return (rule.dailyLimitMinutes * 60 - usedTodayForRule(c, rule)).coerceAtLeast(0)
    }

    /** Per-day counters the dashboard shows next to the screen-time total. */
    data class DayStats(
        val blocks: Int,
        val unlocks: Int,
        val screenUnlocks: Int,
        val emergency: Int,
    )

    private fun allStats(c: Context): JSONObject = try {
        JSONObject(prefs(c).getString(KEY_STATS, "{}") ?: "{}")
    } catch (e: Exception) {
        JSONObject()
    }

    /** [kind] is one of "blocks", "unlocks", "screen". */
    fun bumpStat(c: Context, kind: String) {
        val all = allStats(c)
        val day = all.optJSONObject(today()) ?: JSONObject()
        day.put(kind, day.optInt(kind, 0) + 1)
        all.put(today(), day)
        val cutoff = dayKeys(DAYS_KEPT).last()
        for (key in all.keys().asSequence().toList()) if (key < cutoff) all.remove(key)
        prefs(c).edit().putString(KEY_STATS, all.toString()).apply()
    }

    fun statsFor(c: Context, day: String): DayStats {
        val o = allStats(c).optJSONObject(day) ?: return DayStats(0, 0, 0, 0)
        return DayStats(
            o.optInt("blocks", 0),
            o.optInt("unlocks", 0),
            o.optInt("screen", 0),
            o.optInt("emergency", 0),
        )
    }

    /** Everything tracked on one day, biggest first. */
    fun spendForDay(c: Context, day: String): List<Spend> {
        val bucket = readUsage(c).optJSONObject(day) ?: return emptyList()
        return bucket.keys().asSequence()
            .map { Spend(it, bucket.optInt(it, 0)) }
            .sortedByDescending { it.seconds }
            .toList()
    }

    fun secondsForDay(c: Context, day: String): Int = spendForDay(c, day).sumOf { it.seconds }

    /** Everything visited over the last [days] days, biggest first. */
    fun spend(c: Context, days: Int): List<Spend> {
        val usage = readUsage(c)
        val totals = mutableMapOf<String, Int>()
        for (key in dayKeys(days)) {
            val day = usage.optJSONObject(key) ?: continue
            for (target in day.keys()) {
                totals[target] = (totals[target] ?: 0) + day.optInt(target, 0)
            }
        }
        return totals.map { Spend(it.key, it.value) }.sortedByDescending { it.seconds }
    }

    /** Give back today's budget for a rule by clearing every host it covers. */
    fun resetTodayForRule(c: Context, rule: Rule) {
        val usage = readUsage(c)
        val day = usage.optJSONObject(today()) ?: return
        for (target in day.keys().asSequence().toList()) {
            if (matches(target, rule.pattern)) day.remove(target)
        }
        usage.put(today(), day)
        writeUsage(c, usage)
    }

    fun clearAllUsage(c: Context) {
        prefs(c).edit().remove(KEY_USAGE).apply()
    }

    /** "1 h 12 min" / "8 min" / "<1 min" — minutes are the useful unit here. */
    fun formatDuration(seconds: Int): String {
        if (seconds <= 0) return "0 min"
        if (seconds < 60) return "<1 min"
        val minutes = seconds / 60
        if (minutes < 60) return "$minutes min"
        return "${minutes / 60} h ${minutes % 60} min"
    }
}
