# RACM Coaching app

One app for the coach: athlete profiles, **Range** (arrow-by-arrow session scoring), sessions, rubric assessment,
exercises, goals, planner, dashboard, report and settings. English and Arabic. No server and no accounts: all data
stays in the browser on the device.

## Use it

| Way | What to open | Updates |
|---|---|---|
| Hosted web app | The address the `dist` folder is published at. On a phone: browser menu → Add to Home screen. Works offline after the first visit. | Automatic, next time there is a connection |
| One file, no connection needed | `dist/RACM-offline.html`, copied to the phone or PC | Copy the new file again |
| On this PC | `..\index.html` → RACM Coaching App | After each build |

Each way keeps its own data, because browser storage belongs to the address the app was opened from.
Move data between them with Settings → Download Backup and Restore.

## Build and check

```
npm install
npm test        # storage and range logic
npm run build   # writes dist/ and dist/RACM-offline.html
```

## Publish to GitHub Pages

`.github/workflows/pages.yml` tests, builds and publishes the app on every push to `main`. One-time setup:

1. Create a GitHub account, then an empty **public** repository named `racm-app` (free accounts can only publish Pages from public repositories). The code becomes public; athlete data is never in the code.
2. Before the first push, give the repository a clean history: older local commits contain a real athlete's name in a test file and a personal email address. Use your GitHub "noreply" email for commits from then on.
3. Push `main`. The first push opens a browser window to sign in to GitHub.
4. On GitHub: Settings → Pages → Source: **GitHub Actions**.
5. After about two minutes the app is at `https://<username>.github.io/racm-app/`. On the phone: open it once with a connection, then browser menu → Add to Home screen.

The published app works from a sub-folder and offline (checked locally), and asks search engines not to list it.
The `backend/phase-1-supabase` branch holds paused server work; do not publish it.

## Range

Setup → Range → Review. One press-slide-lift on the target records an arrow with its position, score and time.
A finished session is saved to Sessions (with the full arrow record) and can be downloaded as a
`.racm-session.json` for RACM Labeller, which matches each video clip to its end.

## Where things are

- `src/range.js`: range logic (scoring, ends, undo), tested in `src/range.test.js`
- `src/screens/Range.jsx`: the Range screen
- `src/storage.js`: everything saved in the browser, with backup and restore
- `public/sw.js`: offline support for the hosted app
- `scripts/single-file.mjs`: builds the one-file copy
