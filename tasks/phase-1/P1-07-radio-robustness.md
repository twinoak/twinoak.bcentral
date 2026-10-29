# P1-07 — Radio robustness

**Depends on:** P1-01.

## Goal

The radio link survives the things that happen on a table at 03:00: the USB cable is knocked
out and put back, the laptop sleeps, the BLE link drops, or someone opens the app in a browser
that has no Web Serial at all. The app recovers by itself where the browser allows, and says
exactly what is wrong where it does not.

## Scope

In:
- **USB auto-reconnect.** On start, `navigator.serial.getPorts()`; if exactly one previously
  granted port is present, connect to it without a gesture. Listen to `navigator.serial`
  `connect`/`disconnect` events: on `disconnect`, state → `disconnected` with the reason
  "radio unplugged"; on `connect` of a granted port, reconnect automatically. Retry with
  backoff (2 s, 5 s, 10 s, then every 30 s) while the port is present but `open()` fails
  (the companion rebooting). The outbox pauses while disconnected (P1-03 item 4) and resumes.
- **BLE reconnect.** On `gattserverdisconnected`, try `device.gatt.connect()` again with the
  same backoff for up to 5 minutes before giving up to `disconnected`; the device object is
  kept for the session. A manual "Reconnect" button is always there.
- **Wake from sleep.** On `visibilitychange` → visible and on `online`/`resume`-like events,
  verify the link with `companionGetTime()`; if it does not answer within 3 s, treat as
  disconnected and run the reconnect path.
- **Capability message.** When `navigator.serial` and `navigator.bluetooth` are both missing
  (Firefox, Safari), the radio page and the top bar say so in one sentence with the two
  browsers that work, instead of a disabled button. When only one is missing, only that
  transport's button is hidden, with the reason in its place.
- **Companion time drift.** On every (re)connect, compare the companion's clock with the PC's;
  if they differ by more than 60 s, log it in the radio log and show it on the radio page;
  the PC's clock still stamps the journal (clock trust unchanged).
- Radio log: reconnect attempts and outcomes are logged with times; the log is newest first
  (P1-01) and capped as before.
- i18n for every new string, `da.json` complete.

Out: multiple radios at once; changing radio settings; firmware.

## Read first

`app/src/radio/` (`radioStore.svelte.ts`, `serial.ts`, `ble.ts`, `outbox.svelte.ts`,
`web-apis.d.ts`), `tasks/phase-0/reports/P0-04.md`, `P0-05.md`, `tasks/phase-1/reports/P1-03.md`.

## Acceptance

- With a fake `navigator.serial` (ports list + event target) in tests: start with one granted
  port → connected without a gesture; `disconnect` event → `disconnected` with reason;
  `connect` event → connected again; `open()` failing twice then succeeding → connected after
  the backoff, with the attempts logged.
- With a fake GATT device: `gattserverdisconnected` → reconnect attempts with backoff →
  connected; after 5 minutes of failure → `disconnected`.
- Visibility change with a silent companion → disconnected → reconnect path.
- Both APIs missing → the capability message; only BLE missing → USB button only.
- Manual: real radio over USB — pull the cable while a message is queued, put it back; the
  app reconnects, the queue resumes, the journal shows the gap in the radio log. Close the
  lid for a minute; reopen; the link is verified or re-established.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
