# app

The staff's browser app. Offline-first PWA in TypeScript: talks to a MeshCore companion radio
over Web Serial / Web Bluetooth, keeps the journal in IndexedDB, exports with one click, and
syncs to a hub when internet is available.

## For the staff: installing BCentral on a laptop

BCentral is a web page that installs itself as an app. Once installed it works with no
internet at all; the internet is needed only to install it and to pick up new versions.

**Which browsers.** Chrome or Edge on a Windows, macOS or Linux laptop. Nothing else: the
radio is reached over Web Serial and Web Bluetooth, which Firefox and Safari do not have, so
iPads and iPhones are out too.

**Install.**

1. Open https://twinoak.github.io/twinoak.bcentral/ in Chrome or Edge.
2. In the address bar, click the install icon (a screen with an arrow, at the right end), or
   use the browser menu → *Install BCentral* (Chrome) / *Apps → Install this site as an app*
   (Edge). Confirm.
3. BCentral opens in its own window and gets a shortcut on the desktop or in the start menu.
   Open it from there from now on.
4. Under **Settings**, type the operator name and check the clock, then plug in the radio and
   connect it under **Radio**.

**Before a drill, open it once while online.** The installed app keeps a copy of itself and
opens without network, but a new version is only fetched while the laptop is online. Open
BCentral a day before the drill, wait for the banner "A new version is available" if there is
one, click **Reload**, and check under **Settings → About** that the version is the expected
one. From then on the laptop can be offline.

**Updates never happen on their own.** When a new version is published the running app shows
a banner with a Reload button; until it is clicked the app stays exactly as it is, so nothing
changes in the middle of an incident. The journal is kept in the browser on the laptop and
survives updates, restarts and being offline; export it (**Journal → Export**) after every
incident anyway.

**Set a journal folder.** Under **Settings → Journal folder**, choose a folder on a USB stick
or in a synced folder. From then on every journal entry is appended to a file there the moment
it is written, and every export is saved there too; if the laptop dies, the file is still
there. After a browser restart the top bar asks once for permission to the folder again: one
click. **Print the journal** (**Journal → Print journal**) as a routine, say every hour: the
print view prints only what is new since the last print.

**Rehearse in a drill.** When creating an incident, tick **This is a drill**. A yellow
ØVELSE / DRILL band then sits across the top of every screen while that incident is selected,
every message goes out as `ØVELSE #n …` so nobody on a phone mistakes it for the real thing,
drills are listed under their own heading in the incident switcher, and an export made while
a drill is selected holds the drills only (the file is named `…-drill.json`); an export made
while a real incident is selected holds the real journal only. The choice is final: a drill
cannot become a real incident, nor the other way round. The register and "last heard from"
are shared, because a radio heard in a drill is a radio that works.

**Load the resident list.** Under **Register → Import CSV**, pick the association's list as a
CSV file (saved from Excel with `;` or `,`): columns `label` (required), `person`, `street`,
`role`, `origin` (`issued`, `adhoc` or `private`; `issued` when empty), `publicKey` and
`notes`, in any order. The screen shows every row and every error before anything is
written; a file with an error is fixed in Excel and picked again. Rows without a radio key
land under **Not yet bound to a radio** and are bound one by one when the radios are handed
out (pick the key from the radio's contact list, or type it). **Export CSV** writes the
register back out as a file Excel opens as it is, and **Print register** prints the list
(label, person, street, role, key) for the box.

**When the radio drops out.** A USB radio that is knocked out and put back is reconnected by
the app on its own, and the next time the app starts it connects the radio it was granted
before without a click. A Bluetooth radio that drops is tried again for five minutes; after
that, **Radio → Reconnect**. When the laptop wakes from sleep the link is checked and
re-established if the radio does not answer. The top bar says why there is no radio ("radio
unplugged", "the radio did not answer"), and the radio page says when the radio's own clock
disagreed with the laptop's by more than a minute; the journal always uses the laptop's clock.

**Opening it without the shortcut.** The same address in the browser works too, with the
same journal, as long as it is the same browser profile on the same laptop. A different
browser, profile or laptop is a different device with its own journal.

## For developers

Requires Node 20.11 or later and a Chromium browser (Chrome, Edge).

```
npm ci
npm run dev        # dev server at / (no service worker, no update check)
npm run build      # production build in dist/ under /twinoak.bcentral/ (precached by the service worker)
npm run preview    # serve dist/ locally to test install and offline
npm run check      # svelte-check
npm run lint       # eslint, including the no-Promise.all / no-new-Promise rules
npm run format     # prettier --write
npm run test       # vitest
```

Deployment: `.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages on every push to
`main`; see `../deploy/README.md`, also for the custom-domain switch.

## Layout

| Path | Holds |
| --- | --- |
| `src/i18n/` | `en.json` (reference), `da.json`, and `t()` in `index.svelte.ts` |
| `src/lib/settings.svelte.ts` | operator name, device id (ULID, minted once), hub URL, blind-after minutes, send attempts, the gap between send-to-all transmissions |
| `src/lib/clock.svelte.ts` | clock trust for this session (`ntp` / `manual` / `unknown`) and `now()` |
| `src/lib/version.ts` | the running build's version, commit and build time, injected by `define` in `vite.config.ts`; `versionLabel()` for the top bar and settings |
| `src/lib/updates.svelte.ts` | the installed app's updates: the service worker waits for the operator's Reload, "last checked", "Check now"; `main.ts` starts it with `registerSW` |
| `src/lib/currentIncident.svelte.ts` | which incident the app is working in (id only, kept in `localStorage`), and a change listener the inbox drains on |
| `src/lib/router.svelte.ts` | hash routing: `#/` home, `#/journal` (also `#/send`, the old stand-in), `#/queue`, `#/register`, `#/register/print`, `#/radio`, `#/settings`, `#/print` |
| `src/lib/elapsed.ts` | "12 s" / "3 min" / "1 h 5 min" for the top bar |
| `src/lib/persistence.svelte.ts` | `navigator.storage.persist()` on start and the usage estimate (P1-04): a refusal is a top-bar line until a journal folder is set |
| `src/lib/journalText.ts` | the words of a journal row (strip, batch counters, history line, times), shared by the timeline and the print view |
| `src/lib/file-system-access.d.ts` | the File System Access API members lib.dom lacks: the directory picker, `queryPermission` / `requestPermission` |
| `src/lib/storage.ts` | the only place that touches `localStorage` |
| `src/store/` | the journal in IndexedDB (`idb`): `journalStore.ts` is the one write path per object kind, validated with `ajv` against `contract/journal.schema.json` (`schema.ts`); `status.ts` derives a message's status; `dedupeKey.ts` hashes an incoming message; `register.ts` is the register's rules (key validation, ad hoc labels, the edit and its journal note); `outgoing.ts` the `#n` prefix, the 160-byte rule, composing a `message_out` with its reserved number (one, or one per recipient for send-to-all; with `refersTo` when it answers an incoming message) and the operator's manual status changes; `incoming.ts` the roger rules of the text protocol applied to a stored `message_in`; `incidents.ts` open / closed and the two status changes that move it, and whether an incident is a drill (P1-05: `drill: true`, fixed at creation; `outgoing.ts` puts `ØVELSE ` in front of every text of a drill, the export can be scoped to drills or real incidents and the drill file is named `-drill`); `drillMode.svelte.ts` follows the current incident so the band on every screen and the window title say ØVELSE while a drill is selected; `manual.ts` the entries the operator types in (note, correction, non-mesh incoming message); `journalView.ts` what the journal screen shows, derived from an incident's entries (the timeline newest first: one row per slip with the status strip on an outgoing message, its transitions folded into a history, the messages of one send-to-all as one row with counters; open items; last heard from); `export.ts` writes the export file; `mirrorFile.ts` the journal folder's files (P1-04: one append-only `.ndjson` per device, one line per write with its kind first, read back into an envelope; the export file written whole) and `mirror.svelte.ts` the mirror itself (listens to the store's writes, keeps the folder handle in `meta`, re-asks the permission after a restart, shows its state in the top bar, never blocks a write); `printView.ts` the print view's rows (the timeline's folding, oldest first, "since last print" by what changed in a row); `registerCsv.ts` the register as a CSV file (P1-06: the import's parsing and rules, every fault an error naming the line, the export with `;`, BOM and CRLF) and `registerImport.ts` its write (one transaction for the entries and the pending rows — rows without a key, kept in `meta` until a key is bound — and the note in the current incident); `index.ts` is the app's store |
| `src/radio/` | the MeshCore companion: `serial.ts` is the protocol (constants, frame helpers, parsers, payload builders), `CompanionLink` (one command at a time over a frame transport, pushes to an inbox) and the Web Serial transport (a port given or chosen, kept for reopening); `ble.ts` the Web Bluetooth transport (the device kept for the session); `radioStore.svelte.ts` the app's view of the radio (state, self info, contacts, last heard, blind, push listeners, and P1-07: why it is disconnected, the reconnect loop with backoff over the kept transport, one granted USB port connected on start and on its `connect` event, the link check after a wake, the companion's clock drift); `capability.ts` which transports the browser has; `outbox.svelte.ts` sends a stored message through the radio (sent → delivered, resends with the same timestamp, given up), one at a time; `inbox.svelte.ts` drains what the radio received into the journal as `message_in` (sender by key prefix, unknown senders get a register entry, dedupe, then the roger rules); `sendQueue.svelte.ts` the send-to-all queue over the outbox (minimum gap between transmissions, paused while no radio is connected, batches keyed by the messages' `batchId`, pending messages queued again under their batch after a reload); `contactSource.ts` the `ContactSource` the register's key picker reads from; `deferred.ts` the one promise resolver the transports need; `web-apis.d.ts` the Web Serial / Bluetooth types; `index.ts` wires the app's instances |
| `src/test-support/` | fakes for tests: `localStorage`, a store on `fake-indexeddb`, the contract walkthrough, a frame transport and the companion frames it answers with, Web Serial (granted ports with real streams, plug events) and Web Bluetooth (a device, GATT server and the UART characteristics) so the real transports run in tests, an in-memory journal folder, the register CSV fixtures (built as strings so the BOM and CRLF are exact) |
| `src/components/` | top bar (with the radio's connected / blind / disconnected state, a "clock not confirmed" line while the session's clock is unconfirmed, and the version in the brand's tooltip), the drill band (ØVELSE / DRILL across every screen while a drill is current), the update banner, language select, the register form (also binds a key to a row imported without one), the ad hoc batch form, the register CSV import (file, preview, errors, commit), the contact picker, the compose form (recipient, transport, text with the byte counter; "Replying to" when a reply was started from a row, Esc drops it, Ctrl+Enter sends), the send-to-all compose form (recipient picker: all / by street / by hand, byte counter for the longest prefix), and the journal screen's parts: incident bar (with the "This is a drill" checkbox and drills under their own heading), timeline (newest first, status strip and history per outgoing message, batch rows, the "N new" pill, Reply on every incoming row with the answer linked both ways), open items, last heard from, the manual-entry form |
| `src/pages/` | one file per screen; `JournalPage.svelte` is the screen the staff live on, `QueuePage.svelte` the send-to-all queue they watch drain, `PrintPage.svelte` (`#/print`) the journal as a document for the browser's print dialog, `RegisterPage.svelte` the register with its CSV import and export and the rows not yet bound to a radio, `PrintRegisterPage.svelte` (`#/register/print`) the register as a printable list for the box, `SettingsPage.svelte` also the journal folder and the storage line |
| `scripts/make-icon.mjs` | writes `public/icon-192.png` and `icon-512.png` before `dev` and `build` |

Every user-facing string goes through `t("key")`. A key in `en.json` that is missing from
`da.json` fails `npm run test`.

The contract schema is imported straight from `../contract/journal.schema.json`; the dev
server is allowed to serve one level above the project for that (`server.fs.allow` in
`vite.config.ts`).
