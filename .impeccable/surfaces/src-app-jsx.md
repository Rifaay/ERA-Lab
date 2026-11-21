---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/screens/CoachDashboard.jsx"]
---

# App shell and coach home

Scope: the app shell and navigation (`src/App.jsx`), the coach home (`src/screens/CoachDashboard.jsx`) and the archer screen it opens. Visitor mode: Operate. Phone first, desktop second; English and Arabic.

Audience and job: one coach, standing at an outdoor range or at a desk, deciding who needs attention and whether each archer is improving, then acting on it.

Chosen structure: "Who needs you" as home, with "One archer at a time" opening when an archer is tapped (the owner's choice, 2026-11-12). Memorable moment: the end strip, an end's arrow values set in target colours on a black bar.

Must stay untouched: all stored data and screen functions; the brand system in PRODUCT.md.

Unresolved: none recorded (logo supplied 2026-11-13; archers have their own app since 2026-11-14).

## Direction contract

THESIS: The home screen answers one question, who needs the coach this week and why. It refuses the dashboard of equal stat tiles and identical athlete cards.

OWN-WORLD: The owner's brand system. Black shell bands, white work surface, blue for every action, red only for what needs attention, yellow only on black. Barlow Condensed uppercase for headings, numbers and buttons; Inter for reading; Noto Kufi Arabic in Arabic. Stroke icons at 1.5 px. Arrow values appear as square cells in target colours on a black bar.

STORY: The coach opens the app, sees how many archers need them and the reason in plain words, taps one, sees that archer's plan, range, assessment, goals and report in order, and starts a range session from there.

FIRST VIEWPORT: Black header with the wordmark, language switch and settings; a large count line ("2 archers need you") with the date beneath. Then the attention list: name, reason in red, last end as an end strip, one outlined blue action. Then archers on track: name, last session line, arrow average with trend. Fixed black bottom bar with five stages; Video is the yellow centre button.

FORM: Ranked attention list leading to a per-archer cycle screen; position 3 then 4 on the ordered list of seven. seed:29066dc706d74709

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
