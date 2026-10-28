# Text protocol

Version 1, draft of 2026-10-28.

This is the protocol carried *inside the text* of MeshCore direct messages between a BCentral
staff device and a field radio. It needs no firmware change and no custom app: a field person
using the stock MeshCore app follows it by typing. A future custom app follows it by putting a
button in front of the same text.

Only two things are parsed, both on incoming messages. Everything else is free text.

## Identity

A counterparty is identified by the radio's public key, never by its name. Names live in the
register and can change; keys do not.

## Outgoing: staff → field

Every message from a staff device to a field radio has the form

```
#<n> <text>
```

- `<n>` is a decimal integer ≥ 1 with no leading zeros.
- `<n>` counts per recipient, per sending device. It starts at 1 and increments by 1 per
  message to that recipient. It is never reused and never reset — not per incident, not per
  day — for the lifetime of the register entry on that device.
- Exactly one space follows the number, then the text.
- Every outgoing message is numbered, including informational ones. There is no unnumbered
  form.
- Length: a MeshCore text message is at most 160 bytes of UTF-8 (BaseChatMesh.h). Danish
  letters cost two bytes each and `#12 ` costs four. The app counts bytes, not characters, and
  refuses to send over the limit. Orders are short.

## Incoming: field → staff

Trim leading and trailing whitespace from the message text, then test, in this order:

1. **Numbered roger.** Text matches `^[Rr]([1-9][0-9]*)$`, giving `n`.
   - If `n` identifies a message this device sent to this counterparty, and that message's
     derived status is `sent` or `delivered`: record `roger` for it.
   - Otherwise (unknown `n`, or already `roger`, or `given_up`): store as an ordinary incoming
     message. No status change. No guessing at which message was meant.
2. **Bare roger.** Text matches `^[Rr]$`.
   - If this device has messages to this counterparty whose derived status is `sent` or
     `delivered`: record `roger` for the one with the highest `n` among them.
   - Otherwise: store as an ordinary incoming message.
3. **Anything else** is an ordinary incoming message.

`R12` and `r12` are equivalent. `R 12`, `R12.`, `roger`, `R12 tak` are not roger; they are free
text. The rule is exact match or nothing.

A reply such as `vedr. #12 kælderen er tør` is a human convention. It is **not** parsed and
**not** linked automatically. The operator can link it to #12 by hand, which records a
`refersTo` on the incoming entry.

## Status of an outgoing message

Status is never stored on the message itself. It is derived from `status_change` entries that
refer to the message, and the latest one wins. The chain:

| Status | Set when |
| --- | --- |
| `pending` | queued in the app, not yet handed to the radio |
| `sent` | the companion accepted and transmitted the message |
| `delivered` | the companion reported the delivery receipt (ACK) for it |
| `roger` | an incoming message matched rule 1 or 2 above |
| `given_up` | the app stopped retrying (default 3 attempts, configurable) |

A message can go back from `given_up` to `sent` by a manual retry. `roger` is final.

For non-mesh transports (`phone`, `courier`, `verbal`) the operator sets `sent`, `delivered`
and `roger` by hand, from what the courier or the phone call told them. Same entries, same
chain.

## Send to all

"Send to all" is not a message type. It expands in the app into one outgoing message per
recipient, each with that recipient's own next `n`, each with its own independent status.
The app may remember that they were created together (a batch id) for display; the batch is
not part of the exchanged data.

## Drill mode — proposed, not decided

If adopted: outgoing messages in a drill incident carry the prefix `ØVELSE ` before `#<n>`:

```
ØVELSE #12 Kør til Nørregade 4
```

Incoming rules are unchanged. The prefix is for the humans reading their phones.

## Several staff devices sending to the same radio — open

Two staff devices sending to the same field radio would both count from `#1`, and `R12` would
be ambiguous. Not a v1 problem: one staff, one device. If it becomes one, the proposed fix is
an optional single-letter device tag set in the app's settings, giving `#B12` and `RB12`.
