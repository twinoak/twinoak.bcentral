# P3-09 — Close an unconfirmed radio message with one click

**Depends on:** P3-08.

## Goal

The staff can stop waiting for a confirmation that is not coming: "Close" on an unconfirmed
radio message is one click with an optional note, and the message leaves "Unconfirmed
messages". It is recorded honestly as *closed by the staff*, not as confirmed.

## Why

Found in use (2026-11-16): people in the field forget to send `R`, and the staff then had
no way to get the message out of the list short of a manual "confirmed" with a reason —
which claims something the staff do not know.

## Contract

Done 2026-11-16: `closed` is a terminal status for a mesh `message_out` (the enum already
had it; `contract/text-protocol.md` now lists it in the status table and says a later `R`
is an ordinary incoming message).

## Scope

In:
- **Close action.** On every mesh `message_out` whose derived status is `sent`, `delivered`
  or `given_up` (and not transmitting — P3-08's rule): a **Close** button in the row's open
  area and directly on each row of the "Unconfirmed messages" card and the handover list.
  Click → one small inline field "Note (optional)" with Close and Cancel; Close appends
  `status_change` `closed` with the note as `text` (empty allowed) and the operator. One
  click when the note is left empty: pressing Close without typing closes immediately.
  Keyboard: `L` on a focused unconfirmed row opens it.
- **Mark** (P1-03/P3-08) keeps `given_up` and `roger` with a required reason for the cases
  where the staff *do* know (a phone call said received); the Close action is the routine
  one and sits first.
- **Derivations:** `statusOf` returns `closed`; `closed` is terminal (no Retry, no Mark, no
  Close); unconfirmed lists and the handover's lists exclude it; the status column (P3-03)
  shows the third slot as a short dash in `--ink-2` with tooltip "Closed by the staff
  14.40" (and the note); batch counters count closed under a fourth "— n" element next to
  "✕ n", only when non-zero.
- **A late `R`** for a closed message: stored as an ordinary `message_in` per the protocol
  (no status change); the row's open area shows the incoming message as an answer
  (`refersTo` is not set by the rule — show it by the `Rn` match in the history line "R12
  received 15.02, after close"). Tested.
- **Print / export / journalText**: the strip sentence includes "closed 14.40".
- i18n for every new string, `da.json` complete (*Luk*, *Bemærkning (valgfri)*, *Lukket
  af staben*).

Out: closing non-mesh records (they have no status); reopening a closed message (a new
message is a new message).

## Read first

`contract/text-protocol.md` (status table), `store/outgoing.ts`, `store/status.ts`,
`store/journalView.ts`, `store/handoverView.ts`, `store/incoming.ts` (the roger rules),
`lib/rowActions.ts`, `components/StatusSlots.svelte`, `OpenItemsPanel.svelte`,
`tasks/phase-3/reports/P3-03.md`, `P3-04.md`, `P3-08.md`.

## Acceptance

- A delivered message with no `R`: Close on the card row → gone from the list, third slot
  shows the dash with the tooltip, history shows "closed by Thomas 14.40".
- Close with a note stores the note; Close without one stores an empty text.
- A later `R1` for it is stored as a plain incoming message and shown in the history as
  received after close; the status stays `closed`.
- A `closed` message offers no Retry/Mark/Close.
- `npm run check`, `lint`, `test`, `build` green; journal screenshot refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
