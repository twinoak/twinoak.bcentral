# app

The staff's browser app. Offline-first PWA in TypeScript: talks to a MeshCore companion radio
over Web Serial / Web Bluetooth, keeps the journal in IndexedDB, exports with one click, and
syncs to a hub when internet is available.

Requires a Chromium browser (Chrome, Edge).

## Run

```
npm ci
npm run dev        # dev server
npm run build      # production build in dist/ (precached by the service worker)
npm run preview    # serve dist/ locally to test install and offline
npm run check      # svelte-check
npm run lint       # eslint, including the no-Promise.all / no-new-Promise rules
npm run format     # prettier --write
npm run test       # vitest
```

## Layout

| Path | Holds |
| --- | --- |
| `src/i18n/` | `en.json` (reference), `da.json`, and `t()` in `index.svelte.ts` |
| `src/lib/settings.svelte.ts` | operator name, device id (ULID, minted once), hub URL, blind-after minutes, send attempts, the gap between send-to-all transmissions |
| `src/lib/clock.svelte.ts` | clock trust for this session (`ntp` / `manual` / `unknown`) and `now()` |
| `src/lib/currentIncident.svelte.ts` | which incident the app is working in (id only, kept in `localStorage`), and a change listener the inbox drains on |
| `src/lib/router.svelte.ts` | hash routing: `#/` home, `#/journal` (also `#/send`, the old stand-in), `#/queue`, `#/register`, `#/radio`, `#/settings` |
| `src/lib/elapsed.ts` | "12 s" / "3 min" / "1 h 5 min" for the top bar |
| `src/lib/storage.ts` | the only place that touches `localStorage` |
| `src/store/` | the journal in IndexedDB (`idb`): `journalStore.ts` is the one write path per object kind, validated with `ajv` against `contract/journal.schema.json` (`schema.ts`); `status.ts` derives a message's status; `dedupeKey.ts` hashes an incoming message; `register.ts` is the register's rules (key validation, ad hoc labels, the edit and its journal note); `outgoing.ts` the `#n` prefix, the 160-byte rule, composing a `message_out` with its reserved number (one, or one per recipient for send-to-all) and the operator's manual status changes; `incoming.ts` the roger rules of the text protocol applied to a stored `message_in`; `incidents.ts` open / closed and the two status changes that move it; `manual.ts` the entries the operator types in (note, correction, non-mesh incoming message); `journalView.ts` what the journal screen shows, derived from an incident's entries (timeline with nesting and status chips, open items, last heard from); `export.ts` writes the export file; `index.ts` is the app's store |
| `src/radio/` | the MeshCore companion: `serial.ts` is the protocol (constants, frame helpers, parsers, payload builders), `CompanionLink` (one command at a time over a frame transport, pushes to an inbox) and the Web Serial transport; `ble.ts` the Web Bluetooth transport; `radioStore.svelte.ts` the app's view of the radio (state, self info, contacts, last heard, blind, push listeners); `outbox.svelte.ts` sends a stored message through the radio (sent → delivered, resends with the same timestamp, given up), one at a time; `inbox.svelte.ts` drains what the radio received into the journal as `message_in` (sender by key prefix, unknown senders get a register entry, dedupe, then the roger rules); `sendQueue.svelte.ts` the send-to-all queue over the outbox (minimum gap between transmissions, paused while no radio is connected, in-memory batches, pending messages queued again after a reload); `contactSource.ts` the `ContactSource` the register's key picker reads from; `deferred.ts` the one promise resolver the transports need; `web-apis.d.ts` the Web Serial / Bluetooth types; `index.ts` wires the app's instances |
| `src/test-support/` | fakes for tests: `localStorage`, a store on `fake-indexeddb`, the contract walkthrough, a frame transport and the companion frames it answers with |
| `src/components/` | top bar (with the radio's connected / blind / disconnected state), language select, the register form, the ad hoc batch form, the contact picker, the compose form (recipient, transport, text with the byte counter), the send-to-all compose form (recipient picker: all / by street / by hand, byte counter for the longest prefix), and the journal screen's parts: incident bar, timeline, open items, last heard from, the manual-entry form |
| `src/pages/` | one file per screen; `JournalPage.svelte` is the screen the staff live on, `QueuePage.svelte` the send-to-all queue they watch drain |
| `scripts/make-icon.mjs` | writes `public/icon-192.png` and `icon-512.png` before `dev` and `build` |

Every user-facing string goes through `t("key")`. A key in `en.json` that is missing from
`da.json` fails `npm run test`.

The contract schema is imported straight from `../contract/journal.schema.json`; the dev
server is allowed to serve one level above the project for that (`server.fs.allow` in
`vite.config.ts`).
