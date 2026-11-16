# P3-03 — Status as a fixed column of symbols

**Depends on:** P3-02.

## Goal

The status of an outgoing message is read at a glance from a fixed-width column at the right
of every row — three slots, one symbol each, always in the same place — with no times in the
list. Times live in the expanded row's history and in a tooltip.

## Why

Found in use (2026-11-16): the strip `sendt 12.20 · leveret 12.21 · bekræftet 13.13` wraps
to two lines, varies in width per row, and the times are noise in the list. Rows do not line
up, so the eye cannot scan the column.

## Scope

In:
- **The column.** The row grid gets a last column of fixed width (`--s-7` × 3 ≈ 7.5 rem at
  the normal font size, scaling with the font) holding three slots in order:
  **sent · delivered · confirmed** (`sent`, `delivered`, `roger`). Every outgoing row shows
  all three slots; a slot is one of:
  - not yet: hollow circle, `--rule-2`
  - done: filled circle, `--ok` (confirmed: filled circle with a check glyph)
  - waiting for the next attempt (`sent` without ack, resend pending): hollow circle with a
    small clock glyph, `--warn`, in the *delivered* slot
  - given up: `✕` glyph, `--danger`, in the slot that was not reached (delivered or
    confirmed); the slots before it stay filled
  - manual (non-mesh transport, set by the operator): the same symbols; the tooltip says
    "by hand (reason)".
  Pending (no `sent` yet): three hollow circles. The column header (sticky with the list) is
  three 13 px labels over the slots, so no legend is needed.
- **Incoming rows, notes, corrections:** the column is empty. (An incoming message has no
  status; "answered" from P1-02 stays where it is in the who/body area.)
- **Batch rows (send-to-all):** the same three slots, each showing a count `23/25` instead of
  a symbol, coloured like the symbol would be when all are done; given-up count as a fourth
  element `✕ 1` only when non-zero.
- **Times:** gone from the list. Each slot's `title`/`aria-label` is "Delivered 12.21"
  (localised time) or "Not yet delivered"; the expanded row's history (P1-01) is unchanged
  and is where the full sequence with times is read. The strip text helper (`journalText`)
  keeps producing the sentence for print and export — print shows status words with times,
  as now.
- **Colour is never the only cue:** hollow / filled / check / clock / ✕ are five shapes.
  High-contrast mode keeps the shapes and drops the tints.
- Handover and open-items lists use the same column component (`StatusSlots.svelte`).
- Keyboard: the slots are not focusable; the row is, and `Enter` expands it as today.
- i18n for the three header labels and the tooltip sentences; the per-state strip strings
  stay for print.

Out: the data model; the history layout; the queue page's table (it has its own state
column with attempt and countdown — align its symbols to the same set, nothing more).

## Read first

`Timeline.svelte` (the strip and the row grid), `lib/journalText.ts`, `store/journalView.ts`
(strip derivation, batch counters), `HandoverPage.svelte`, `OpenItemsPanel.svelte`,
`docs/design.md` (§Components: status strip — this task replaces that definition; update the
document's "As built" section), `tasks/phase-1/reports/P1-01.md`.

## Acceptance

- The walkthrough fixture renders every outgoing row with three aligned slots in one line at
  1280×720, normal and largest font; no time appears in the list column.
- Fixtures for each slot state (pending, sent-waiting, delivered, confirmed, given up at
  delivered, given up at confirmed, manual delivered) render the specified shape and tint,
  with the specified tooltip text.
- A batch row shows counts in the slots and `✕ n` only when n > 0.
- Print still shows status words with times.
- `npm run check`, `lint`, `test`, `build` green; journal and handover screenshots refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```

## Left open (decide and report)

- Whether the three header labels should also appear on the handover lists or only on the
  journal (lean: everywhere the column is).
