# P0-06 — Receive and roger

**Depends on:** P0-05.

## Goal

Everything the radio receives lands in the journal as `message_in`, and `R` / `Rn` close
messages exactly as the contract says.

## Scope

In:
- Inbox drain: on `PUSH_CODE_MSG_WAITING` (and once right after connect), loop
  `companionNextMessage()` until `empty`. For `kind: "contact"`: match the 6-byte prefix to
  the companion's contact list → public key → register entry. Append `message_in` with
  transport `mesh`, `counterpartyId`, `text`, `dedupeKey`.
- Unknown sender (a contact with no register entry): the schema requires a counterparty, so
  create a register entry for it first — origin `private`, label `unknown <prefix>`, the full
  public key from the contact list — and append the `message_in` against it. The staff bind
  it to a person later by editing the label. One entry per key, never one per message.
- Channel messages (`kind: "channel"`): logged to the developer log, not to the journal.
  Channels are out of the model.
- Roger parsing, as a pure function `applyIncoming(text, counterpartyId, store)` implementing
  the three rules in `contract/text-protocol.md`, in that order, with the exact regexes. It
  appends the `status_change` → `roger` with `text` = the incoming entry's id, and nothing
  else. The incoming entry is always stored as `message_in` first, roger or not.
- `lastHeardAt` per register entry, derived from the latest `message_in` for it (store query,
  not a stored field).

Out: UI beyond showing incoming entries in the placeholder journal screen (P0-07 does the
real screen).

## Read first

`contract/text-protocol.md` — every line of "Incoming: field → staff" is a test case.

## Acceptance

- Tests, one per case: `R12` closes #12 when sent/delivered; `R12` when #12 is already roger →
  plain message, no status change; `R12` for an unknown n → plain; `r12` ≡ `R12`; `R` closes
  the highest open n; `R` with nothing open → plain; `R 12`, `R12.`, `roger`, `R12 tak` →
  plain; leading/trailing whitespace is trimmed before matching; `vedr. #12` → plain, no link.
- Dedupe: the same message delivered twice by the radio produces one `message_in`.
- Unknown sender creates one register entry per prefix, not one per message.
- Manual: phone replies `R1` to a delivered #1 → the app shows `roger`.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
