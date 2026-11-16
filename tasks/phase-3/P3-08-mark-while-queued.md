# P3-08 — A queued message can still be marked; only a live transmission blocks it

**Depends on:** P3-07.

## Goal

The operator is never stuck with a radio message they can neither confirm nor give up.
"Mark" (manual confirmed / given up, with a reason) is hidden only while the radio is in
the middle of a transmission for that message; a message waiting in the queue — including
a queue paused because no radio is connected — can be marked, and marking takes it out of
the queue.

## Why

Found in use (2026-11-16): messages sent with no radio connected sit in "Unconfirmed
messages" as "queued" and offer no action at all. `messageActions` hides Mark whenever
`inflight` is true, and `inflight` covers queued, waiting and paused — not just sending.

## Scope

In:
- **Rule.** `inflight` is split into two facts: `transmitting` (the outbox's active send for
  this message is in a phase where the radio has been handed the payload and an ack is
  awaited — the attempt cannot be cancelled mid-air) and `waiting` (queued, waiting in the
  send queue, handed to the outbox but not yet transmitting, or paused for lack of a
  radio). `messageActions` hides Mark and Retry only for `transmitting`. The status column
  (P3-03) keeps showing the waiting text.
- **Marking a waiting message** (`roger` or `given_up`, both with a reason, as
  `manualStatusesFor("mesh")` allows): removes it from the send queue / outbox queue first
  (`sendQueue.cancel(messageId)` and `outbox.cancel(messageId)` — add them; cancelling a
  message that is `transmitting` is refused), then appends the status change. A batch whose
  recipient is marked by hand shows the recipient as marked and keeps draining the others.
- **Give up all waiting** on the queue page and the handover's given-up list: unchanged,
  but it must use the same cancel path.
- **Help text** on the "Unconfirmed messages" card: one line under the title when the queue
  is paused: "n waiting — no radio connected. Open a message to confirm or give it up by
  hand." (i18n, both languages).
- The row's open area for a waiting mesh message shows: Mark, Correct, point actions (and
  no Retry — there is nothing to retry yet).
- Tests: with a fake link and the radio disconnected, a sent message is `waiting`, Mark is
  offered, marking `given_up` removes it from the queue and stores the status; the same
  for `roger`; while a fake transmission is awaiting its ack, Mark is hidden and `cancel`
  is refused; after the ack, Mark (roger only) is offered again.

Out: changing what the field person's `R` does; the radio protocol.

## Read first

`lib/rowActions.ts` (`messageActions`), `pages/JournalPage.svelte` (`inflight`,
`canRetry`), `radio/outbox.svelte.ts` (`active()`, phases), `radio/sendQueue.svelte.ts`
(paused, waiting), `store/outgoing.ts` (`manualStatusesFor`, `recordManualStatus`),
`tasks/phase-3/reports/P3-04.md`, `P3-07.md`.

## Acceptance

- Radio disconnected, one message sent from the MeshCore tab: it appears under
  "Unconfirmed messages" with the paused help line; opening its row offers Mark; marking it
  given up with a reason removes the waiting text and the queue no longer holds it;
  reconnecting the radio does not send it.
- Same, marking confirmed with a reason.
- During a live transmission (fake link holding the ack): no Mark; after the ack: Mark
  offers confirmed only.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
