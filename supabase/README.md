# ERA Lab cloud copy (free tier)

The app works without any of this: with no Supabase settings it keeps everything on the device.
With them, Coach profile → Security shows **Cloud copy**: sign in with email + password, then a 6-digit code from an
authenticator app (two-step sign-in), and the phone and the computer stay in step.

**Set up on 2026-11-14:** project `ERA Lab` (`snljkhitklnfezxbhirv`, West EU / Ireland, free plan), both migrations run,
Site URL `https://rifaay.github.io/ERA-Lab/`, GitHub variables set. Resend is not set up yet.

| Piece | Service (free plan) | Job |
|---|---|---|
| Database, sign-in, permissions | Supabase | One table, `records`. Each coach reaches only their own rows (row-level security) |
| Sign-in emails | Resend, as Supabase's mail sender | Supabase's own sender only reaches the project's team and sends about 2 an hour. Resend allows 3,000 a month (100 a day) |
| Hosting | GitHub Pages | Serves the app's code. No athlete data |
| Keep-alive | GitHub Actions (`.github/workflows/keep-alive.yml`) | A free Supabase project pauses after 7 days unused; this pings it every 3 days |

**Never uploaded:** athletes under 18, athletes with no birth date, and every session, plan, goal, assessment and
review of theirs. The live range session and video files stay on the device too.

## Set it up once (about 20 minutes)

1. **Supabase:** create a project at supabase.com in an EU region. Turn off *Automatically expose new tables*.
   SQL Editor → run `migrations/0001_records.sql`, then `0002_reviews_and_ping.sql`, then `0003_require_second_step.sql`
   (the data answers only sign-ins that passed both steps), then `0004_archers.sql` (archer accounts, invite codes
   and live scores).
2. **Sign-in email:** Authentication → URL Configuration → Site URL: the app's address. Supabase's own sender emails a
   **link**; opening it on the same device signs in. Its template can only be edited once Resend (step 3) is the
   sender: then add `<p>Or type this code: <b>{{ .Token }}</b></p>` to *Magic link or OTP*, so the offline file and
   the home-screen app can sign in with the code.
3. **Resend:** create an account at resend.com, add and verify a domain you own (a few DNS records), create an API key.
   In Supabase → Authentication → Emails → SMTP Settings: host `smtp.resend.com`, port `465`, user `resend`,
   password = the Resend API key, sender e.g. `ERA Lab <login@your-domain>`.
   Without a domain, skip this step: sign-in still works for the email that owns the Supabase project.
4. **Keys into the app:** Supabase → Project Settings → API Keys. Copy the project URL and the **publishable** key.
   - Local build: copy `.env.example` to `.env.local` and fill both in.
   - GitHub: repository Settings → Secrets and variables → Actions → **Variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
     The next push builds the app with them and starts the keep-alive.
5. **Sign-in rules:** Authentication → Sign In / Providers → Email: keep *Confirm email* on and set the minimum
   password length to 12. Authentication → Multi-Factor: *TOTP (App Authenticator)* enabled.
6. Open the app → Coach profile → Security → Cloud copy → **Create account**, confirm the email, sign in and scan
   the QR code with an authenticator app. Sign in the same way on the second device (same password, same
   authenticator). Add a **backup authenticator** from the same screen, so a lost phone doesn't lock you out.
7. **Archers:** leave **Allow new users to sign up** ON, or archers can't create accounts (turn it off only if no
   archer will ever have their own app). Archers confirm their email like coaches do, and Supabase's own sender only
   emails the project's team: set up Resend (step 3) before inviting archers, or their confirmation emails never arrive.

An account made before passwords existed (2026-11-14, email-code sign-in) has no password: use **Forgot password?**
on the sign-in form, open the emailed link on the same device, set up the authenticator, then choose a password.

The publishable key (`sb_publishable_...`) is meant to be public; the permission rules protect the data.
The **secret** key (`sb_secret_...`) skips every rule: never put it in the app, a `VITE_` variable, a GitHub variable or git.
If it leaks, rotate it in Project Settings → API Keys.

## Archers with their own app

- The coach opens an archer's page → **Create invite code** (adults only: an archer under 18, or with no birth date,
  can't be invited, and nothing of theirs is uploaded). The archer installs ERA Lab, chooses **I'm an archer**, signs
  up with email + password (no authenticator) and types the code. A code works once and lasts 7 days.
- The archer's phone uploads the session being shot about a second after each arrow, into `archer_sessions`. Offline,
  it waits on the phone. Only the linked coach can read those rows, and only after both sign-in steps.
- The coach's **Range → Live scores** asks for them every 5 seconds while open. A finished session is checked, rebuilt
  to the known shape, bound to the coach's own archer profile and saved once into the coach's sessions; from there the
  normal sync carries it. The coach can no longer plot for a linked archer; **Unlink** on the archer's page undoes it.

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
