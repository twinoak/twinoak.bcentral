# P3-01 — "New record" and "MeshCore": two tabs with one job each

**Depends on:** P2-05.

## Goal

The compose card stops mixing two jobs. Today "New message" can also register a phone call
or a courier note by picking a transport, while "Add by hand" registers notes and incoming
messages — so the same thing can be done from two places and neither tab's name says what it
is for. After this task:

- **Tab 1 — "New record"** (da: *Opret registrering*): everything the operator writes into
  the journal *by hand*: a note, an incoming message, an outgoing message — the latter two
  on a non-radio transport (phone, courier, verbal).
- **Tab 2 — "MeshCore"**: sending a message out over the radio, and nothing else. No
  transport choice.

## Scope

In:
- **Tab order and names.** Tab 1 "New record", tab 2 "MeshCore"; tab 1 is the one shown on
  load. i18n: `journal.add.title` → "New record" / "Opret registrering";
  `journal.compose.title` → "MeshCore" in both languages (a product name, not translated).
  Keyboard (P1-09): `A` opens tab 1, `N` opens tab 2; the `?` overlay and `app/README.md`
  updated.
- **Tab 1, "New record"** (`ManualEntryForm`): a *Type* select with three options —
  `note` "Note" / "Notat", `message_in` "Incoming message" / "Indgående besked",
  `message_out` "Outgoing message" / "Udgående besked". For the two message types: a
  counterparty select (label "From" for incoming, "To" for outgoing), a *Via* select with
  **phone / courier / verbal only** (mesh is not an option here; the current
  `send.transport` keys are reused minus `mesh`), and the text. An outgoing record is stored
  exactly as the compose form stores a non-mesh message today: a `message_out` with the
  recipient's next `#n` in the text (the per-recipient counter is shared across transports,
  as now — see `contract/text-protocol.md`, "Non-mesh transports"), status set by the
  operator from the row afterwards (`sent` / `delivered` / `roger` / `given up` with a
  reason). Note: no counterparty, no transport. The byte counter is not shown on this tab
  (no radio limit applies).
- **Tab 2, "MeshCore"** (`ComposeForm`): recipient select (register entries that have a
  public key — pending rows from P1-06 are not listed), text with the byte counter, Send.
  The *Via* select and the `TRANSPORTS` list are removed from this form; the form's
  transport is `mesh`, always. The drill prefix (P1-05) and the "Replying to" line (P1-02)
  stay.
- **Reply from the row (P1-02), rerouted deterministically:** Reply on a `message_in` with
  transport `mesh` opens tab 2 with the sender as recipient; Reply on a `message_in` with any
  other transport opens tab 1 with type `message_out`, the same transport, and the sender as
  counterparty. Both carry `refersTo` as before.
- **Handover actions (P1-08)** that compose by courier ("send by courier" on a given-up
  message) open tab 1 with type `message_out`, transport `courier`, the recipient and the
  text prefilled; "Send status request" stays on tab 2 (it is a radio message).
- The `send.record` button label ("Record" when the transport was not mesh) moves to tab 1's
  save button; tab 2's button is always "Send".
- Tests: tab 1 stores a note, an incoming phone message (no `dedupeKey`, no status), an
  outgoing courier message (`#n`, `seqNo` reserved, no transmission); tab 2 refuses pending
  register rows and always stores `transport: "mesh"`; Reply routes to the right tab with
  the right prefill for a mesh and for a courier incoming; the handover courier action lands
  on tab 1 prefilled.
- `da.json` and `en.json` complete; removed keys deleted from both.

Out: the data model (no schema change); send-to-all; anything on other pages beyond the
handover actions named above.

## Read first

`contract/text-protocol.md` ("Non-mesh transports", "Status of an outgoing message"),
`JournalPage.svelte` (the tabs and `replyTo` wiring), `ComposeForm.svelte`,
`ManualEntryForm.svelte`, `HandoverPage.svelte` (courier action),
`tasks/phase-1/reports/P1-02.md`, `tasks/phase-2/reports/P2-03.md`, `docs/design.md`
(§Components: tabs, fields).

## Acceptance

- The journal opens on "New record"; "MeshCore" is the second tab; no *Via* control exists on
  the MeshCore tab; the *Via* control on "New record" offers phone, courier, verbal only and
  only for the two message types.
- The stored entries for each of the five paths (note, incoming by phone, outgoing by
  courier, mesh send, reply to a courier incoming) validate against the schema and match the
  shapes the tests assert.
- `A` and `N` open the right tabs; the `?` overlay says so.
- `npm run check`, `lint`, `test`, `build` green; `npm run screenshots` refreshed for the
  journal route (the compose card changed).

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```

## Left open (decide and report)

- English name of tab 1: "New record" is the proposal; "Log by hand" is the alternative.
  The Danish name is decided ("Opret registrering").
- Whether the counterparty select on "New record" should also allow a free-text name for a
  caller who is not in the register (lean: no — the schema requires a register entry;
  the operator adds a `private` entry first, as for unknown radios).
