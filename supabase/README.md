# Supabase backend (phase 1: database and permissions)

`migrations/0001_records.sql` creates one table, `records`. Each coach can read and change only their own rows (row-level security); logged-out visitors get nothing. `rls.test.js` proves this on a local Postgres and runs with `npm test`.

## Apply it
1. Create a project at supabase.com (choose the region closest to Egypt).
2. Dashboard → SQL Editor → paste `migrations/0001_records.sql` → Run.
3. Authentication → Sign In / Providers: keep Email on, turn off the providers you don't use.

## Keys
- **Publishable key** (`sb_publishable_...`): safe in the app. Phase 2 reads it from `.env.local` as `VITE_SUPABASE_PUBLISHABLE_KEY`, next to `VITE_SUPABASE_URL`.
- **Secret key** (`sb_secret_...`): skips every permission rule. Never put it in the app, a `VITE_` variable, or git. Only server code (Vercel Functions, later phases) may use it.

`.env` files are git-ignored. If a secret key is ever committed or shared, rotate it in Dashboard → Project Settings → API Keys.
