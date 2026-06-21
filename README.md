# Insider Tracker

A free, personal-use web app that tracks **SEC Form 4 insider-trading filings** from
official [SEC EDGAR](https://www.sec.gov/edgar) public data.

This is **Stage 1 (MVP)**: Form 4 ingestion + a searchable dashboard. The roadmap
extends through better parsing & history pages (Stage 2), 13D/13G support (Stage 3),
watchlists & alerts (Stage 4), and polish/scaling (Stage 5).

```
insider-tracker/
├── supabase/migrations/   # SQL schema (run in Supabase)
├── worker/                # Node/TS ingestion worker (fetches EDGAR → Postgres)
├── web/                   # Next.js dashboard (reads Postgres)
└── .github/workflows/     # Scheduled ingestion (GitHub Actions cron)
```

## Architecture in one line

A scheduled **worker** pulls Form 4 filings from EDGAR and writes normalized rows to
**Supabase Postgres**; the **Next.js** app only ever *reads* that database. The app
never calls EDGAR on a user request, so it's fast and never hits rate limits.

---

## Setup

### 1. Create the database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. From **Project Settings → API**, note:
   - Project URL
   - `anon` public key (for the web app)
   - `service_role` key (for the worker — keep secret)

### 2. Run the worker locally

```bash
cd worker
cp .env.example .env        # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEC_USER_AGENT
npm install
npm run ingest              # ingest today's filings
npm run ingest:days 7       # backfill the last 7 days
```

> **SEC_USER_AGENT is required** and must contain a real name + email, e.g.
> `Insider Tracker personal-research you@example.com`. SEC throttles/blocks
> anonymous traffic.

### 3. Run the web app locally

```bash
cd web
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + ANON key
npm install
npm run dev                        # http://localhost:3000
```

---

## Deployment (free tier)

- **Database:** Supabase free tier.
- **Web app:** Import the repo into [Vercel](https://vercel.com), set the **Root
  Directory** to `web`, and add the two `NEXT_PUBLIC_*` env vars. Deploy.
- **Ingestion:** Already wired as a GitHub Actions cron
  ([`.github/workflows/ingest.yml`](.github/workflows/ingest.yml)). Add three repo
  secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEC_USER_AGENT`. It runs
  weekdays at 23:00 UTC and can be triggered manually from the Actions tab
  (with a `days` input for backfills).

---

## How ingestion works

1. Fetch EDGAR's daily `master.<date>.idx` index and keep only Form 4 / 4/A rows.
2. Dedupe against the DB by `accession_no` (the global unique filing id).
3. Download each new filing's full submission `.txt`, extract the embedded
   ownership XML, and parse it defensively (every field optional).
4. Upsert issuer, insider, filing, and transaction rows. Idempotent — re-runs never
   create duplicates.
5. Log the run to `ingestion_runs` for debugging.

A single malformed filing is logged and skipped; it never aborts the batch.

## Notes / limits

- Stage 1 stores the **first reporting owner** per filing (multi-owner filings are
  simplified — addressed in Stage 2).
- Tickers come straight from the filing XML and may be missing; Stage 2 adds the
  official CIK↔ticker map.
- RLS is left off for Stage 1 (all data is public, read-only). Enable it in Stage 5.
