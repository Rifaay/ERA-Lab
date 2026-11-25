# ERA Lab design system

Written from the built app on 2026-11-13; brought up to date on 2026-11-21. It applies the owner's brand design system (v3, June 2026) to a working tool.
Source of truth for values: `src/index.css`. Product facts: `PRODUCT.md`.

## Scene

A coach standing at an outdoor archery range in sunlight, phone in one hand, between ends. Later, the same coach at a desk.
That scene decides the surface: **white work area for sun, black shell, large touch targets.**

## Colour

| Token | Value | Job |
|---|---|---|
| `--black` | `#000000` | Shell (header, stage bar), section rules, selected state, body text |
| `--white` | `#FFFFFF` | Work surface |
| `--blue` | `#0004FF` | Every action: primary buttons, outlined buttons, links, focus ring |
| `--blue-press` | `#0003B8` | Pressed and hover state of a blue button |
| `--blue-tint` | `#EDEEFF` | Hover fill of an outlined button, quiet info badges |
| `--red` | `#FF0000` | Fills only: the 7 and 8 ring in an end strip |
| `--red-text` | `#C40000` | "Needs attention" text and destructive actions. Brand red is 4:1 on white, too low for small text, so text uses this darker red (5.9:1) |
| `--yellow` | `#FFFF00` | Only on black: the centre stage disc, the running end total, the 9/10/X ring, the Stats average |
| `--green-text` | `#006B3A` | Success messages |
| `--g50` to `--g800` | `#F8F8F8` … `#1A1A1A` | Quiet fills, rules, secondary text (`--g500` `#606060` is the lightest text allowed on white) |
| `--edge` | `#767676` | Borders of inputs and choice chips (4.5:1 on white) |

Rules carried from the brand system:
- Yellow is a spotlight, never a stage, and never sits on white. Anything yellow has black behind it.
- Blue and red are never placed on each other.
- One blue primary action per screen section.
- Red means "needs the coach". It is not decoration and not a category colour.

## Type

| Role | Face | Use |
|---|---|---|
| Display | Barlow Condensed 700/800, uppercase | Headings, buttons, tabs, numbers, the wordmark |
| Body | Inter 400/500/600 | Everything read as a sentence, form labels, names |
| Arabic | Noto Kufi Arabic 500/700 | All Arabic text, in both roles; no letter-spacing, taller line height |

Sizes: page heading 30 px (home and archer headings scale 34 to 52 px), section heading 17 px, body 15 px, names 17 px, secondary 14 px, smallest text 12 px (stage bar labels). Figures use tabular numerals. Body text never goes below 14 px on a form.

## Space, shape, touch

- Spacing in multiples of 4 px; 16 px page gutter on phones, 32 px from 900 px wide; content column capped at 760 px.
- Radius: 4 px inputs, 8 px buttons and chips, 12 px for the segmented control's track, pill only for badges and the stage sub-navigation.
- Minimum touch target 44 px; primary actions on the range are 52 px tall.
- Sections are separated by one 2 px black rule with the heading under it, like a score sheet; never two rules together. No shadows on content. The only shadow is the plotting magnifier, which floats above the target. Boxed exceptions: the Stats hero (black, the screen's one moment) and goal suggestions (a 1.5 px grey outline, no coloured side stripe).

## Components

- **Shell:** black header (logo tile, the "ERA LAB" wordmark, archer picker, language, settings) and a black stage bar with five stages: Home, Plan, Video, Range, Progress. Video is the yellow disc in the centre. From 900 px the bar becomes a rail on the leading side. On narrow phones the wordmark hides so the archer picker gets the width.
- **Archer picker:** only in the header. A screen with no archer chosen lists the archers instead; a chosen archer is never picked again inside a screen, and headings name the screen, not the archer.
- **Sub-navigation:** pills under the header for a stage's screens (Plan: planner, goals, exercises. Range: live scores, plot. Progress: stats, report, rubric, sessions). Labels stay short enough for four to fit at 390 px.
- **Segmented control:** the one control for views inside a screen (Season / Load / Rules / Send, Calendar / Weeks, Week / Month, rubric areas). A grey track; the chosen view black with white text. Range's numbered steps (Setup, Range, Review) are a stepper, not tabs.
- **Archer's app:** the same shell with four tabs (Range as the yellow disc, Plan, Results, Me); a send-state line in the header.
- **Season calendar:** twelve month cards tinted by the plan weeks' phases, then a Monday-first month grid, then a day editor (focus, arrows, exercises, materials with web links, note).
- **End strip:** an end's arrow values as square cells in target colours (gold, red, blue, black, white) on a black bar. The signature of the app; used on Home, the archer screen and the Range screen. Always left-to-right, in both languages.
- **Attention row:** name, the reason in red in plain words, the last end strip, and one outlined action that goes to the screen that fixes it.
- **On-track row:** name, last session line, arrow average with a rising, falling or steady arrow.
- **Cycle row:** stage label, latest fact, supporting line, figure, chevron. Opens that stage for the archer.
- **Buttons:** blue filled (primary), blue outlined (secondary), red outlined (destructive). Selected choices are black with white text.
- **Logo:** the ERA archer mark on a white tile at the start of the header, next to the ERA LAB wordmark, and as the app icon on a white square. Its outlines are black, so it never sits directly on black and is never recoloured.
- **Icons:** 24 px grid, 1.5 px stroke, never filled (`src/icons.jsx`). The archery icons are the brand's own. No emoji or text symbols as icons.

## Review stage (video)

Video review is a dark room: black ground, white text, light blue `#6496FF` for actions on black, and the brand's yellow
for the next phase to mark, which is allowed because everything there sits on black. Phase colours are data, not brand.
Its styles are `src/review/labeller.css`, scoped to `.lb`. The Labeller covers the whole screen: a header (back to Clips, the shot, Phases & notes), the picture, a phase timeline, one tray of tools, and a dock of five (Play, Phases, Points, Draw, More). Phases & notes is a sheet on a phone and a side panel from 1000 px. Anything on the picture is moved by pressing and holding it (a loupe shows the spot under the finger) and removed only by flicking it down; it drops and fades as it goes. Pinch zooms the picture and its overlay together.

## States and behaviour

- Focus: 3 px blue ring on white, yellow ring on black.
- Hover on rows: the name turns blue. Press: buttons and chips scale to 98%; full-width rows only darken.
- Motion (`src/motion.css`): a screen fades in once in 140 ms, with no per-block stagger, because stages are switched dozens of times a session. Plotting, the score pad, ends and filters never animate. Panels and toasts rise 8 px; nothing animates a blur or a layout property. The data landing is the one slower moment: bars grow and the group ring moves to the new period (650 ms). A live dot pulses only on something really live. Under "reduce motion", fades stay and all movement goes.
- Empty home screen: one sentence and one action to add the first archer.
- Labels and buttons in sentence case in the source text (buttons and headings display in uppercase Barlow); no exclamation marks.
- Right-to-left: layout mirrors through logical properties; chevrons and trend arrows flip; end strips do not.

## Recorded exceptions

- The design checker flags Inter as an overused typeface. It stays, because the brand system fixes it as the body face (`.impeccable/config.json`).
- Planner phase colours and exercise category dots are data categories set by the method, not by this system.
