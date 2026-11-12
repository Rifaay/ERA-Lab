# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Coaches** are the primary users. One archery coach runs their own athletes: plans training, records range sessions, assesses technique, tracks progress and writes reports. Confirmed by the owner, 2026-11-12.
- **Athletes** get limited access: plotting their own arrows and filling in session information. Confirmed as intended. Not built yet: the app has no accounts, so today whoever holds the device can do everything.

## Product Purpose

RACM (Rifaay Archery Coaching Methodology) is a structured, data-driven coaching method for recurve and barebow archery. The app is its working tool: it follows the coaching cycle from plan to range to assessment to progress to report, so a coach can see who needs attention and whether each athlete is improving. Success is a coach running real sessions from it instead of paper and separate tools.

## Positioning

It carries one coach's own methodology end to end: four stages (Beginner, Builder, Performer, Elite) gated by benchmarks and a 1 to 5 rubric, undulating periodization with a Ramadan protocol, and arrow-by-arrow range records that feed assessment and reports. It is bilingual Arabic and English for the Egyptian and Arab context. Scoring-only apps do not hold the method.

## Operating Context

- **Mostly on a phone**, at an outdoor range: standing, between ends, often in direct sun, one hand free.
- **Also on a desktop**, for convenience and the more advanced work: planning, reports, and (later) video review.
- Sessions are shot in ends of 3 to 6 arrows at 18 to 90 m on 122, 80 or 40 cm target faces.
- No server. All data stays in the browser on the device; backup and restore move it between devices.
- Opened three ways: hosted web app (installable, offline), one self-contained file, or locally on the PC.

## Capabilities and Constraints

- Screens today: athlete profile, Range (Setup, Range, Review), sessions, rubric assessment, exercises, goals, periodization planner, coach dashboard, PDF report, settings.
- Range: one press-slide-lift on the target records an arrow with position, score and time; ends roll over; miss, score-only keypad, undo, move.
- English and Arabic, with right-to-left layout.
- React 19 with Vite; no UI library; one stylesheet. A strict content security policy allows no network calls except Google Fonts.
- Terms in use: end, arrow, face, stage (S1 to S4), rubric, discipline (recurve RC, barebow BB), WA category.
- Undecided: how athletes get their limited access without accounts; whether a server is added (gated on five paying coaches and on guardian consent for minors).

## Brand Commitments

The owner's personal brand design system is binding: "Ahmed Rifaay — Design System" v3, June 2026 (kept outside this repository, with the v2 PDF).

- **Name:** RACM. Wordmark in the brand system: "AHMED RIFAAY" with "أحمد رفاعي".
- **Colours:** black `#000000`, blue `#0004FF` (primary, interactive), red `#FF0000` (energy, urgency), yellow `#FFFF00` (accent), white `#FFFFFF`; grey scale `#F8F8F8` to `#0D0D0D`; light blue `#6496FF` for dark grounds; success `#00E676`.
- **Colour rules:** yellow only on black or very dark grounds, as a spotlight and never a stage; never blue and red together; white on red only for large bold text; one blue primary action per section.
- **Type:** Barlow Condensed (display, uppercase for interactive components), Inter (body and UI), Noto Kufi Arabic (Arabic). The system says never to substitute them.
- **Spacing:** 8 px base, multiples of 4. Radius: 4 inputs, 8 buttons and cards, 12 panels, 16 modals, pill for badges only.
- **Icons:** stroke only, 1.5 px, never filled; the system ships twelve custom archery icons and names Lucide for interface icons.
- **Logo:** the owner says a logo exists. No logo file was found in the brand folder; its location is still to be given.

## Evidence on Hand

- Real method documents: `..\docs\plans\2026-06-08-RACM-design.md`, `RACM-curriculum.md`, `RACM-benchmarks.md`.
- Real footage and session records exist outside this repository (never shown in the app's own chrome).
- No testimonials, customer logos, pricing or benchmarks against other apps exist. Do not invent any.
- Athlete names are personal data about minors: never use real names in code, tests, screenshots or sample data.

## Product Principles

1. The coach's question comes first: who needs me this week, and are they improving?
2. One action records one thing. Range entry must not take attention away from the athlete.
3. Readable where it is used: outdoors, in sun, on a phone, in either language.
4. Data stays with the coach. Nothing leaves the device unless the coach exports it.
5. The method is the product. Screens follow the coaching cycle, not a list of features.

## Accessibility & Inclusion

- Arabic and English with correct right-to-left layout.
- Readable in direct sunlight; touch targets large enough for use while standing.
- Text contrast at least 4.5:1 and control boundaries at least 3:1 (the brand system's own compatibility matrix already bans its failing pairs).
- Keyboard reachable on desktop; state never shown by colour alone.
