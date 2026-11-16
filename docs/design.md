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
- **Status column** (journal rows, P3-03; replaces the status strip): a fixed-width column
  at the right of every row — three slots, `sent · delivered · confirmed`, one 20 px symbol
  each, always in the same place, no times in the list (they are the slots' tooltips and
  the row's history). Five shapes: hollow circle `--rule-2` (not yet), filled circle `--ok`
  (done; confirmed with a check), hollow circle with a clock `--warn` (sent, the receipt
  still out), `✕` `--danger` (given up, in the first slot not reached; the slots before it
  stay filled). A batch row shows a count per slot (`23/25`, `--ok` once all are there)
  and `✕ n` under them when n > 0. The header is three 13 px labels over the slots, stuck
  to the top of the list. Incoming rows, notes, corrections and outgoing messages by phone,
  courier or verbal (P3-07: `#n` and the chain are the radio's; a message by hand is a
  plain record) leave the column empty. High contrast keeps the shapes and drops the tints.
- **Card** `.card`: surface, rule border, radius `--r-2`, padding `--s-5`; `.card-title`
  20 px 600 with `--s-4` below. A card has one purpose; two purposes are two cards or tabs.
- **Tabs** `.tabs` for switching between forms of the same kind in one card (New record /
  MeshCore): text tabs, 2 px accent underline on the active one, no pills.
- **Table** `.table`: header row `--surface-2`, 13 px 500 `--ink-2`; body rows separated by
  `--rule`; numbers right-aligned tabular; sticky header when the table scrolls; row hover
  `--surface-2`; selected `--accent-weak`. No zebra stripes.
- **Row list** `.rows` (journal, open items, handover lists): like a table without columns
  borders — a grid per row of `time | who | body | status`, time 14 px `--ink-2` tabular,
  who 500, body 18 px, the status column right. A row at rest is that one line and nothing
  else, of a fixed height that hover never changes (hover tints the background `--surface-2`,
  no button or glyph appears); the line is one button (`aria-expanded`). A click, Enter or
  Space opens the row in place (P3-04): under the line, on `--surface-2`, its history with
  times and operators, its reply links, and the action row — `.btn-quiet` buttons for exactly
  the actions that apply, with the Mark and Correct forms taking the action row's place while
  open. One row is open at a time; the open row's own line, another row or `Esc` closes it.
  No history toggle anywhere. A line that has a point (P3-05) shows a small glyph after the
  time — `◆` in `--accent` while the point is open, `◇` in `--ink-2` once closed, the title
  as its tooltip — at the time's size, so the line's height is what it was; the open row's
  area adds the point line (title, when, by whom, the reason once closed) over the action
  row, whose first button is the row's one point action: Open point, Close point or Reopen
  point.
- **Points card** (the journal's side column above Open items, P3-05): "Points (n open)",
  a `.rows-2` list with a jump button per open point — the title, its age, the line it was
  opened from — oldest first, Close with the reason field in place under the row, and a
  "Show closed" toggle for the closed ones with their reason and time. The handover page
  carries the same open points as its first list, across the grid's width, each row opening
  on Close.
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

- **Journal**: the main column starts with one card with two tabs, one job each (New record,
  shown on load: what is written by hand; MeshCore: a message over the radio, P3-01) —
  compose lives above the newest-first list, where new rows appear. Below it the
  row list. Side column: open items, last heard from, each a card with a count in its title.
  The incident bar is gone (it is in the shell).
- **Handover**: four cards in a 2×2 grid at ≥ 60 rem, each a row list with its count in the
  title, the operator change and clock confirm in a slim card above them.
- **Send to all**: compose card on top, the queue as a table below with a progress line
  (counts + time to drain) in the card title.
- **Register**: a contact list (P3-06: a radio is optional) — a table with a toolbar (search
  box, the radio filter All / Has radio / No radio, Import, Export, Print, Add contact); the
  radio column is the glyph and the key's prefix, or a dash; add/edit in a popover-sized card
  to the right or inline, not a separate page, with the radio's key and origin as one section
  at the end of the form.
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

## As built

Written 2026-10-31 at the end of the sprint (P2-05). What the five tasks built differently
from the text above, and why; the reports under `tasks/phase-2/reports/` have the detail, and
`tasks/phase-2/reports/screens/` the screenshots of every screen.

- `--rule-2` is `#7f8791`, not `#bac1ca`: the document's grey is 1.8:1 on white and an input
  border is chrome at 3:1 on every grey surface. `--rule` stays as written and is not checked
  (a separator is decoration). Four tokens the text implies but does not name exist:
  `--on-accent`, `--shadow`, `--scrim` (the shortcut overlay's backdrop), `--font-mono`.
- Every size is `rem` with the document's px at the 16 px root, so the text-size setting
  scales the whole screen; the side column alone is the written 320 px.
- The status strip of P2-01 (chips without a background, the dot and the word carrying the
  state) was replaced in P3-03 by the status column, see below; a chip outside a row list
  keeps its tint.
- The bar: Radio is not in the navigation (five screens as listed; the radio chip and
  Settings reach it). The chip details ("· heard 3 min", "· open for 2 h") show from 1440 px
  up; below, the popover carries them. When three chips are tinted at 1280 px the navigation
  half drops to a second right-aligned line; the calm bar is one 56 px row. The incident
  switcher is a popover-sized card with the pick, create, close/reopen, export and print
  controls, not a one-sentence popover.
- The journal: the row list is a subgrid with the status column on a fixed width, so the
  columns line up and the body keeps the rest; the row actions were a line under the row on
  hover, focus or expansion until P3-04 made the row open on click, see below; a corrected
  entry reads its latest correction's text with a neutral "corrected" chip (the pencil icon)
  after the time, the original and every correction in its history, and Correct is one
  prefilled box in the open row's area while the row's text is hidden (P3-02) — a correction
  is never a row or a line of its own; the compose card is padded `--s-4` vertically so ten
  one-line rows fit under it at 720 px; `pending` is a warn state on a chip (the queue),
  three hollow slots in the column.
- The status column (P3-03): a slot is 4 rem wide, the column 12 rem, not the 7.5 rem the
  task named — the header's 13 px labels ("Delivered", "Bekræftet", "Confirmed") need about
  60 px each, and a label that does not fit over its slot is no header. The symbols are
  drawn in `components/SlotSymbol.svelte` on the icon grid, outside `lib/icons.ts` (an
  icon is an action or a state the bar names; these are the one set the column draws), the
  check cut out of the filled disc in `--surface`. In the open-items card (320 px) the
  slots pack to 1.5 rem each and there is no header: the tooltips say what the journal's
  labels say. The handover's age moved from the end of the strip to after the time. The
  queue's table keeps its state chip with the column's symbol in place of the dot.
- Click to open (P3-04): a row's cells sit on a `.row-line` inside the row (a subgrid of the
  row's subgrid, `components/Row.svelte`), which is the one button-like, focusable thing in
  the row — `role="button"`, `aria-expanded`, `aria-controls` to the `.row-area` it opens —
  so the row's padding stays on the row and the ring sits in it; the row itself cannot carry
  `aria-expanded` (a list item's role does not support it) and cannot be a `<button>` (it
  would hold the buttons of its area). The hover reveal of P2-03 is gone with its rules: no
  `:hover` rule in the sheet changes a box property, and the screenshot script measures
  every journal row at rest, hovered and focused. The reply links ("↳ answers 19:03",
  "answered 19:03") moved from the body into the open row's area, so the line at rest holds
  no control at all. Enter and Space are the line's own keys, as on a button, so the handover
  page gets them without registering a shortcut; the overlay lists them under the row. The
  handover's three entry lists are on the same `Row` with the same history list
  (`RowHistory.svelte`), one row open at a time across the page, the actions in the open row
  rather than always shown; its quiet-radios list is a register list, not journal rows, and
  keeps its one button on a line under the row. An open item in the side card opens the row
  it jumps to. A send-to-all row opens into its recipient rows, which open inside it without
  closing it (the one exception to "one row open"), with "Retry all given up" as its own
  action row when any recipient can be retried.
- Points (P3-05): a point is never a row of the journal or of the print — a correction is
  not one either — so the list stays one line per slip; the origin line carries the glyph
  and the open row the point line and the action. The glyph is a plain character in the
  time cell, like the direction arrows (an icon is an action or a state the bar names), with
  two shapes so the state survives black and white. The Points card sits above Open items
  because it is the staff's to-do list, and its rows are jump buttons like the open items'
  with Close on a line under the row (a button cannot sit inside a button); the handover's
  points list is on the journal's `Row` and opens on its Close, spanning the width above the
  2 × 2 grid with its height capped, so the four cards keep their room. `P` on a focused row
  runs the row's one point action and opens the row first when a form is needed. The print
  block is a three-column table at the end of the document (title, state with the time and
  reason, the origin line), left out of a "since last print" that has no changed point.
- `#n` and the status chain are the radio's (P3-07): an outgoing message by phone, courier
  or verbal is a plain record — the text as typed, no number, no prefix, no status, nothing
  to mark — so its row has an empty status column like an incoming row's, and its open area
  offers the point action and Correct and nothing else (no history: there is none). The
  Mark form offers the radio's two manual statuses, roger and given up. "Send by courier" on
  a given-up radio message adds the courier record with a point on it, so the follow-up the
  chain used to carry is on the to-do list; the New record tab's one button says "Add to
  journal" for all three kinds. The print page writes the strip sentence and the status word
  for radio messages only.
- A queued message can still be marked (P3-08): the open row hides Mark and Retry only while
  the radio is in the middle of transmitting the message (the payload handed over, the ack
  awaited); a message waiting in the send queue — also while the queue is paused because no
  radio is connected — offers Mark and Correct, and marking it confirmed or given up takes it
  out of the queue first, so a reconnect never sends it. The status column keeps its waiting
  words meanwhile. The "Unconfirmed messages" card carries one warn-tinted help line under
  its title while the queue is paused ("n waiting — no radio connected. Open a message to
  confirm or give it up by hand."); the MeshCore tab sends without a radio — the message
  waits in the paused queue, and the form's "no radio" line is a warning saying so, not an
  error — because the operator is never to be left with a radio message they can neither
  send, confirm nor give up.
- The other screens: table rows are `--s-1` tall in padding (32 px) so fifteen register and
  twelve queue rows fit a 720 px screen; the send-to-all compose card folds once a batch is
  queued and reopens from the queue's title; the handover's row actions were always shown
  until P3-04 put them in the open row; the register's Print is icon-only and its Notes and
  Origin columns are in the form, not the table (P3-06: the table shows phone and the radio
  instead, the origin in the radio cell's tooltip); Settings has eight cards (Hub, for the
  phase-3 URL) with a Save per card of typed values.
- Print: the document is a `.doc` block in `components.css` (a sheet on screen under a
  toolbar, 12 pt black on white on paper), and the paper rules at the end of the same file
  turn every chip into its word and drop every edge and tint; the drill line keeps a black
  border. No separate print stylesheet.
- The colour-literal test is on at zero; the transition stylesheet and the alias block are
  gone.
