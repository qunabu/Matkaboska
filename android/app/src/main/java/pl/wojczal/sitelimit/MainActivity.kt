package pl.wojczal.sitelimit

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var syncStatus: TextView
    private lateinit var rulesContainer: LinearLayout
    private lateinit var spendContainer: LinearLayout
    private lateinit var spendTotal: TextView
    private lateinit var btnRange: Button
    private lateinit var heroTime: TextView
    private lateinit var heroDelta: TextView
    private lateinit var statBlocks: TextView
    private lateinit var statUnlocks: TextView
    private lateinit var statScreen: TextView
    private lateinit var inputServerUrl: EditText
    private lateinit var inputToken: EditText

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    /** Stats window: 1 = today, 7 = the retained week. */
    private var rangeDays = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        applySystemBarInsets(findViewById(R.id.root))

        statusText = findViewById(R.id.statusText)
        syncStatus = findViewById(R.id.syncStatus)
        rulesContainer = findViewById(R.id.rulesContainer)
        spendContainer = findViewById(R.id.spendContainer)
        spendTotal = findViewById(R.id.spendTotal)
        btnRange = findViewById(R.id.btnRange)
        heroTime = findViewById(R.id.heroTime)
        heroDelta = findViewById(R.id.heroDelta)
        statBlocks = findViewById(R.id.statBlocks)
        statUnlocks = findViewById(R.id.statUnlocks)
        statScreen = findViewById(R.id.statScreen)
        inputServerUrl = findViewById(R.id.inputServerUrl)
        inputToken = findViewById(R.id.inputToken)

        findViewById<Button>(R.id.btnAccessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        findViewById<Button>(R.id.btnOverlay).setOnClickListener {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
            )
        }

        findViewById<Button>(R.id.btnSaveServer).setOnClickListener {
            Store.setServer(this, inputServerUrl.text.toString(), inputToken.text.toString())
            sync()
        }

        findViewById<Button>(R.id.btnSync).setOnClickListener { sync() }

        btnRange.setOnClickListener {
            rangeDays = if (rangeDays == 1) Store.DAYS_KEPT else 1
            refresh()
        }

        findViewById<Button>(R.id.btnClearStats).setOnClickListener {
            Store.clearAllUsage(this)
            refresh()
        }
    }

    override fun onResume() {
        super.onResume()
        inputServerUrl.setText(Store.serverUrl(this))
        inputToken.setText(Store.deviceToken(this))
        refresh()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    private fun sync() {
        if (!Store.isConfigured(this)) {
            syncStatus.text = "Podaj adres serwera i token urządzenia."
            return
        }
        syncStatus.text = "Synchronizuję…"
        io.execute {
            val fetched = Api.rules(this)
            main.post {
                if (isFinishing || isDestroyed) return@post
                if (fetched == null) {
                    syncStatus.text = "Nie udało się połączyć. Sprawdź adres i token."
                } else {
                    Store.setRules(this, fetched)
                    Store.markSynced(this)
                    Toast.makeText(this, "Pobrano ${fetched.size} reguł", Toast.LENGTH_SHORT).show()
                }
                refresh()
            }
        }
    }

    private fun refresh() {
        renderToday()
        renderStatus()
        renderSyncStatus()
        renderRules()
        renderSpend()
    }

    private fun renderToday() {
        val todaySeconds = Store.secondsForDay(this, Store.today())
        val yesterdaySeconds = Store.secondsForDay(this, Store.dayKey(1))
        heroTime.text = Store.formatDuration(todaySeconds)

        val diff = todaySeconds - yesterdaySeconds
        heroDelta.text = when {
            yesterdaySeconds == 0 -> "brak danych z wczoraj"
            diff < 0 -> "↘ ${Store.formatDuration(-diff)} mniej niż wczoraj"
            diff > 0 -> "↗ ${Store.formatDuration(diff)} więcej niż wczoraj"
            else -> "tyle samo co wczoraj"
        }
        // Less time than yesterday is the win, so that's the green one.
        heroDelta.setTextColor(
            when {
                yesterdaySeconds == 0 -> Color.GRAY
                diff < 0 -> Color.parseColor("#2E7D32")
                diff > 0 -> Color.parseColor("#C62828")
                else -> Color.GRAY
            }
        )

        val stats = Store.statsFor(this, Store.today())
        statBlocks.text = stats.blocks.toString()
        statUnlocks.text = stats.unlocks.toString()
        statScreen.text = "Telefon odblokowany ${stats.screenUnlocks}× dziś"
    }

    private fun renderStatus() {
        val accessibilityOn = isAccessibilityServiceEnabled(this)
        val overlayOn = Settings.canDrawOverlays(this)
        statusText.text = buildString {
            append(if (accessibilityOn) "✓" else "✗")
            append(" Accessibility service\n")
            append(if (overlayOn) "✓" else "✗")
            append(" Display over other apps")
            if (!accessibilityOn || !overlayOn) {
                append("\n\nOba są wymagane, żeby blokowanie działało.")
            }
        }
    }

    private fun renderSyncStatus() {
        // Leave an in-flight or error message from sync() alone.
        if (syncStatus.text.startsWith("Synchronizuję") || syncStatus.text.startsWith("Nie udało")) return
        val at = Store.lastSyncAt(this)
        syncStatus.text = if (at == 0L) {
            "Jeszcze nie synchronizowano."
        } else {
            "Ostatnia synchronizacja: " +
                SimpleDateFormat("d MMM, HH:mm", Locale("pl")).format(Date(at))
        }
    }

    private fun renderRules() {
        rulesContainer.removeAllViews()
        val rules = Store.rules(this)
        if (rules.isEmpty()) {
            rulesContainer.addView(hintView("Brak reguł. Dodaj je w Matce Boskiej → Blokady."))
            return
        }
        for (rule in rules) rulesContainer.addView(ruleRow(rule))
    }

    private fun renderSpend() {
        btnRange.text = if (rangeDays == 1) "Dziś" else "${Store.DAYS_KEPT} dni"

        val spend = Store.spend(this, rangeDays)
        spendContainer.removeAllViews()

        if (spend.isEmpty()) {
            spendTotal.text = ""
            spendContainer.addView(hintView("Nic jeszcze nie zapisano."))
            return
        }

        spendTotal.text = "Łącznie ${Store.formatDuration(spend.sumOf { it.seconds })} " +
            "na ${spend.size} stronach i aplikacjach"

        // Bars are relative to the biggest entry, so the top one always fills.
        val max = spend.first().seconds.coerceAtLeast(1)
        for (entry in spend.take(12)) spendContainer.addView(spendRow(entry, max))
        if (spend.size > 12) {
            spendContainer.addView(hintView("+ ${spend.size - 12} więcej"))
        }
    }

    /** Icon · name over a proportional bar · duration. */
    private fun spendRow(entry: Spend, maxSeconds: Int): View {
        val d = resources.displayMetrics.density
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, (8 * d).toInt(), 0, (8 * d).toInt())
        }

        row.addView(ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams((32 * d).toInt(), (32 * d).toInt()).apply {
                marginEnd = (12 * d).toInt()
            }
            setImageDrawable(iconFor(entry.target))
        })

        val middle = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        middle.addView(TextView(this).apply {
            text = labelFor(entry.target)
            textSize = 15f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        })

        val fraction = entry.seconds.toFloat() / maxSeconds
        val track = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (6 * d).toInt()
            ).apply { topMargin = (5 * d).toInt() }
            setBackgroundResource(R.drawable.bar_track)
        }
        track.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, fraction)
            setBackgroundResource(R.drawable.bar_fill)
        })
        track.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f - fraction)
        })
        middle.addView(track)
        row.addView(middle)

        row.addView(TextView(this).apply {
            text = Store.formatDuration(entry.seconds)
            textSize = 15f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding((12 * d).toInt(), 0, 0, 0)
        })

        return row
    }

    /** Real launcher icon for an installed app; a globe for a website. */
    private fun iconFor(target: String) = try {
        packageManager.getApplicationIcon(target)
    } catch (e: Exception) {
        androidx.core.content.ContextCompat.getDrawable(this, R.drawable.ic_globe)
    }

    /** Apps get their display name; hosts stay as they are. */
    private fun labelFor(target: String): String = try {
        val info = packageManager.getApplicationInfo(target, 0)
        packageManager.getApplicationLabel(info).toString()
    } catch (e: Exception) {
        target
    }

    /** Read-only: rules belong to the PWA now. */
    private fun ruleRow(rule: Rule): View {
        val row = horizontalRow()
        val used = Store.usedTodayForRule(this, rule)
        val passLeft = Store.passExpiresAt(this, rule.pattern) - System.currentTimeMillis()

        row.addView(TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = buildString {
                append(rule.pattern).append('\n')
                if (rule.isAlwaysBlocked) {
                    append("zawsze blokowana · ${Store.formatDuration(used)} dziś")
                } else {
                    append("${rule.dailyLimitMinutes} min/dzień · ")
                    append("${Store.formatDuration(used)} zużyte · ")
                    append("${Store.formatDuration(Store.remainingSeconds(this@MainActivity, rule))} zostało")
                }
                if (passLeft > 0) append("\n🔓 odblokowane jeszcze ${passLeft / 60_000 + 1} min")
            }
        })
        return row
    }

    private fun horizontalRow(): LinearLayout {
        val vertical = (6 * resources.displayMetrics.density).toInt()
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, vertical, 0, vertical)
        }
    }

    private fun hintView(message: String): TextView = TextView(this).apply {
        text = message
        setPadding(0, 8, 0, 8)
    }

    /** targetSdk 35 draws edge to edge, so the content has to dodge the bars itself. */
    private fun applySystemBarInsets(view: View) {
        ViewCompat.setOnApplyWindowInsetsListener(view) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(v.paddingLeft, bars.top, v.paddingRight, bars.bottom)
            insets
        }
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val component = ComponentName(context, BlockerService::class.java)
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any {
            it.equals(component.flattenToString(), ignoreCase = true) ||
                it.equals(component.flattenToShortString(), ignoreCase = true)
        }
    }
}
