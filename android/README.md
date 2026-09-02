# SiteLimit

A minimal site/app blocker for Android, paired with the Matka Boska PWA.

- **Always block** a site or app.
- **Budget** a site or app: N minutes per day, then it's blocked until midnight.
- **Time spent** per site and app, today or over the last 7 days.
- **Earn 5 minutes** by ticking off a habit from Nawyki on the block screen.
- **Dashboard** — today's screen time vs yesterday, blocks/unlocks counters, and
  a ranked "where does your attention go" list. The same view appears in the PWA.

Rules live in the PWA (Matka Boska → Blokady), not on the phone. The phone pulls
them every 5 minutes and caches them, so blocking keeps working offline. A failed
fetch leaves the cache alone rather than unblocking everything.

Durations are shown in minutes; anything under a minute reads "<1 min".

## Pairing with Matka Boska

1. In the PWA: **Blokady → Urządzenia → Dodaj urządzenie**. The token is shown
   exactly once — copy it then.
2. In SiteLimit: paste `https://meal-planner.qunabu.workers.dev` and the token,
   then **Zapisz i połącz**.

The token is deliberately weaker than a browser session: the API only lets it
read `/api/blocks`, read `/api/habits`, and POST a habit check-in. A lost phone
can't reach the budget or anything else on the account. Deleting the device row
in the PWA revokes it immediately.

## Earning time back

When a site is blocked, the phone asks Matka Boska for today's habits that
haven't been checked in yet and offers them as buttons. Ticking one:

1. POSTs a real check-in to `/api/habits/:id/checkin`,
2. only then grants a local 5-minute pass for that rule,
3. reopens the site you were on.

The server allows one check-in per habit per day, so the number of habits is
also the number of unlocks available in a day — it can't be farmed. Time keeps
counting against the daily budget while a pass runs: a pass buys access, not
amnesty.

Everything else BlockSite does (sync, categories, insights, keyword rules) is
deliberately absent.

## How it works

One `AccessibilityService` (`BlockerService.kt`) watches the foreground window.

- In a known browser it reads the address-bar node (`com.android.chrome:id/url_bar`
  and friends) and reduces it to a host. Chrome elides the bar to `reddit.com`,
  which is exactly the granularity the rules need.
- In any other app the "target" is just the package name, so app blocking comes
  for free.
- Every event (throttled) and every 5 s tick, the elapsed time is billed to
  whichever host or package is in the foreground. Screen-off stops the clock.
  Time is recorded against the concrete host, not the rule that matched it, so
  the stats screen also covers sites you never wrote a rule for, and a rule's
  usage is just the sum of the hosts it covers.
- Over budget → `GLOBAL_ACTION_BACK`, then `BlockActivity` explains why.

Cached rules, earned passes, and a rolling 7 days of per-host time live in
`SharedPreferences` as JSON (`Store.kt`); days older than that are pruned on write. Budgets reset at
midnight because they only ever read today's bucket.

System surfaces (SystemUI, the Pixel launcher, the keyboard) are excluded from
accounting via `IGNORED_PACKAGES`, otherwise they'd dominate the stats list.

There is no VPN and no DNS filtering: neither can tell you *how long* you looked
at a page, which is the whole point of the budget feature.

## Build & install

`local.properties` is deliberately not committed (it hard-codes one machine's
SDK path). `env.sh` sets `ANDROID_HOME` instead, which Gradle accepts just as
well, so a fresh clone builds without creating it.

```sh
# one-time — or just: source ./env.sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"

./gradlew installDebug     # phone plugged in, USB debugging on
```

Or build the APK and sideload it:

```sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## On-device setup (both are required)

1. **Settings → Accessibility → SiteLimit blocker → On.**
   Android will warn about full-screen access. That warning is accurate: the
   service can read the address bar. That is how it works.
2. **Settings → Apps → SiteLimit → Display over other apps → Allow.**
   Without this the service cannot launch the block screen from the background.

Then add rules in the app: `reddit.com` with `20` blocks Reddit after 20 minutes
a day; leave the minutes field empty to block it outright.

## Debugging

The service logs each time the foreground target changes, and every block:

```sh
adb logcat -s SiteLimit
```

`target=… rule=none` means the site was recognised but no rule covers it.
No line at all means the address bar wasn't read — check the browser's view id.

A pattern with no dot ("facebook") matches any label of the host, so it covers
facebook.com, m.facebook.com and facebook.co.uk. A pattern with a dot
("facebook.com") is exact plus subdomains.

## Known limits

- Address-bar view IDs are per-browser and can break on a browser update. Add new
  ones to `BROWSER_URL_IDS` in `BlockerService.kt`.
- Domain granularity only. `youtube.com` blocks all of YouTube, not one channel.
- Incognito windows are covered (same address bar), private browsers with no
  visible URL bar are not.
- Time is sampled every 5 s, so budgets and stats are accurate to about that.
- Stats keep 7 days on the phone and are **also pushed to your Worker** so the
  PWA can render the same dashboard: per-site/per-app seconds plus the day's
  counters, re-sent as a whole day on each sync (the server replaces the day, so
  a repeat is a no-op). If you'd rather that data stayed local, drop the
  `Api.pushUsage` calls in `BlockerService.maybeSyncRules`.
- `QUERY_ALL_PACKAGES` is declared so the usage list can show real app icons and
  names instead of raw package names. Play would scrutinise that; sideloading
  doesn't care.
- Debug builds allow cleartext to localhost (see `src/debug/`) so the app can be
  pointed at `wrangler dev` over `adb reverse tcp:8788 tcp:8788`. Release builds
  stay HTTPS-only.
- **Android 17 Advanced Protection Mode** revokes accessibility privileges from
  apps that don't declare themselves accessibility tools. If blocking silently
  stops working after an OS update, that's the cause. Either leave AAPM off, or
  add `android:isAccessibilityTool="true"` to
  `res/xml/accessibility_service_config.xml` and reinstall.
