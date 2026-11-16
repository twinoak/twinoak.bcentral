# P3-05 — Points: open a follow-up from any line

**Depends on:** P3-04.

## Goal

Any journal line can become something to follow up on: "Open point" on the line creates a
*point* (da: *punkt*) with a title; it stays open until someone closes it with a reason, and
can be reopened. Open points are the staff's to-do list, visible in the journal's side column
and on the handover page.

## Why

Found in use (2026-11-16): an incoming phone call often means something has to be done; the
operator logs the call and then needs a place to say "this is now open until handled". There
was none.

## Contract

Done 2026-11-16: `contract/journal.schema.json` has entry type `point` (`refersTo` = the
origin entry, `text` = the title; no counterparty, transport, seqNo), and `status_change`
with `closed` / `reopened` may refer to a point. One point per origin entry.

## Scope

In:
- **Open a point.** In the open area of every row (P3-04) — notes, incoming and outgoing
  messages, corrections' originals, batch rows (on the batch's first message) — a button:
  - "Open point" when no point refers to this entry: opens a one-field form prefilled with
    the entry's text (shortened to the first 80 characters at a word boundary), Save appends
    the `point`.
  - "Reopen point" when a point exists and is closed: appends `status_change` `reopened`
    on the point, no form.
  - "Close point" when a point exists and is open: a required reason, appends
    `status_change` `closed` with the reason in `text`.
  A line that has a point shows a small point glyph after the time (`--accent` when open,
  `--ink-2` when closed), with the title as tooltip. `P` on a focused row = the first of
  these that applies.
- **Points card** in the journal's side column, above "Open items": title "Points (n open)",
  a row per open point — title, age, origin line (who/time) — oldest first; clicking a point
  scrolls to and opens its origin row; "Close" on the row with the reason field inline;
  a "Show closed" toggle lists closed points with their reason and time, newest first.
- **Handover page:** a fifth list, "Open points", first of the five (it is the to-do list),
  with title, age, origin and Close; printed with the others.
- **Derivations** in `store/journalView.ts`: `pointsFor(entries)` → each point with its
  origin, its state (latest `closed`/`reopened` referring to it, open when none), opened
  at, closed at, reason; `pointOf(entryId)`. Tested.
- **Print:** points appear as a block at the end of the journal print ("Points: open /
  closed with reasons").
- i18n for every new string, `da.json` complete (*punkt*, *Åbn punkt*, *Genåbn punkt*,
  *Luk punkt*, *Punkter (n åbne)*).

Out: assigning points to people; due times; points across incidents; the hub.

## Read first

`contract/journal.schema.json` (`point`, `status_change`), `tasks/phase-3/reports/P3-04.md`
(the open area and action row), `store/journalView.ts`, `store/handoverView.ts`,
`HandoverPage.svelte`, `OpenItemsPanel.svelte`, `PrintPage.svelte`,
`docs/open-questions.md` §1 (points are the light answer to "one journal, several things
going on" — note it there as built, the question itself stays open for the users).

## Acceptance

- From a note: Open point → point stored with `refersTo` = the note, title prefilled and
  editable; the button becomes Close point; Close with reason → `status_change closed` with
  the reason; the button becomes Reopen point; Reopen → `reopened`; the card and the
  handover list follow each change live.
- A second "Open point" on the same entry is impossible (the button is never shown while a
  point exists).
- The walkthrough fixture plus two points (one open, one closed) renders the card, the
  handover list and the print block as specified.
- Export validates; `npm run check`, `lint`, `test`, `build` green; journal and handover
  screenshots refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```

## Left open (decide and report)

- English word: "point" is the literal choice (da *punkt*); "follow-up" is the alternative.
  Use "point" unless the report argues otherwise.
