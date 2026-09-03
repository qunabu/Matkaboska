package pl.wojczal.sitelimit

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.Executors
import androidx.core.content.ContextCompat
import java.net.URI

/**
 * Watches whatever is on screen. In a known browser it reads the address bar to
 * work out the current host; in any other app the target is just the package
 * name. If the target matches a rule it is either blocked outright or its time
 * is counted against that rule's daily budget.
 */
class BlockerService : AccessibilityService() {

    companion object {
        /** `adb logcat -s SiteLimit` to watch what the service is seeing. */
        private const val TAG = "SiteLimit"

        /** Address-bar view id per browser package. */
        private val BROWSER_URL_IDS: Map<String, List<String>> = mapOf(
            "com.android.chrome" to listOf("com.android.chrome:id/url_bar"),
            "com.chrome.beta" to listOf("com.chrome.beta:id/url_bar"),
            "com.chrome.dev" to listOf("com.chrome.dev:id/url_bar"),
            "com.chrome.canary" to listOf("com.chrome.canary:id/url_bar"),
            "com.brave.browser" to listOf("com.brave.browser:id/url_bar"),
            "com.microsoft.emmx" to listOf("com.microsoft.emmx:id/url_bar"),
            "com.opera.browser" to listOf("com.opera.browser:id/url_field"),
            "com.sec.android.app.sbrowser" to
                listOf("com.sec.android.app.sbrowser:id/location_bar_edit_text"),
            "org.mozilla.firefox" to
                listOf("org.mozilla.firefox:id/mozac_browser_toolbar_url_view"),
            "com.duckduckgo.mobile.android" to
                listOf("com.duckduckgo.mobile.android:id/omnibarTextInput"),
        )

        /** System surfaces that would otherwise dominate the stats screen. */
        private val IGNORED_PACKAGES = setOf(
            "android",
            "com.android.systemui",
            "com.android.launcher3",
            "com.google.android.apps.nexuslauncher",
            "com.google.android.inputmethod.latin",
            "com.google.android.permissioncontroller",
        )

        private const val TICK_MS = 5_000L
        /** How often to pull rules from Matka Boska. */
        private const val SYNC_INTERVAL_MS = 5 * 60_000L
        /** Ignore back-to-back events; window content changes fire constantly. */
        private const val MIN_EVALUATE_GAP_MS = 700L
        /** Don't re-show the block screen for the same rule inside this window. */
        private const val BLOCK_COOLDOWN_MS = 4_000L
        /** Guard against counting a screen-off gap as browsing time. */
        private const val MAX_SEGMENT_SEC = 60
    }

    private val handler = Handler(Looper.getMainLooper())

    /** Host or package currently in the foreground, if it is worth counting. */
    private var activeTarget: String? = null
    private var activeSince = 0L

    private var lastEvaluateAt = 0L
    private var lastLoggedTarget: String? = null
    private var lastSyncAt = 0L
    private val io = Executors.newSingleThreadExecutor()
    private var lastBlockRule: String? = null
    private var lastBlockAt = 0L

    private val ticker = object : Runnable {
        override fun run() {
            maybeSyncRules()
            evaluate()
            handler.postDelayed(this, TICK_MS)
        }
    }

    /**
     * Rules are owned by the PWA. Pull them on a slow timer and cache them, so
     * blocking keeps working unchanged when the phone is offline. A failed fetch
     * deliberately leaves the cache alone rather than unblocking everything.
     */
    private fun maybeSyncRules() {
        val now = SystemClock.elapsedRealtime()
        if (lastSyncAt != 0L && now - lastSyncAt < SYNC_INTERVAL_MS) return
        lastSyncAt = now
        if (!Store.isConfigured(this)) return
        io.execute {
            val fetched = Api.rules(this)
            if (fetched != null) {
                Store.setRules(this, fetched)
                Store.markSynced(this)
                Log.d(TAG, "synced ${fetched.size} rules")
            }
            // Yesterday too, so a day that ended offline still lands.
            Api.pushUsage(this, Store.dayKey(1))
            Api.pushUsage(this, Store.today())
        }
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                // Screen went off: stop the clock rather than billing the whole night.
                Intent.ACTION_SCREEN_OFF -> account(null)
                // Unlocked and back in use — the "how often do I pick this up" number.
                Intent.ACTION_USER_PRESENT -> Store.bumpStat(this@BlockerService, "screen")
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "service connected")
        ContextCompat.registerReceiver(
            this,
            screenReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_USER_PRESENT)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        handler.post(ticker)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastEvaluateAt < MIN_EVALUATE_GAP_MS) return
        lastEvaluateAt = now
        evaluate()
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        stop()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        stop()
        super.onDestroy()
    }

    private fun stop() {
        handler.removeCallbacks(ticker)
        io.shutdownNow()
        account(null)
        try {
            unregisterReceiver(screenReceiver)
        } catch (e: IllegalArgumentException) {
            // Already unregistered; nothing to do.
        }
    }

    // ---- core -----------------------------------------------------------

    private fun evaluate() {
        val root = rootInActiveWindow
        val target = root?.let { targetOf(it) }

        account(target)
        if (target == null) return

        val rule = Store.ruleFor(this, target)
        if (target != lastLoggedTarget) {
            lastLoggedTarget = target
            Log.d(TAG, "target=$target rule=${rule?.pattern ?: "none"}")
        }
        if (rule == null) return

        // A habit checked in on the block screen buys a few minutes. Time still
        // counts against the daily budget while the pass runs.
        if (Store.hasActivePass(this, rule.pattern)) return
        if (rule.isAlwaysBlocked || Store.remainingSeconds(this, rule) <= 0) {
            block(rule, target)
        }
    }

    /** Host for a browser window, package name for anything else. */
    private fun targetOf(root: AccessibilityNodeInfo): String? {
        val pkg = root.packageName?.toString() ?: return null
        if (pkg == packageName || pkg in IGNORED_PACKAGES) return null
        val urlIds = BROWSER_URL_IDS[pkg] ?: return pkg
        val raw = addressBarText(root, urlIds) ?: return null
        return hostOf(raw)
    }

    private fun addressBarText(root: AccessibilityNodeInfo, ids: List<String>): String? {
        for (id in ids) {
            val nodes = root.findAccessibilityNodeInfosByViewId(id)
            if (nodes.isNullOrEmpty()) continue
            val node = nodes[0]
            // While the bar is focused the user is typing, not viewing a page.
            if (node.isFocused) return null
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrEmpty()) return text
        }
        return null
    }

    /**
     * Chrome elides the address bar down to "reddit.com", so accept a bare host
     * as well as a full URL. Anything with a space is a search query or the
     * placeholder text, not an address.
     */
    private fun hostOf(raw: String): String? {
        var s = raw.trim().lowercase()
        if (s.isEmpty() || s.contains(' ') || !s.contains('.')) return null
        if (!s.contains("://")) s = "https://$s"
        val host = try {
            URI(s).host
        } catch (e: Exception) {
            null
        } ?: return null
        return host.removePrefix("www.")
    }

    /**
     * Bill the time since the last call to whatever was in the foreground, then
     * switch the clock over to [target].
     */
    private fun account(target: String?) {
        val now = SystemClock.elapsedRealtime()
        val previous = activeTarget
        if (previous != null) {
            val elapsed = ((now - activeSince) / 1000L).toInt().coerceIn(0, MAX_SEGMENT_SEC)
            if (elapsed > 0) Store.addUsage(this, previous, elapsed)
        }
        activeTarget = target
        activeSince = now
    }

    private fun block(rule: Rule, target: String) {
        val now = SystemClock.elapsedRealtime()
        if (rule.pattern == lastBlockRule && now - lastBlockAt < BLOCK_COOLDOWN_MS) return
        lastBlockRule = rule.pattern
        lastBlockAt = now
        Log.d(TAG, "BLOCKING $target via rule ${rule.pattern}")
        Store.bumpStat(this, "blocks")

        // Back out of the page first, then explain why.
        performGlobalAction(GLOBAL_ACTION_BACK)

        val intent = Intent(this, BlockActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            putExtra(BlockActivity.EXTRA_TARGET, target)
            putExtra(BlockActivity.EXTRA_LIMIT_MINUTES, rule.dailyLimitMinutes)
            putExtra(BlockActivity.EXTRA_RULE, rule.pattern)
            putExtra(BlockActivity.EXTRA_EMERGENCY, rule.allowEmergency)
        }
        startActivity(intent)
    }
}
