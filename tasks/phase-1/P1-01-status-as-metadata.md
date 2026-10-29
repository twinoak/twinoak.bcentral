# P1-01 — Status as metadata on the row, newest first

**Depends on:** P0-09.

## Goal

The journal reads like a stack of message slips, not a log of state transitions. A message
is one line that carries its own delivery times; a send-to-all is one line that opens up to
its recipients; the newest line is at the top. The data model does not change: status stays
in `status_change` entries, which are never shown as lines of their own.

## Why

Found in the first hardware walkthrough (2026-10-29): with four status lines per message and
25 messages per roll call, the journal was unreadable. The paper equivalent — a message form
with "sent at" and "acknowledged at" fields on the slip itself — says where the status
belongs on screen. See `docs/decisions.md` 2026-10-29.

## Scope

In:
- **Status strip on every `message_out` row**, derived from its `status_change` entries:
  `sent 14:31 · delivered 14:32 · roger 14:35`; `sent 14:31 · waiting (attempt 2/3)`;
  `given up 14:40`; or `pending` when no `sent` exists. Times in the UI language's short
  format. A manual status change (non-mesh transport, or a manual `given_up`/`roger` on mesh)
  shows the operator and the required reason when the row is expanded.
- **`status_change` and the resend `note` are never top-level rows.** They are reachable only
  by expanding the row they refer to (a "history" disclosure listing each transition with
  time, operator and reason). `correction` rows stay visible under the entry they correct —
  a correction is narrative, not telemetry.
- **Stop writing `pending`.** `composeMessage` no longer appends a `status_change` → `pending`;
  `statusOf` already returns `pending` when there is none. Existing `pending` entries in old
  journals still validate and are ignored by the strip.
- **Resend attempts** are no longer `note` entries. The outbox records them as a
  `status_change` → `sent` with `text` = `attempt 2/3` (the schema allows `text` on a
  status change). The strip shows the latest attempt; the history shows all.
- **Send-to-all is one row.** `batchId` (new optional field on `message_out` in
  `contract/journal.schema.json`, added 2026-10-29; a ULID minted per batch) is set on every
  message the batch creates. The journal groups rows by `batchId` into one line:
  `To all (25): #n Meld status` with counters `25 sent · 23 delivered · 18 roger · 1 given up`
  and the slowest recipient's state; expanding lists each recipient's own row with its own
  strip. Messages without `batchId` are single rows as before. The queue screen's in-memory
  batch id is replaced by this field, so the grouping survives a reload.
- **Newest first, everywhere.** The journal timeline, the open-items panel, the register
  side panel ("last heard from" stays sorted quietest first — that one is deliberate), the
  send-to-all queue and the radio log. New rows appear at the top; the view stays at the top
  unless the operator scrolled down, and then shows a "N new" pill that jumps back.
- **Human-readable export** (`print`/markdown, when it exists — today only JSON) follows the
  same folding: one line per message with its strip, batches as one block. JSON export is
  unchanged and still carries every entry.
- **Clock-trust mark, said once.** Today every row shows a bare `?` because `clockTrust` is
  `unknown` until the operator ticks "the clock on this PC is correct" (walkthrough finding
  2026-10-29). Change to: a single line in the top bar while the session's clock is
  unconfirmed ("Clock not confirmed — check it under Settings", linking there); on rows, a
  dimmed mark with a tooltip for `unknown`, a small ✓ with tooltip for `manual`, nothing for
  `ntp`. Confirming the clock is also the first item of the (later) shift-handover view.
- i18n for every new string, `da.json` complete.

Out: any change to `contract/text-protocol.md`; the hub; filtering or search.

## Read first

`contract/journal.schema.json` (`batchId`, `status_change`), `contract/text-protocol.md`
(the status chain), `tasks/phase-0/reports/P0-07.md` and `P0-08.md` (what the screens are
built from: `store/status.ts`, `store/outgoing.ts`, the queue module), `tasks/CONVENTIONS.md`.

## Acceptance

- The walkthrough fixture (`contract/examples/walkthrough.json`) renders as: 1 incident
  close, 1 correction under its note, 1 note, 2 message rows (one mesh with
  `sent · delivered · roger`, one courier with `sent · delivered` and the reasons on expand),
  1 incoming free-text row, 1 incoming `R1` row — and **no** `status_change` rows. Newest at
  the top.
- A fixture with a 25-recipient batch renders as one row with correct counters; expanding
  shows 25 rows; a late ack updates the counters live.
- After `composeMessage`, the store holds a `message_out` and nothing else; `statusOf` is
  `pending`.
- An old journal containing `pending` status changes imports, validates and renders
  identically to one without them.
- Every `message_out` created by one send-to-all shares one `batchId`; a single send has
  none; the schema test for a `note` with `batchId` fails validation.
- A new row arriving while the operator has scrolled down does not move the viewport; the
  "N new" pill appears and works.
- `npm run check`, `lint`, `test`, `build` green; `da.json` complete.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- Whether the register side panel's "last heard from" should also flip to newest-first or stay
  quietest-first (lean: stay — it exists to show who has gone quiet).
- Where the "history" disclosure lives on a batch row: per recipient only, or also one for the
  whole batch.
