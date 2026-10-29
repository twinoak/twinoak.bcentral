# P1-08 — Shift handover view

**Depends on:** P1-03.

## Goal

A new operator sits down, opens one screen, and knows everything that is open — without
reading the journal and without asking the person who is leaving.

## Scope

In:
- A **Handover** page (nav entry next to Journal): the current incident's name and how long it
  has been open; the operator name field (changing it here is the handover: the old name is
  logged out, the new one in, as one `note` "handover: ‹old› → ‹new›"); the clock-confirm
  checkbox from settings repeated here (an unconfirmed clock is the first thing the new
  operator fixes); radio state and last heard; then four lists, each with counts:
  1. **Open orders** — `message_out` not yet `roger`, oldest first (the overdue one on top),
     with recipient, `#n`, status strip, age.
  2. **Given up** — messages that need a decision: retry, send by courier, or close with a
     reason (buttons on the row).
  3. **Unanswered incoming** — `message_in` with no outgoing `refersTo` pointing at it and no
     roger match, oldest first, with a Reply button (P1-02).
  4. **Quiet radios** — register entries not heard from in longer than the blind threshold,
     quietest first, with "Send status request" that composes `#n Meld status` to that one.
- A **Print handover** button producing the same four lists on paper (reuses P1-04's print
  styling), with the handover time and both operator names.
- The page updates live as entries arrive.
- i18n for every new string, `da.json` complete.

Out: shift schedules; multiple staff PCs; any change to the data model (everything here is
derived from entries that already exist).

## Read first

`tasks/phase-1/reports/P1-01.md`, `P1-02.md`, `P1-03.md`, `P1-04.md` (print), `store/status.ts`,
`store/journalView.ts`.

## Acceptance

- The walkthrough fixture plus a few extra entries renders the four lists with the expected
  members and order; a new roger removes the item live; a reply removes the incoming item.
- Changing the operator name on the page appends exactly one handover `note` and updates the
  top bar.
- "Send status request" composes the right text with the right next `seqNo` for that radio.
- Print view contains the four lists, both names and the time.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
