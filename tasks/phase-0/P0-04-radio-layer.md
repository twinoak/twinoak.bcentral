# P0-04 — Radio layer

**Depends on:** P0-01. (Runs in parallel with P0-02/P0-03.)

## Goal

The app can connect to a MeshCore companion over Web Serial or Web Bluetooth, knows who it is,
can list its contacts and sync its clock, and says when it is blind.

## Scope

In:
- Port from `../meshguide.dk/lib/` into `app/src/radio/`:
  - `serial.js` → the companion protocol constants, frame helpers, parsers, `CompanionLink`
    and `MeshCoreSerial`. **Drop** the text-CLI parts (`command()`, `parseReply`, `identify()`'s
    CLI probe, `get()`): BCentral only ever talks to companions. Keep `MAX_TEXT_LEN = 160`.
  - `ble.js` → `MeshCoreBle` as is.
  - The log messages are Danish in the source; move them to i18n keys or English — they are
    developer log lines, English is fine.
  - Keep the files as `.js` ES modules with a `radio.d.ts` describing the exported API, or
    convert to `.ts` — decide and report. Keep the public method names, so the later
    extraction to a package is a move, not a rewrite.
- A `radio` store/service: `connect(kind: "usb" | "ble")`, `disconnect()`, `state`
  (disconnected / connecting / connected / blind), `selfInfo`, `contacts`, `lastHeardAt`.
  On connect: `companionQuery`, `companionSetTime` (the companion's clock only moves
  forward — log the result), `companionGetContacts`.
- Blind: `lastHeardAt` is updated on **every** received frame. `state` becomes `blind` when
  now − `lastHeardAt` exceeds the settings value (default 15 min) while connected. The top
  bar shows connected / blind / disconnected with the elapsed time.
- `ContactSource` implementation for P0-03's picker: the companion's contact list, refreshed
  on demand.
- Contact list screen (minimal): name, public key prefix, last advert, type. Read-only.

Out: sending or receiving messages (P0-05, P0-06).

## Read first

`../meshguide.dk/lib/serial.js`, `../meshguide.dk/lib/ble.js`, the header comment of
`../meshguide.dk/lib/remote-cli.js` (how send/ack works — not ported here, but P0-05 will).

## Acceptance

- Frame-level tests: `extractFrames` on split and concatenated byte streams; `parseSelfInfo`,
  `parseContact`, `parseContactMessage` (both v1 and v3), `parseSent`, `parseAck`,
  `parseCurrTime` on fixtures built from the layouts in the source comments.
- `companionCommand` tested with a fake `sendFrame`/`receiveFrame` pair: expected response
  codes end the wait, push frames (≥ 0x80) never count as the answer and land in the inbox.
- Blind state flips after the configured time with a fake clock, and back on the next frame.
- Manual: connect to a real companion over USB and over BLE from the UI; the contact list
  shows; the clock sync result is logged. Record board and firmware version in the report.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- `.js` + `.d.ts` versus `.ts` for the ported files.
- Whether to keep the `onLog` string log or switch to structured log objects (lean: keep,
  it is what the later package will have).
