package pl.wojczal.sitelimit

import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.addCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.Executors

/**
 * Shown after the service backs out of a blocked page.
 *
 * Offers a way back in: today's un-checked habits from Matka Boska. Ticking one
 * records a real check-in there and buys [Store.PASS_MINUTES] minutes here. Since
 * the server allows one check-in per habit per day, the number of habits is also
 * the number of unlocks available in a day.
 */
class BlockActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TARGET = "target"
        const val EXTRA_LIMIT_MINUTES = "limit_minutes"
        const val EXTRA_RULE = "rule"
        const val EXTRA_EMERGENCY = "emergency"
    }

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private lateinit var target: String
    private lateinit var rule: String
    private lateinit var habitsBox: LinearLayout
    private var allowEmergency = false
    private var pad = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        target = intent.getStringExtra(EXTRA_TARGET) ?: "Ta strona"
        rule = intent.getStringExtra(EXTRA_RULE) ?: target
        val limit = intent.getIntExtra(EXTRA_LIMIT_MINUTES, 0)
        allowEmergency = intent.getBooleanExtra(EXTRA_EMERGENCY, false)

        pad = (24 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
        }

        root.addView(TextView(this).apply {
            text = target
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = if (limit > 0) {
                "Limit $limit min na dziś wyczerpany."
            } else {
                "Zablokowane przez SiteLimit."
            }
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
            setPadding(0, pad / 2, 0, pad)
        })

        habitsBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(habitsBox)

        if (allowEmergency) root.addView(Button(this).apply {
            text = "Dostęp awaryjny (${Store.PASS_MINUTES} min)"
            setOnClickListener { confirmEmergency() }
        })

        root.addView(Button(this).apply {
            text = "OK"
            setOnClickListener { goHome() }
        })

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(pad, pad + bars.top, pad, pad + bars.bottom)
            insets
        }

        setContentView(root, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // Back shouldn't drop you straight back onto the page you were just blocked from.
        onBackPressedDispatcher.addCallback(this) { goHome() }

        loadHabits()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    private fun loadHabits() {
        if (!Store.isConfigured(this)) {
            showNote("Połącz aplikację z Matką Boską, żeby odblokowywać nawykami.")
            return
        }
        showNote("Sprawdzam nawyki…")
        io.execute {
            val habits = Api.openHabits(this)
            main.post {
                if (isFinishing || isDestroyed) return@post
                when {
                    habits == null -> showNote("Brak połączenia — nie mogę sprawdzić nawyków.")
                    habits.isEmpty() -> showNote("Wszystkie nawyki na dziś odhaczone. Do jutra.")
                    else -> showHabits(habits)
                }
            }
        }
    }

    private fun showNote(message: String) {
        habitsBox.removeAllViews()
        habitsBox.addView(TextView(this).apply {
            text = message
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, pad)
        })
    }

    private fun showHabits(habits: List<Api.Habit>) {
        habitsBox.removeAllViews()
        habitsBox.addView(TextView(this).apply {
            text = "Zrobiłeś któryś z nawyków? Odhacz i masz ${Store.PASS_MINUTES} minut."
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, pad / 2)
        })
        for (habit in habits) {
            habitsBox.addView(Button(this).apply {
                text = if (habit.streak > 0) "${habit.name}  🔥${habit.streak}" else habit.name
                setOnClickListener { checkIn(habit, this) }
            })
        }
    }

    private fun checkIn(habit: Api.Habit, button: Button) {
        button.isEnabled = false
        button.text = "…"
        io.execute {
            val ok = Api.checkIn(this, habit.id)
            main.post {
                if (isFinishing || isDestroyed) return@post
                if (!ok) {
                    button.isEnabled = true
                    button.text = habit.name
                    Toast.makeText(this, "Nie udało się zapisać nawyku.", Toast.LENGTH_SHORT).show()
                    return@post
                }
                // Only grant the pass once the server has actually recorded it.
                Store.grantPass(this, rule)
                Store.bumpStat(this, "unlocks")
                Toast.makeText(
                    this,
                    "${habit.name} ✓ — ${Store.PASS_MINUTES} minut dostępu.",
                    Toast.LENGTH_SHORT,
                ).show()
                reopenTarget()
                finish()
            }
        }
    }

    /**
     * The way back in without a habit, for rules that opt into it. Deliberately
     * behind a confirmation and counted separately, so it stays a decision
     * rather than a reflex.
     */
    private fun confirmEmergency() {
        AlertDialog.Builder(this)
            .setTitle("Dostęp awaryjny")
            .setMessage(
                "Odblokuje $target na ${Store.PASS_MINUTES} minut bez odhaczania nawyku.\n\n" +
                    "Użycie zostanie zapisane i widać je w statystykach."
            )
            .setNegativeButton("Anuluj", null)
            .setPositiveButton("Odblokuj") { _, _ ->
                Store.grantPass(this, rule)
                Store.bumpStat(this, "emergency")
                Toast.makeText(
                    this,
                    "Dostęp awaryjny — ${Store.PASS_MINUTES} minut.",
                    Toast.LENGTH_SHORT,
                ).show()
                reopenTarget()
                finish()
            }
            .show()
    }

    /** Put the user back where they were, rather than making them retype the address. */
    private fun reopenTarget() {
        // A package name resolves to a launch intent; anything else is a host.
        val intent = packageManager.getLaunchIntentForPackage(target)
            ?: if (target.contains('.')) Intent(Intent.ACTION_VIEW, Uri.parse("https://$target")) else null
        if (intent == null) return
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (e: Exception) {
            // Nothing sensible to reopen; the pass still stands.
        }
    }

    private fun goHome() {
        startActivity(Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        })
        finish()
    }
}
