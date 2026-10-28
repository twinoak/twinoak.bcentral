# P0-08 — Send to all

**Depends on:** P0-07.

## Goal

One text to many register entries as a visible queue, with the airtime cost shown and the
status per recipient in front of the operator.

## Scope

In:
- Compose with a recipient picker: all / by street / hand-picked. Byte counter uses the
  longest `#n ` prefix among the chosen recipients.
- On send: one `message_out` per recipient with that recipient's own next `seqNo`, all
  appended before the first transmission (so the journal shows the whole batch at once).
  A batch id kept in memory only, for the queue screen; not in the data.
- Queue: feeds P0-05's one-at-a-time sender. Rate limit: a minimum gap between transmissions
  (setting, default 10 s; the mesh tolerates a handful of messages a minute). The queue
  screen shows, per recipient: label, `#n`, status chip, attempt, and a countdown to the next
  transmission. Totals at the top: pending / sent / delivered / roger / given up, and the
  estimated time to drain.
- Retry given-up ones from the queue, individually or all.
- The queue survives a reload: `pending` messages with no `sent` yet are re-queued on start
  (derived from the store; nothing extra persisted).

Out: scheduling, templates, anything that is not sending the same text to N people.

## Read first

`docs/brainstorm-2026-10-28.md` §5 ("Send to all is a queue, not a button").

## Acceptance

- With a fake link and 25 recipients: all 25 `message_out` entries exist before the first
  `sent`; transmissions are spaced by at least the gap; the countdown counts down; acks mark
  the right recipient.
- Reload mid-queue: the remaining `pending` ones continue, none is sent twice (one
  `message_out` per recipient per batch, checked by `seqNo`).
- Manual: three real radios, send to all, watch the queue; record the drain time.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
