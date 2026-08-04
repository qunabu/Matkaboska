# Matka Boska 🌈 — Meal Planner PWA

A Polish Progressive Web App for meal planning, nutrition tracking, and health
management ("Tęczowa Madonna"). Multi-tenant, runs entirely on Cloudflare.

## Stack

| Layer | Technology |
|---|---|
| Runtime / hosting | Cloudflare Worker + Workers Static Assets |
| API | Hono (TypeScript) |
| Database | Cloudflare D1 (SQLite via Drizzle ORM) |
| KV / AI | Cloudflare KV, Workers AI (Whisper voice notes) |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS (class-based dark mode) |
| State | TanStack Query |
| PWA | vite-plugin-pwa (Workbox) |
| Push | Web Push (VAPID) |
| LLM | Anthropic Messages API — **per-user key** (Settings → Integracje) |
| Auth | Self-hosted Google OAuth (OIDC), D1 sessions — *not* Cloudflare Access |
| Deploy | Cloudflare Workers Builds (git push) + Wrangler |

## Features

- **Recipes** — CRUD, categories, macros per serving incl. **iron (Fe)**; AI macro
  estimation (per-user Anthropic key); import from JSON; one-click **starter import**
  of a shared recipe set for new/empty accounts.
- **Meal plan** — weekly grid, per-week deep-link URLs (`/plan/:weekStart`),
  "Generuj tydzień" from your recipes, per-day macro+iron totals vs targets.
- **Printable / shareable plan** — print view with daily-average macros header +
  read-only public share link (`/p/:token/:weekStart`).
- **Shopping lists** — generated from the plan, split into "do kupienia"/"kupione",
  **Frisco** cart integration (fill cart, per-item search & pick, "kupione z Frisco"),
  pantry ("mam w domu"), link items back to their recipe (modal).
- **Diary / tracking** — daily food log, water, macro donut & week charts, copy an
  entry to any day (default today), ready-product picker.
- **Supplements, chores, habits, reminders** — recurring push nags via cron.
- **Notifications center** — bell with unread badge, Facebook-style read/unread list,
  chime sound; every push is also recorded in-app.
- **Onboarding** — empty accounts get ≥10-dish + kcal/protein setup that builds recipe
  JSON via an external LLM (Claude/ChatGPT deep link), or import the starter set.
- **Theme** — SpaceX-style dark mode (default) + light, with animations and sounds.
- **Admin panel** (`/admin`) — per-account usage stats + account deletion (admins only).

## Auth & multi-tenancy

Self-hosted Google OAuth (OIDC) in the Worker (ported from the *garaz* app — no
Cloudflare Access). The signed-in Google email is the tenant id (`user_id`); every
table is scoped by it. Sessions live in D1 (`sessions`), cookie `sid`.

- Add `https://<host>/api/auth/google/callback` to the Google OAuth client's
  authorized redirect URIs.
- Access control: `ALLOWED_GOOGLE_EMAILS` / `ALLOWED_GOOGLE_DOMAINS` (both empty =
  any Google account may sign in; each gets an isolated tenant).

## Env vars & secrets

**Worker secrets** (`npx wrangler secret put …`):

| Name | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `VAPID_PRIVATE_KEY` | Web Push private key |

**`wrangler.toml` `[vars]`:**

| Name | Purpose |
|---|---|
| `APP_VERSION` | Stamped at deploy (git SHA + timestamp) |
| `ANTHROPIC_MODEL` | Model id, default `claude-sonnet-4-6` |
| `VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | Web Push public key + contact |
| `ALLOWED_GOOGLE_DOMAINS` / `ALLOWED_GOOGLE_EMAILS` | Sign-in allowlist (empty = open) |
| `STARTER_RECIPES_USER` | Account whose recipes new users may import |
| `ADMIN_EMAILS` | Comma list of admin emails (admin panel) |
| `FRISCO_WAREHOUSE` | Default Frisco region (e.g. `GDA`) |
| `DEV_USER_EMAIL` | Local-dev identity when Google OAuth isn't configured |

**Per-user (not shared, entered in-app → Settings → Integracje, stored in D1):**
Anthropic API key, Frisco login/password/warehouse. There is intentionally **no**
shared env fallback for these.

## Setup

```bash
npm install                                   # postinstall regenerates PWA icons from icon-master.png
npx wrangler d1 create meal-planner-db        # → database_id into wrangler.toml
npx wrangler kv namespace create KV           # → id into wrangler.toml
npx web-push generate-vapid-keys              # public → vars, private → secret
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put VAPID_PRIVATE_KEY
```

Local dev: `cp .dev.vars.example .dev.vars` and fill values (gitignored).

## Database

```bash
npm run db:generate            # drizzle-kit generate
npm run db:migrate:local       # apply locally
npm run db:migrate:remote      # apply to production
npm run db:seed                # seed recipes + plan
```

## Development

```bash
npm run dev                    # vite build --watch + wrangler dev
```

## Deploy

Primary path is **Cloudflare Workers Builds** — a push to `main` builds and deploys
automatically (no GitHub token). It does **not** run D1 migrations, so apply new
migrations first. Manual deploy:

```bash
npm run deploy                 # build → d1 migrations --remote → wrangler deploy
```

`.npmrc` sets `legacy-peer-deps=true` so `npm ci` resolves wrangler's peer deps.

## PWA update flow

Service worker uses `registerType: 'prompt'`; a Polish "Dostępna nowa wersja" banner
appears when a new build is waiting. `/api/version` drives update checks; `APP_VERSION`
(git SHA + timestamp) is shown in Settings → O aplikacji with the build date.

## Live URL

`https://meal-planner.qunabu.workers.dev`
