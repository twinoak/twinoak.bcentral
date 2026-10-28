# P0-05 — Send to one recipient

**Depends on:** P0-02, P0-03, P0-04.

## Goal

The staff writes a message to one register entry; it goes out as `#n <text>`, and its status
walks the chain sent → delivered, or ends in given_up, with every step a `status_change`
entry.

## Scope

In:
- Compose: pick a register entry, type text. The app prepends `#n ` where `n` is the next
  per-recipient counter for this device (from the `meta` store, persisted before sending).
  Byte counter against 160 with the prefix included; send disabled over the limit.
- On send: append `message_out` (transport `mesh`, `seqNo` n, `text` is the full text as
  transmitted, prefix included) and a `status_change` → `pending`.
- Transmit per the pattern in `../meshguide.dk/lib/remote-cli.js` `command()`, minus the
  reply handling:
  - `textMessagePayload(publicKey, text, { txtType: TXT_TYPE_PLAIN, attempt, timestamp })`
    with a timestamp that never goes backwards for this companion (clock offset from
    `companionGetTime`, as `RemoteCli.nextTimestamp()` does).
  - `RESP_CODE_SENT` → `status_change` → `sent`; remember `expected_ack` and the companion's
    `est_timeout_ms`.
  - `PUSH_CODE_SEND_CONFIRMED` with that ack → `status_change` → `delivered`.
  - No ack within the window (`est_timeout_ms` + margin, clamped 5–20 s) → resend with the
    **same timestamp**, `attempt + 1`, up to 3 attempts (setting). Each resend is **not** a
    new `message_out`; it is a `note` entry "resend #n, attempt 2/3" referring to it.
  - After the last attempt without ack → `status_change` → `given_up`.
  - `RESP_CODE_ERR` from the companion → `given_up` immediately, with the error code in the
    status change's `text`.
- Manual retry from the UI on a `given_up` message: same flow again, same `seqNo`, same
  `message_out`; a new attempt sequence starting at a fresh timestamp.
- One send at a time per device: a second send waits until the first has reached a terminal
  state for this attempt (ack, resend window elapsed, or given up). Simple FIFO; the
  send-to-all queue in P0-08 builds on it.
- Non-mesh transports (`phone`, `courier`, `verbal`): compose with transport chosen, no
  radio involved, `status_change` entries set by the operator from buttons (sent / delivered
  / roger / given up).

Out: receiving, roger parsing (P0-06), multi-recipient (P0-08).

## Read first

`contract/text-protocol.md`, `../meshguide.dk/lib/remote-cli.js` (whole file),
`app/src/radio/` as delivered by P0-04.

## Acceptance

- With a fake link: send → `sent` → ack → `delivered`; send → no ack ×3 → `given_up`, with the
  three sends carrying the same timestamp and attempts 0, 1, 2; `RESP_CODE_ERR` → `given_up`.
- `seqNo` increments per recipient and survives a restart between two sends.
- A text of exactly 160 bytes including prefix sends; 161 is refused in the UI and in the
  store path.
- Manual: real radio, real phone running the MeshCore app: the message arrives showing
  `#1 …`, the app shows `delivered`. Record the round-trip time from `parseAck`.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
