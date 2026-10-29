# P1-09 — Operator ergonomics

**Depends on:** P1-03.

## Goal

The app is usable by a tired person in a cold room on a borrowed laptop: readable from a
metre away, operable from the keyboard, and in Danish that a Danish staff member would write.

## Scope

In:
- **Type and contrast.** Base font size 18 px (settings: normal / large / largest, persisted),
  line height ≥ 1.4, body text contrast ≥ 7:1 and all status colours distinguishable without
  colour (shape or text on every status chip), focus rings visible on everything focusable,
  hit targets ≥ 40 px. A high-contrast toggle in settings that drops all greys to black/white.
- **Keyboard.** A single, documented set (shown on a `?` overlay): `N` new message, `R` reply
  (P1-02), `A` add note, `J`/`K` move between journal rows, `Enter` expand row, `Ctrl+Enter`
  send, `Esc` cancel, `G J`/`G R`/`G H`/`G S` go to Journal/Register/Handover/Settings.
  Nothing fires while a text field has focus except `Ctrl+Enter` and `Esc`.
- **Danish review.** Every string in `da.json` read by a human for tone and terminology:
  consistent words for staff/field/journal/incident (*stab*, *felt*, *journal*, *hændelse*),
  imperative button labels, no anglicisms where a Danish word is in use in beredskab. The
  reviewer is Thomas unless he names someone else; the session prepares a two-column table
  (`key`, `current`, `proposed`, `reason`) in the report for every string it proposes to
  change and changes **nothing** in `da.json` itself without that review — this is the one
  task where the session stops and waits: it writes the table, applies only changes marked
  obvious typo/consistency, and lists the rest as *Open questions*.
- **Empty states and errors.** Every list has an empty state that says what to do next; every
  error names the thing and the next step (no bare "Error").
- **Window sizes.** Works at 1280×720 (the common cheap laptop) without horizontal scroll;
  the journal keeps at least 10 rows visible at the normal font size.
- i18n for every new string, `da.json` complete.

Out: themes; colours as brand; mobile layout (the staff screen is a laptop).

## Read first

Every `.svelte` under `app/src`, `app/src/i18n/da.json`, `tasks/phase-1/reports/P1-01.md`
through `P1-08.md` (whichever exist).

## Acceptance

- An automated contrast check (a small script in `app/scripts/` over the CSS custom
  properties, run in `npm run test`) passes at 7:1 for text and 3:1 for UI chrome in both
  normal and high-contrast mode.
- Keyboard: a test per shortcut that it fires outside a text field and not inside one.
- Font-size setting persists and applies on reload.
- Manual: the phase-0 walkthrough done entirely by keyboard, at 1280×720, at the largest font.
- The Danish review table is in the report.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
