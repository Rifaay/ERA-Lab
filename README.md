# ERA Lab

ERA Lab (Egyptian Recurve Archery) is one app for the coach, in six stages that follow the coaching cycle:
**Home** (who needs you), **Plan**, **Range** (arrow-by-arrow scoring), **Review** (video: shot phases, faults, body points),
**Assess** and **Report**. It applies RACM, the Rifaay Archery Coaching Methodology. English and Arabic. No server and no accounts: all data
stays in the browser on the device.

## Use it

| Way | What to open | Updates |
|---|---|---|
| Hosted web app | The address the `dist` folder is published at. On a phone: browser menu → Add to Home screen. Works offline after the first visit. | Automatic, next time there is a connection |
| One file, no connection needed | `dist/ERA-Lab-offline.html`, copied to the phone or PC | Copy the new file again |
| On this PC | `..\index.html` → RACM Coaching App | After each build |

Each way keeps its own data, because browser storage belongs to the address the app was opened from.
Move data between them with Settings → Download Backup and Restore.

## Build and check

```
npm install
npm test        # storage and range logic
npm run build   # writes dist/ and dist/ERA-Lab-offline.html
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

## Review (video)

Open an athlete's folder (Chrome or Edge on a PC), mark the eight shot phases on a clip, tag faults, place body points,
and link the clip to its arrow. Range sessions recorded in the app are offered automatically, matched by time.
Saving writes `clip.labels.json` next to the clip and a short record into the app (verdict, faults, hold time, linked arrow),
which the archer screen shows. On a phone it opens single clips and downloads the labels instead of saving beside the clip.

The Review tool is the stand-alone RACM Labeller, ported by `scripts/port-labeller.py` into `src/review/`.
Those three files are generated: change the Labeller or the script, then run
`py scripts/port-labeller.py "<path to RACM Labeller.html>"`.

## Where things are

- `src/range.js`: range logic (scoring, ends, undo), tested in `src/range.test.js`
- `src/screens/Range.jsx`: the Range screen
- `src/review.js`: the short record kept for each reviewed clip, tested in `src/review.test.js`
- `src/screens/Review.jsx` and `src/review/`: the Review stage
- `src/insights.js`: who needs attention on Home
- `src/storage.js`: everything saved in the browser, with backup and restore
- `public/sw.js`: offline support for the hosted app
- `scripts/single-file.mjs`: builds the one-file copy
