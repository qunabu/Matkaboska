# Meal Planner PWA

A Progressive Web App for personal meal planning, nutrition tracking, and health management. Runs entirely on Cloudflare infrastructure.

## Stack

| Layer | Technology |
|---|---|
| Runtime / hosting | Cloudflare Worker + Workers Static Assets |
| API | Hono (TypeScript) |
| Database | Cloudflare D1 (SQLite via Drizzle ORM) |
| KV cache | Cloudflare KV |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| State | TanStack Query |
| PWA | vite-plugin-pwa (Workbox) |
| Push | Web Push (VAPID) |
| LLM | Anthropic Messages API (server-side only) |
| Auth | Cloudflare Access (Zero Trust, Google IdP) |
| Deploy | Wrangler |

## Prerequisites

- Node.js LTS + npm
- `npm install` (Wrangler is a dev-dependency)
- A Cloudflare account with Workers and D1 enabled

## Secrets & env vars

| Name | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Wrangler secret | Macro estimation via Claude Sonnet |
| `ANTHROPIC_MODEL` | `wrangler.toml` `[vars]` | Model ID, default `claude-sonnet-4-6` |
| `VAPID_PUBLIC_KEY` | `wrangler.toml` `[vars]` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Wrangler secret | Web Push private key |
| `VAPID_SUBJECT` | `wrangler.toml` `[vars]` | Push contact email (`mailto:…`) |
| `ACCESS_AUD` | `wrangler.toml` `[vars]` | Cloudflare Access AUD tag |
| `ACCESS_TEAM_DOMAIN` | `wrangler.toml` `[vars]` | CF Access team domain (`*.cloudflareaccess.com`) |

### Set production secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

### Local dev

```bash
cp .dev.vars.example .dev.vars
# fill in values — this file is gitignored
```

## Setup

### 1. Create the D1 database

```bash
npx wrangler d1 create meal-planner-db
# copy the returned database_id into wrangler.toml
```

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create KV
# copy the returned id into wrangler.toml
```

### 3. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
# public key → wrangler.toml [vars] + .dev.vars
# private key → wrangler secret + .dev.vars (local only)
```

### 4. Database migrations (Phase 1+)

```bash
npm run db:generate                # drizzle-kit generate
npm run db:migrate:local           # apply locally
npm run db:migrate:remote          # apply to production
npm run db:seed                    # import recipes + 30-day plan
```

### 5. Cloudflare Access (auth)

In the Cloudflare Zero Trust dashboard:
1. Add **Google** as an identity provider.
2. Create a **self-hosted Access application** for the worker's hostname.
3. Add a policy allowing your Google account.
4. Copy the **AUD tag** → `ACCESS_AUD` and **team domain** → `ACCESS_TEAM_DOMAIN` in `wrangler.toml`.

Auth is skipped when `ACCESS_TEAM_DOMAIN` is empty (local dev).

## Development

```bash
npm install
npm run dev          # vite --watch + wrangler dev
```

## Deploy

```bash
npm run deploy
# → vite build (stamps APP_VERSION)
# → d1 migrations --remote
# → wrangler deploy --var APP_VERSION:…
```

Every deploy stamps a fresh `APP_VERSION` (git SHA + Unix timestamp) into both the client bundle and the Worker env, which drives the *"Dostępna nowa wersja"* update banner in installed PWAs.

## PWA update flow

- Service worker uses `registerType: 'prompt'` — no silent reloads.
- When a new SW is waiting, a Polish banner appears with an "Odśwież" button.
- On tab focus, the app fetches `/api/version` and triggers an SW update check if the server version differs.
- If `APP_VERSION < minSupported` (from `/api/version`), a blocking *"Wymagana aktualizacja"* screen forces the update.

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/version` | `{ version, builtAt, minSupported }` — never cached |

(Full API is added in Phases 2–7.)

## Build phases

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Scaffold, PWA skeleton, deploy to Cloudflare |
| 1 | Planned | Drizzle schema, migrations, seed |
| 2 | Planned | Recipes + Anthropic macro estimation |
| 3 | Planned | Meal plan views |
| 4 | Planned | Shopping list |
| 5 | Planned | Daily nutrition + water tracking |
| 6 | Planned | Supplements & medications |
| 7 | Planned | Push notifications & reminders |
| 8 | Planned | Offline polish, Lighthouse, QA |

## Live URL

`https://meal-planner.qunabu.workers.dev`
