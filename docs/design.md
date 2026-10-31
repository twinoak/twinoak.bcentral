# BCentral design language

Written 2026-10-31 for the phase-2 design sprint. This is the one document every screen is
built against. A task that wants to deviate says so in its report; nothing deviates silently.

## What went wrong, in one sentence

Every feature added its own coloured band at the top, so four routine conditions (clock,
storage, drill, update) shout like alarms, and the screens below were styled one component at
a time with no shared scale. The fix is a system, not a palette.

## The look, named

**A calm operations desk.** Light, neutral, dense where data is dense, quiet everywhere else.
One typeface, one accent, colour only where it carries meaning. Nothing decorative: no
gradients, no shadows on cards, no icons that are not actions, no illustrations. Think of a
well-made dispatch console or a modern logbook, not a dashboard demo and not a 1998 intranet.

Three tests for any screen:

1. Can an operator tell *what needs them* in one glance, from the top bar alone?
2. Is every colour on the screen there because it means something?
3. Would it still look right printed in black and white?

## Tokens

All in `app/src/styles/tokens.css`. The contrast script (`scripts/check-contrast.mjs`, run in
`npm run test`) is the arbiter: text ≥ 7:1 on its surface, UI chrome ≥ 3:1, in both modes.
The hex values below are the starting point; a task adjusts them to pass, never the rule.

### Colour

| Token | Light | Use |
| --- | --- | --- |
| `--bg` | `#F4F5F7` | page background |
| `--surface` | `#FFFFFF` | cards, bar, rows |
| `--surface-2` | `#F7F8FA` | table header, expanded row, inset areas |
| `--ink` | `#16191D` | text |
| `--ink-2` | `#3F4753` | secondary text, meta, labels |
| `--rule` | `#DDE1E6` | borders, row separators |
| `--rule-2` | `#BAC1CA` | input borders, stronger dividers |
| `--accent` | `#1E3A5F` | primary action, links, active nav, focus ring, wordmark |
| `--accent-weak` | `#E8EEF6` | selected row, active chip background |
| `--ok` | `#15592F` on `#E6F2EA` | roger, delivered, connected |
| `--warn` | `#6B4A00` on `#FBF1D6` | needs a decision: clock unconfirmed, storage not persistent, update waiting, given up |
| `--danger` | `#8F2017` on `#FBEBE8` | broken: radio gone, send refused, validation errors |
| `--drill` | `#4A2A78` on `#EFE8F8` | drill mode and nothing else |
| `--focus` | `#1E3A5F` | 2 px outline, 2 px offset, everywhere |

Rules: a **colour pair is a status, not a decoration** — the tinted background is used only
on chips, badges and inline messages, never on whole bands or whole cards. Grey is the
default state of everything; colour is the exception. Red and green are never the only
difference between two things (a word or glyph always accompanies them). High-contrast mode
(`[data-contrast="high"]`, kept from P1-09) collapses greys to black/white and keeps the five
status hues.

### Type

- **Inter** (variable), bundled at `app/src/assets/fonts/InterVariable.woff2` with its OFL
  licence beside it; `font-display: block`. No Google Fonts link — the app is offline-first.
  Fallback stack: `system-ui, "Segoe UI", Roboto, sans-serif`.
- `font-feature-settings: "tnum", "cv11"` on the root: tabular numbers so times line up,
  single-storey a for a plainer face.
- Base **16 px** (settings keep three sizes: normal 16, large 18, largest 21 — P1-09's 18 px
  default is revised; the setting is where readability lives). Line height 1.45.
- Scale, in rem: `0.8125` (13 — meta, table captions), `0.875` (14 — labels, chips, help),
  `1` (16 — body, rows), `1.125` (18 — row text in the journal), `1.25` (20 — section
  titles), `1.5` (24 — page titles). Weights: 400, 500 (labels, chips, names), 600 (page
  titles, primary buttons, the wordmark). Never 700+. Never all-caps except the on-air word
  `ØVELSE`.

### Space, shape, depth

- 4 px grid: `--s-1: 4px`, `--s-2: 8`, `--s-3: 12`, `--s-4: 16`, `--s-5: 24`, `--s-6: 32`,
  `--s-7: 48`.
- Radius `--r-1: 4px` (controls, chips), `--r-2: 8px` (cards, popovers). Nothing rounder.
- Depth: cards are `1px solid var(--rule)` on `--surface`, no shadow. Only popovers and the
  toast float: `0 4px 16px rgba(22,25,29,.12)`.
- Page: `max-width: 1440px`, gutter `--s-5`, two-column layouts `minmax(0,1fr) 320px`,
  collapsing under 60 rem. No layout wider than the content needs — the empty centre of the
  current home page is the thing to avoid.

## Components

One stylesheet, `app/src/styles/components.css`, with class names used by every screen. No
component defines its own colours or sizes; a component `<style>` block may only lay out.

- **Button** `.btn` 36 px, radius `--r-1`, 500 weight, padding 0 `--s-4`. Variants
  `.btn-primary` (accent fill, white text), `.btn` default (surface, `--rule-2` border),
  `.btn-quiet` (no border, accent text — row actions), `.btn-danger` (danger text + border).
  Icon-only buttons are 36×36 with `aria-label`. Disabled: 50 % opacity, no colour change.
- **Input / select / textarea** `.field` 36 px (textarea auto), `--rule-2` border, radius
  `--r-1`, label above in 14 px 500 `--ink-2`, help below in 14 px `--ink-2`, error below in
  14 px danger with a glyph. Focus: the global ring.
- **Chip** `.chip` 24 px, 14 px text, radius `--r-1`, a 6 px dot or a 14 px glyph on the
  left; variants per status pair; `.chip-neutral` is grey. Chips are for status and
  counters, never for navigation.
- **Status strip** (journal rows): inline run of chips separated by `·`, 14 px, dot per
  state — `sent` neutral, `delivered` ok, `roger` ok filled, `waiting` warn, `given up`
  danger.
- **Card** `.card`: surface, rule border, radius `--r-2`, padding `--s-5`; `.card-title`
  20 px 600 with `--s-4` below. A card has one purpose; two purposes are two cards or tabs.
- **Tabs** `.tabs` for switching between forms of the same kind in one card (New message /
  Add by hand): text tabs, 2 px accent underline on the active one, no pills.
- **Table** `.table`: header row `--surface-2`, 13 px 500 `--ink-2`; body rows separated by
  `--rule`; numbers right-aligned tabular; sticky header when the table scrolls; row hover
  `--surface-2`; selected `--accent-weak`. No zebra stripes.
- **Row list** `.rows` (journal, open items, handover lists): like a table without columns
  borders — a grid per row of `time | who | body | strip`, time 14 px `--ink-2` tabular,
  who 500, body 18 px, strip right; expanded row shows its history on `--surface-2`.
- **Popover** `.popover`: surface, `--r-2`, the floating shadow, max 360 px, a title line,
  a sentence, one action button. Opened from a status chip; `Esc` closes.
- **Toast** `.toast`: bottom-left, one at a time, 4 s, neutral surface with the floating
  shadow; for confirmations only (saved, printed, exported). Never for errors.
- **Inline message** `.msg` with status variants: a 14 px line with a glyph, placed next to
  the thing it is about (a field, a list, a card), never at the top of the page.
- **Empty state** `.empty`: one sentence in `--ink-2` and one button, centred in the space
  the content would fill.
- **Icons**: a bundled set of ≤ 16 inline stroke SVGs (`app/src/lib/icons.ts`, 20 px,
  1.75 px stroke, currentColor): radio, clock, storage, update, drill, reply, send, print,
  export, import, history, retry, close, check, warning, chevron. No icon fonts, no emoji.

## The shell

One **56 px top bar**, `--surface` with a `--rule` bottom line. Nothing below it except
the page. Left to right:

1. Wordmark **BCentral** (600, accent), then the current incident as a chip-styled button
   (name, open duration; click = switcher) — the incident is what you are working on and
   belongs in the bar, not in a bar of its own.
2. **Status cluster**, four chips, each a button that opens a popover with the sentence and
   the action: radio (dot + state + "heard 3 min"), clock (✓ confirmed / warn "not
   confirmed" → confirm in the popover itself), storage (nothing when persistent and a
   folder is set; warn otherwise), update (hidden until one waits, then warn "Reload"). A
   chip that is fine is grey and short; a chip that needs a decision is tinted. **This
   replaces every band and banner.**
3. **Navigation**: Journal · Handover · Send to all · Register · Settings, as text links,
   2 px accent underline on the current one.
4. Operator chip (name; click = handover page) and the language select, compact.

**Drill mode**: the whole bar takes the drill tint (`--drill` background pair), a drill chip
with the on-air word sits next to the incident, and the document title is prefixed. No
second band. Unmistakable, because the entire frame changes colour; quiet, because nothing
else does.

**No home page.** `/#/` is the journal. First run (no operator name) shows a setup card at
the top of the journal: name, clock confirm, radio connect — three fields, one button.

## Screens

- **Journal**: the main column starts with one card with two tabs (New message / Add by
  hand) — compose lives above the newest-first list, where new rows appear. Below it the
  row list. Side column: open items, last heard from, each a card with a count in its title.
  The incident bar is gone (it is in the shell).
- **Handover**: four cards in a 2×2 grid at ≥ 60 rem, each a row list with its count in the
  title, the operator change and clock confirm in a slim card above them.
- **Send to all**: compose card on top, the queue as a table below with a progress line
  (counts + time to drain) in the card title.
- **Register**: a table with a toolbar (search box, Import, Export, Print, Add); add/edit in a
  popover-sized card to the right or inline, not a separate page.
- **Radio**: state card (transport buttons, self info, drift), contacts table, log as a
  monospaced 13 px row list newest first.
- **Settings**: single column of cards, one per topic (Operator, Clock, Journal folder,
  Radio, Text & contrast, Language, About). The clock confirm checkbox stays here *and* in
  the chip popover.
- **Print** pages: unchanged structure, the tokens applied, 12 pt body, black on white.

## Forbidden

Gradients; shadows on static surfaces; full-width coloured bands; cards with a coloured
left border; pills containing a whole sentence; emoji; icon fonts; Google Fonts links; more
than one accent; all-caps labels; centred page layouts with empty flanks; any colour literal
outside `tokens.css`.
