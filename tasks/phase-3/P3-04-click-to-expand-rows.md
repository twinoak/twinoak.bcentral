# P3-04 — Click a row to open it: history and actions in one place, nothing on hover

**Depends on:** P3-03.

## Goal

A row at rest is one line of fixed height and stays that way under the pointer. Clicking it
opens it; the open row shows the history (with times) and every action that applies to the
entry. There are no "Show history" / "Hide history" buttons and no buttons that appear on
hover — the click is the whole interface.

## Why

Found in use (2026-11-16): actions revealed on hover change the row's height, so the list
jumps under the eye as the pointer moves. The separate history toggle is a second way to do
what opening the row already does.

## Scope

In:
- **At rest:** a row renders time · who · body · status column (P3-03) and nothing else;
  hover changes only the background (`--surface-2`), never the height or the content. No
  buttons, no glyphs that appear on hover.
- **Open:** clicking anywhere on the row (except on a link or on selected text — a click
  that ends a text selection does not toggle) opens it in place: the row keeps its line, and
  below it, on `--surface-2`, appear (1) the history list with times and operators, as in
  P1-01's history, (2) the "answered / replying to" links (P1-02) if any, (3) the action row
  — `.btn-quiet` buttons for exactly the actions that apply to this entry type and state:
  - `message_out` mesh: Retry (only when given up), Mark (manual status with reason), Correct
  - `message_out` non-mesh: Mark, Correct
  - `message_in`: Reply, Correct
  - `note`: Correct
  - batch row: Retry all given up (when any), and per-recipient rows inside with their own
    actions
  Clicking the open row's own line again closes it. Only one row is open at a time; opening
  another closes the first. `Esc` closes. Opening a row does not scroll the list except to
  keep the opened row's line in view.
- The Correct and Mark forms (P3-02) open *inside* the open row's area, replacing the action
  row while active; cancelling returns to the action row.
- **Keyboard:** `J`/`K` move the focused row, `Enter` or `Space` toggles it, `R` replies
  (incoming rows), `Esc` closes; the `?` overlay updated. The row is a `<button>`-like
  element with `aria-expanded`; the open area is `aria-controls`'d.
- The "N new" pill and the sticky column header stay above the list, unaffected.
- The same behaviour on the handover lists and the open-items panel (they share the row
  component); the queue page's table is out of scope.
- Remove the P2-03 hover-reveal CSS and the history toggle buttons and their i18n keys.

Out: the data model; multi-select; drag.

## Read first

`Timeline.svelte`, `tasks/phase-2/reports/P2-03.md` (how the hover reveal and history toggle
are built), `tasks/phase-3/reports/P3-02.md`, `P3-03.md`, `ShortcutHelp.svelte`,
`docs/design.md` (§Components: row list — update "As built").

## Acceptance

- A row's rendered height is identical at rest, hovered and focused (test: measure the row
  element in the three states with the walkthrough fixture; also no `:hover` rule in the row's
  CSS changes any box property).
- Click opens; a second click closes; opening row B closes row A; `Esc` closes; a click that
  ends a text selection does not toggle.
- The open area lists history with times and the right action set for each of the five entry
  kinds above (one test per kind).
- No "history" toggle exists anywhere; the shortcut overlay matches.
- `npm run check`, `lint`, `test`, `build` green; journal and handover screenshots refreshed,
  including one with a row open.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
