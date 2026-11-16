# P3-02 — Correct by editing the text, not by retyping it

**Depends on:** P3-01.

## Goal

Correcting an entry feels like editing it: one box, prefilled with the current text, that the
operator changes and saves. Underneath, nothing changes in the model — the original entry is
untouched and a `correction` entry is appended — but the row then shows the corrected text,
marked as corrected, with the original one click away.

## Why

Found in use (2026-11-16): the correction form shows the old text above an empty box, so the
operator retypes a whole note to fix one word.

## Scope

In:
- **The form.** "Correct" on a row opens one textarea prefilled with the entry's *current*
  text (the latest correction's text if one exists, else the original), cursor at the end,
  the row's own text hidden while the form is open so there is one copy on screen. Save is
  disabled while the text is unchanged or empty. `Esc` cancels. The label becomes "Corrected
  text" / "Rettet tekst"; the key `journal.correction.text` is reworded.
- **What is stored.** Unchanged: `addCorrection(target, text)` appends a `correction` with
  `refersTo` = the entry being corrected (always the *original* entry, also when correcting
  a second time — a chain is one original with N corrections, never a correction of a
  correction) and `text` = the full corrected text. No schema change.
- **What is shown.** A row whose entry has corrections shows the latest correction's text as
  its text (latest = highest ULID among corrections referring to it), with a small
  "corrected" chip (`.chip-neutral`, glyph + "corrected" / "rettet") after the time; the
  expanded row's history lists the original and every correction with time and operator.
  The 14 px correction line under the row (P1-01) goes away — it duplicated the text.
- **Which entries can be corrected.** `note`, `message_in`, and `message_out` text — as today.
  For a `message_out` the `#n ` prefix is not editable: the form shows it as a fixed prefix
  before the box and the stored correction text keeps it. (What went on the air is not
  changed by a correction; the journal records that the *record* was corrected, and the
  history shows both.)
- Print and export: the print view shows the corrected text with "(corrected)" and the
  original in a footnote-style line beneath; the JSON export is unchanged (every entry is
  there).
- Handover lists and open items use the corrected text too (one helper, `currentText(entry,
  corrections)`, in `store/journalView.ts`, used everywhere a text is shown).
- Tests: prefill; unchanged text cannot save; the stored correction refers to the original on
  a second correction; `currentText` picks the latest; the `#n` prefix survives; print shows
  both.
- `da.json` and `en.json` complete.

Out: editing anything but the text (counterparty, transport, type — those are a new entry);
deleting entries.

## Read first

`Timeline.svelte` (`startCorrection`, `saveCorrection`), `store/index.ts` (`addCorrection`),
`store/manual.ts`, `store/journalView.ts`, `PrintPage.svelte`, `tasks/phase-1/reports/P1-01.md`
(how corrections render today), `contract/journal.schema.json` (`correction`).

## Acceptance

- Correcting a note: one box with the old text; change one word; save; the row shows the new
  text with the "corrected" chip; history shows both versions.
- Correcting it again: the box holds the corrected text; the new correction refers to the
  original entry.
- Correcting a `message_out`: `#12 ` is fixed in front of the box and present in the stored
  text.
- `npm run check`, `lint`, `test`, `build` green; journal screenshot refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
