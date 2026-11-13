# ERA Lab cloud copy (free tier)

The app works without any of this: with no Supabase settings it keeps everything on the device.
With them, Settings shows **Cloud copy**: sign in with a code sent by email, and the phone and the computer stay in step.

| Piece | Service (free plan) | Job |
|---|---|---|
| Database, sign-in, permissions | Supabase | One table, `records`. Each coach reaches only their own rows (row-level security) |
| Sign-in emails | Resend, as Supabase's mail sender | Supabase's own sender only reaches the project's team and sends about 2 an hour. Resend allows 3,000 a month (100 a day) |
| Hosting | GitHub Pages | Serves the app's code. No athlete data |
| Keep-alive | GitHub Actions (`.github/workflows/keep-alive.yml`) | A free Supabase project pauses after 7 days unused; this pings it every 3 days |

**Never uploaded:** athletes under 18, athletes with no birth date, and every session, plan, goal, assessment and
review of theirs. The live range session and video files stay on the device too.

## Set it up once (about 20 minutes)

1. **Supabase:** create a project at supabase.com (region: Frankfurt `eu-central-1` is the closest to Egypt).
   SQL Editor → run `migrations/0001_records.sql`, then `migrations/0002_reviews_and_ping.sql`.
2. **Email code:** Authentication → Emails → *Magic Link* template: replace the body with
   `<p>Your ERA Lab code: <b>{{ .Token }}</b></p>`. The app signs in with the code, not the link, so it works from the
   offline file and the home-screen app too.
3. **Resend:** create an account at resend.com, add and verify a domain you own (a few DNS records), create an API key.
   In Supabase → Authentication → Emails → SMTP Settings: host `smtp.resend.com`, port `465`, user `resend`,
   password = the Resend API key, sender e.g. `ERA Lab <login@your-domain>`.
   Without a domain, skip this step: sign-in still works for the email that owns the Supabase project.
4. **Keys into the app:** Supabase → Project Settings → API Keys. Copy the project URL and the **publishable** key.
   - Local build: copy `.env.example` to `.env.local` and fill both in.
   - GitHub: repository Settings → Secrets and variables → Actions → **Variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
     The next push builds the app with them and starts the keep-alive.
5. Open the app → Settings → Cloud copy → sign in. Do the same on the second device.

The publishable key (`sb_publishable_...`) is meant to be public; the permission rules protect the data.
The **secret** key (`sb_secret_...`) skips every rule: never put it in the app, a `VITE_` variable, a GitHub variable or git.
If it leaks, rotate it in Project Settings → API Keys.

## How sync behaves

- The device is the working copy; the app keeps working offline. It syncs on opening, on coming back into view,
  when the connection returns, and 5 seconds after any change.
- Changed on one device: the change travels. Deleted on one device: deleted on the other.
- Changed on both since the last sync: the device syncing now wins; the other version is kept and goes into the next
  backup file (`syncConflicts`).
- A birth date corrected to under 18: the athlete's records are replaced in the cloud by stubs holding only their ids,
  and other devices keep their copy without uploading it again.
- Settings → **Delete cloud copy** erases everything in the cloud; the device keeps its data.

`rls.test.js` proves the permission rules on a local Postgres; `src/sync.test.js` runs two devices against a stand-in
for the table. Both run with `npm test`.
