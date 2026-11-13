# RACM design system

Written from the built app on 2026-11-13. It applies the owner's brand design system (v3, June 2026) to a working tool.
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
| `--yellow` | `#FFFF00` | Only on black: the Range button, the running end total, the 9/10/X ring |
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
- Radius: 4 px inputs, 8 px buttons and chips, pill only for badges and the stage sub-navigation.
- Minimum touch target 44 px; primary actions on the range are 52 px tall.
- Sections are separated by a 2 px black rule with the heading under it, like a score sheet. No boxed cards, no shadows on content. The only shadow is the plotting magnifier, which floats above the target.

## Components

- **Shell:** black header (wordmark, archer picker, language, settings) and a black stage bar with six stages: Home, Plan, Range, Review, Assess, Report. Range is a yellow disc. From 900 px the bar becomes a rail on the leading side.
- **Sub-navigation:** pills under the header for stages with more than one screen (Plan: planner, goals, exercises. Assess: rubric, sessions).
- **End strip:** an end's arrow values as square cells in target colours (gold, red, blue, black, white) on a black bar. The signature of the app; used on Home, the archer screen and the Range screen. Always left-to-right, in both languages.
- **Attention row:** name, the reason in red in plain words, the last end strip, and one outlined action that goes to the screen that fixes it.
- **On-track row:** name, last session line, arrow average with a rising, falling or steady arrow.
- **Cycle row:** stage label, latest fact, supporting line, figure, chevron. Opens that stage for the archer.
- **Buttons:** blue filled (primary), blue outlined (secondary), red outlined (destructive). Selected choices are black with white text.
- **Logo:** the ERA archer mark on a white tile at the start of the header, next to the RACM wordmark, and as the app icon on a white square. Its outlines are black, so it never sits directly on black and is never recoloured.
- **Icons:** 24 px grid, 1.5 px stroke, never filled (`src/icons.jsx`). The archery icons are the brand's own. No emoji or text symbols as icons.

## Review stage (video)

Video review is a dark room: black ground, white text, light blue `#6496FF` for actions on black, and the brand's yellow
for the next phase to mark, which is allowed because everything there sits on black. Phase colours are data, not brand.
Its styles are generated into `src/review/review.css` and scoped to `.lab`, so they neither reach the rest of the app nor inherit from it.
It keeps its own three-pane layout (clips, video, phases) and, on a phone, its own Clips / Video / Phases tabs above the stage bar.

## States and behaviour

- Focus: 3 px blue ring on white, yellow ring on black.
- Hover on rows: the name turns blue. Press: buttons scale to 98%.
- Motion is limited to short press and progress transitions, and is removed under "reduce motion".
- Empty home screen: one sentence and one action to add the first archer.
- Right-to-left: layout mirrors through logical properties; chevrons and trend arrows flip; end strips do not.

## Recorded exceptions

- The design checker flags Inter as an overused typeface. It stays, because the brand system fixes it as the body face (`.impeccable/config.json`).
- Planner phase colours and exercise category dots are data categories set by the method, not by this system.
