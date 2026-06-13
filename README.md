# ⚽ Family Beats · World Cup 2026

A tiny app for the **family** to predict the **exact score** of every 2026 World Cup match.
Starts with 5 players and you can **add more anytime** (Settings → Add player). Everyone sees
everyone's picks, bets **lock at kickoff**, real results **sync automatically every day**, and
a **leaderboard** ranks the family.

- **Exact score = 3 points**, **correct result (W/D/L) = 1 point**, otherwise 0.
- 104 matches preloaded; knockout games open for betting automatically once the teams are known.
- Stack: Vite + React (Vercel) · Supabase Postgres · daily Vercel Cron pulling the free,
  no-key [openfootball](https://github.com/openfootball/worldcup.json) feed.

## One-time setup (~5 minutes)

### 1. Supabase (the shared database)
1. Create a free account at [supabase.com](https://supabase.com) → **New project** (pick a
   region near you; any works from Russia).
2. Open **SQL Editor** → paste the entire contents of [`schema.sql`](./schema.sql) → **Run**.
   This creates the tables, the security rules, and seeds all 104 fixtures + 5 players.
3. Open **Project Settings → API** and copy three values:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret — only used server-side)

#### Daily sync inside Supabase (host-independent — recommended)
So the scores update on their own no matter where the site is hosted (Vercel **or**
GitHub Pages), the sync runs from Supabase itself:

1. **Dashboard → Edge Functions → Create a function**, name it **`sync`**, paste the
   contents of [`supabase/functions/sync/index.ts`](./supabase/functions/sync/index.ts),
   and **Deploy**. In the function's settings, turn **Verify JWT off** (it only writes
   public match data).
2. **SQL Editor →** paste [`supabase/cron.sql`](./supabase/cron.sql) → **Run**. This
   schedules the function daily at 06:00 UTC via `pg_cron`. (The URL in that file already
   points at this project; change it if you cloned to a different Supabase project.)

That's it — the in-app **Settings → Sync results now** button also calls this function, so
syncing works on every host.

### 2. Hosting — pick Vercel, GitHub Pages, or both
Both can run side by side off the same `main` branch; the data layer is shared Supabase.

#### Option A — Vercel
1. Push this repo to GitHub (already done if Claude set it up), then go to
   [vercel.com](https://vercel.com) → **Add New → Project → Import** this repo.
   Vercel auto-detects Vite — no build settings to change.
2. Before deploying, add **Environment Variables**:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |
   | `SUPABASE_URL` | your Project URL (again) |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |

3. **Deploy.** Open the URL, go to **Settings → Sync results now** once to pull the latest
   scores. Done — share the link with the family.

The cron in [`vercel.json`](./vercel.json) also re-syncs every day at 06:00 UTC (harmless
duplicate of the Supabase cron; remove it if you only want Supabase to sync).

#### Option B — GitHub Pages (works in Russia without a VPN more often than `*.vercel.app`)
The [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) workflow
builds and publishes the app to Pages on every push to `main`.

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**, add two **repository
   variables** (public client keys, so variables — not secrets — are fine):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

3. Push to `main` (or run the workflow manually). The site appears at
   `https://<your-github-user>.github.io/family-wc2026/`.

> Pages is **static only** — there's no `/api/sync` there, which is exactly why the daily
> sync lives in Supabase. The "Sync results now" button calls the Supabase function, so it
> works on Pages too. If you later use a **custom domain** on Pages, set `base` back to
> `'/'` in [`vite.config.js`](./vite.config.js).

## How it's used
- Everyone opens the same URL, picks **"I am: <name>"** once (Settings lets you rename the
  5 players), then types a score for each upcoming match in their own column.
- A bet can be changed any time **until kickoff**, then it locks (enforced in the database).
- After matches finish, points and the leaderboard update automatically on the next sync.

## Local development
```bash
npm install
cp .env.example .env   # fill in your Supabase values
npm run dev
# regenerate schema.sql from the latest feed:  npm run gen:schema
```

> Russia note: GitHub itself can be flaky from Russia, but that only affects editing the
> code — the running app is served by Vercel, and the data lives in Supabase, both reachable.
