# P3-07 — `#n` and the status chain are MeshCore-only

**Depends on:** P3-06.

## Goal

An outgoing message by phone, courier or in person is a plain record: no number, no
sent/delivered/confirmed, no manual marking. The radio's receipt chain stays exactly as it
is, on radio messages only. Follow-up on a non-radio message is a point.

## Why

Found in use (2026-11-16): marking a phone message "sent", then "delivered", then
"confirmed" by hand is busywork that describes nothing — the call *was* the delivery. The
chain is the radio's, and the New record tab (P3-01) already made the split visible.

## Contract

Done 2026-11-16 in `contract/journal.schema.json` and `contract/text-protocol.md`:
`message_out` requires `seqNo` only on transport `mesh`, and forbids `seqNo` and `batchId`
on every other transport; `status_change` refers to mesh messages only (store-enforced —
the schema cannot see the referenced entry's transport). `contract/examples/walkthrough.json`
updated: the courier message is a plain record with a point opened and closed on it.

## Scope

In:
- **Store** (`store/outgoing.ts`, `manual.ts`, `journalStore.ts`): composing a non-mesh
  `message_out` reserves no `seqNo` and adds no prefix; `appendStatusChange` refuses a
  `refersTo` that is a non-mesh `message_out` (throws; tested); `statusOf` returns `null`
  for non-mesh messages (type change — callers handle it); `MANUAL_STATUSES` and the manual
  path apply to mesh messages only (a manual `given_up` / `roger` with a reason on a mesh
  message stays, from P1-03).
- **New record tab** (P3-01): an outgoing record shows no `#n` preview; its save button
  says "Add to journal" like the others.
- **Rows** (P3-03/P3-04): a non-mesh outgoing row has an empty status column (like
  incoming rows) and its open area offers Reply/Correct/point actions only — no Mark, no
  Retry, no history (there is none).
- **Open items** and the handover's "open orders" and "given up" lists: mesh messages only
  (they already are in substance; make the derivation explicit and tested).
- **Handover "send by courier"** on a given-up mesh message (P1-08): creates the courier
  record *and* opens a point on it titled from the message text, so the follow-up is not
  lost; the given-up mesh message is closed by the operator as before.
- **Reply** to a non-mesh incoming (P3-01 routing): unchanged — lands on New record as an
  outgoing record, now without a number.
- **Print / export / journalText**: the strip sentence is produced for mesh messages only.
- Remove now-dead code and i18n: `send.record`, the manual-status strings for non-mesh, the
  "by hand" tooltip variants from P3-03, anything referencing a non-mesh `seqNo`.
- Tests for every bullet above; the walkthrough fixture (updated) round-trips.

Out: anything on the radio path; the queue.

## Read first

`contract/text-protocol.md` (the changed "Non-mesh transports" paragraph),
`contract/journal.schema.json` (`message_out`), `store/outgoing.ts`, `store/status.ts`,
`store/journalView.ts`, `store/handoverView.ts`, `store/handover.ts`, `lib/journalText.ts`,
`tasks/phase-3/reports/P3-01.md`, `P3-03.md`, `P3-04.md`, `P3-05.md`.

## Acceptance

- Recording an outgoing courier message stores a `message_out` with `transport: "courier"`,
  no `seqNo`, no prefix; the row shows an empty status column; its open area has no Mark.
- `appendStatusChange` on that entry throws; `statusOf` returns `null`.
- A mesh message is unchanged end to end (compose, `#n`, sent → delivered → roger, Mark,
  Retry).
- "Send by courier" on a given-up mesh message creates the record and a point.
- `npm run check`, `lint`, `test`, `build` green; journal screenshots refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
