# P2-04 — Handover, Send to all, Register, Radio, Settings

**Depends on:** P2-03.

## Goal

Every remaining screen on the same components and layouts as the journal, so the app reads
as one piece of software.

## Scope

In — each as "Screens" in `docs/design.md`:
- **Handover**: slim card (operator change, clock confirm, radio state) above a 2×2 grid of
  cards, each a `.rows` list with its count in the title; row actions as `.btn-quiet`.
- **Send to all**: compose card (recipient picker as a checklist table with street grouping,
  byte counter) above the queue `.table` (recipient, `#n`, state chip, attempt, countdown);
  the progress line (counts, time to drain, paused reason) in the card title; Retry buttons
  on rows and in the toolbar.
- **Register**: toolbar (search field, Import, Export, Print, Add) above a `.table` (label,
  person, street, role, origin chip, key prefix, last heard); add/edit as a card that slides
  in on the right at ≥ 60 rem (inline below the toolbar under it); pending rows (P1-06) as a
  second table with a title; import preview (P1-06) as a `.table` inside a card.
- **Radio**: state card (transport buttons, self info as a definition list, clock drift as a
  `.msg`), contacts `.table`, log as a monospaced 13 px `.rows` list newest first with a
  Clear button.
- **Settings**: one column of cards (Operator, Clock, Journal folder, Radio, Text & contrast,
  Language, About — About shows version, storage estimate, the style-guide link); the save
  pattern is one button per card or auto-save with a toast, decide and report; `.field` for
  everything.
- `ContactPicker`, `RegisterForm`, `AdhocBatchForm`, `RegisterImport`, `BatchComposeForm`,
  `ShortcutHelp` restyled on the components.
- Colour literal count after this task reported (should be 0 outside print pages).
- i18n for every changed string.

Out: print pages (P2-05).

## Read first

`docs/design.md`, `tasks/phase-2/reports/P2-01.md` … `P2-03.md`, every page and component
named above.

## Acceptance

- Every page renders on the components; no page defines colours or sizes of its own.
- At 1280×720: handover shows all four cards without scrolling the shell; the queue table
  shows ≥ 12 rows; register shows ≥ 15 rows.
- Tables: sticky headers when they scroll; numbers tabular and right-aligned.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
