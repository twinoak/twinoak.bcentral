# P2-03 — The journal screen

**Depends on:** P2-02.

## Goal

The screen the staff live on, rebuilt on the components: compose above the newest-first
list, rows that read as message slips, two quiet side cards.

## Scope

In — as "Screens → Journal" in `docs/design.md`:
- Main column, top: **one card with two tabs** — New message (`ComposeForm`) and Add by hand
  (`ManualEntryForm`) — both forms restyled on `.field`/`.btn`; the byte counter as a 14 px
  meta line; "Replying to …" (P1-02) as an inline `.msg` inside the card. Send-to-all's
  compose stays on its own page.
- **Row list** `.rows` for the timeline: grid `time | who | body | strip`. Incoming and
  outgoing are told apart by a direction glyph before `who` and by the who-column itself;
  no row tints except the expanded row (`--surface-2`) and the selected row
  (`--accent-weak`). Batches as one row
  with counters (P1-01) using `.chip` counters. Expanded row: history as a 14 px list on
  `--surface-2`; row actions (Reply, Retry, Mark, Correct) as `.btn-quiet` revealed on
  hover/focus and always present on the expanded row.
- Corrections under their entry as a 14 px `.msg-neutral` line.
- The "N new" pill (P1-01) as a `.chip` button fixed at the top of the list.
- Side column: **Open items** and **Last heard from** as two `.card`s with the count in the
  title, each a `.rows` list in 14/16 px.
- First-run **setup card** at the top of the main column when the operator name is empty:
  name, clock confirm, radio connect, one button; disappears when done.
- Colour literal count after this task reported.
- i18n for every changed string.

Out: the data model; the queue page; print.

## Read first

`docs/design.md` §Components and §Screens, `tasks/phase-2/reports/P2-01.md`, `P2-02.md`,
`JournalPage.svelte`, `Timeline.svelte`, `ComposeForm.svelte`, `ManualEntryForm.svelte`,
`OpenItemsPanel.svelte`, `LastHeardPanel.svelte`.

## Acceptance

- The walkthrough fixture renders in the new layout with no component-local colour; a row
  expands/collapses; the strip states show their chip variants; the batch row shows counters.
- At 1280×720 with the normal font size at least 10 rows are visible below the compose card
  (P1-09's rule holds); at 60 rem the side column stacks under.
- Setup card appears with an empty operator name and vanishes after save.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
