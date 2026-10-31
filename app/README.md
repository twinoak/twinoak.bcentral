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
4. The journal opens with a setup card: type your name, tick the clock if it is right, plug
   in the radio and connect it, press **Start**. The clock and the radio can wait; their
   chips in the top bar do the same later.

**The top bar says what needs you.** One bar on every screen: the incident you are working
in (click it to switch, create, close, export or print), then a row of small status chips —
radio, clock, storage, and an update when one waits. A grey chip is fine; a tinted chip needs
a decision, and clicking it shows one sentence and one button (confirm the clock, choose a
folder, reconnect the radio, reload). Then the screens, your name (click it for the handover
page) and the language.

**The journal is where you work.** One card on top with two tabs, *New message* and *Add by
hand*; under it the journal, newest first, one line per slip: the time, who (→ a message out
to a radio, ← a message in from one, or the operator for a note), the text, and at the right
the delivery strip of an outgoing message (sent · delivered · roger, each with its dot; a
batch shows its counts). Put the pointer on a row and its buttons appear — Reply, Retry, Mark,
History, Correct; a correction stays under the entry as a small line. When you have scrolled
down and new rows arrive, a chip "N new" at the top of the list brings you back. At the side:
open items (every outgoing message without a roger) and when each radio was last heard from;
click an open item to jump to it.

**Before a drill, open it once while online.** The installed app keeps a copy of itself and
opens without network, but a new version is only fetched while the laptop is online. Open
BCentral a day before the drill, wait for the chip "Update waiting" in the top bar if there is
one, click it and **Reload**, and check under **Settings → About** that the version is the
expected one. From then on the laptop can be offline.

**Updates never happen on their own.** When a new version is published the running app shows
an update chip in the top bar with a Reload button behind it; until it is clicked the app
stays exactly as it is, so nothing changes in the middle of an incident. The journal is kept
in the browser on the laptop and survives updates, restarts and being offline; export it (the
incident in the top bar → **Export journal**) after every incident anyway.

**Set a journal folder.** Under **Settings → Journal folder** (or from the storage chip in
the top bar), choose a folder on a USB stick or in a synced folder. From then on every journal
entry is appended to a file there the moment it is written, and every export is saved there
too; if the laptop dies, the file is still there. After a browser restart the storage chip
asks once for permission to the folder again: one click. **Print the journal** (the incident
in the top bar → **Print journal**) as a routine, say every hour: the print view prints only
what is new since the last print.

**Rehearse in a drill.** When creating an incident, tick **This is a drill**. The whole top
bar then turns lavender with an ØVELSE chip next to the incident while that incident is
selected, every message goes out as `ØVELSE #n …` so nobody on a phone mistakes it for the
real thing, drills are listed under their own heading in the incident switcher, and an export
made while a drill is selected holds the drills only (the file is named `…-drill.json`); an
export made while a real incident is selected holds the real journal only. The choice is
final: a drill cannot become a real incident, nor the other way round. The register and "last
heard from" are shared, because a radio heard in a drill is a radio that works.

**The register is one table.** Under **Register**: a search field (label, person, street,
role, notes), the count, and the buttons Import CSV, Export CSV, Print, Add several ad hoc
radios and Add radio above a table of every radio — label, person, street, role, origin,
the key's first characters and when it was last heard from. Add, Edit and Bind open in a
card at the right of the table (under the toolbar on a narrow window); saved, bound,
created and imported show as a small confirmation at the bottom left.

**Load the resident list.** Under **Register → Import CSV**, pick the association's list as a
CSV file (saved from Excel with `;` or `,`): columns `label` (required), `person`, `street`,
`role`, `origin` (`issued`, `adhoc` or `private`; `issued` when empty), `publicKey` and
`notes`, in any order. The screen shows every row and every error before anything is
written; a file with an error is fixed in Excel and picked again. Rows without a radio key
land under **Not yet bound to a radio** and are bound one by one when the radios are handed
out (pick the key from the radio's contact list, or type it). **Export CSV** writes the
register back out as a file Excel opens as it is, and the print button prints the list
(label, person, street, role, key) for the box.

**Send to all.** Under **Send to all**: a card to compose one text for many — the recipients
as a checklist grouped by street (a street's own box takes the whole street; All and None
take the register), the text with its byte counter, Send — above the queue, a table with one
row per recipient: the radio, its `#n`, the text, the state, the attempt and the earliest
time it can go out. The queue's title carries the counts, what the queue is doing (the next
transmission's countdown, who is being sent to, or "Paused: no radio") and the time to
drain. Once a batch is queued the compose card folds away and the queue takes the screen;
**New message to many** in the queue's title opens it again. A given-up row has Retry; the
title has Retry all.

**When the radio drops out.** A USB radio that is knocked out and put back is reconnected by
the app on its own, and the next time the app starts it connects the radio it was granted
before without a click. A Bluetooth radio that drops is tried again for five minutes; after
that, **Radio → Reconnect**. When the laptop wakes from sleep the link is checked and
re-established if the radio does not answer. The radio chip in the top bar says why there is
no radio ("radio unplugged", "the radio did not answer") and offers Reconnect, and the radio
page says when the radio's own clock disagreed with the laptop's by more than a minute; the
journal always uses the laptop's clock.

**Hand over to the next operator.** The operator taking over opens **Handover** (next to
Journal), types their name in the slim card on top and presses **Take over**: the journal
gets one note `handover: ‹old› → ‹new›` and every entry from then on carries the new name.
The same card shows the incident and how long it has been open, the clock-confirm box, the
radio's state and **Print handover**; under it four cards, each with its count in the
title, oldest first: open orders (no roger yet), given-up messages with the three decisions
on the row (retry, send by courier, close with a reason), unanswered incoming messages with
Reply (the message form opens between the card and the lists), and quiet radios (not heard
from within the blind time) with **Send status request**, which sends `#n Meld status`.
**Print handover** puts the four lists on paper with the time and both names.

**Settings are cards, one per topic.** Operator, Clock, Journal folder, Radio (the state, the
Radio page, the blind time, the send attempts and the gap), Hub, Text & contrast, Language
and About (the version, the device id, the storage, the style guide). A card with typed
values has its own **Save**; a switch applies at once.

**Readable from a metre away, operable from the keyboard.** The text is 16 px by default;
under **Settings → Text & contrast** choose *Large* or *Largest*, and **High contrast** for black on
white with no greys. Both apply at once and are kept. Press **?** (or the ? button in the top
bar) for the keyboard shortcuts: `N` new message, `R` reply to the current incoming row, `A`
add a note, `J` / `K` move down and up the journal, `Enter` opens the current row (a batch's
recipients, a message's history), `Ctrl+Enter` sends or records the form you are in, `Esc`
cancels, and `G` then `J` / `R` / `H` / `S` goes to Journal / Register / Handover / Settings.
Nothing fires while you are typing in a field, except `Ctrl+Enter` and `Esc`.

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
| `src/lib/settings.svelte.ts` | operator name, device id (ULID, minted once), hub URL, blind-after minutes, send attempts, the gap between send-to-all transmissions, the text size and high contrast (P1-09) |
| `src/lib/appearance.ts` | puts the text size and the contrast mode on the root element as the attributes `styles/tokens.css` keys on (P1-09), and `data-drill` while a drill is current, which the top bar's tint keys on (P2-02) |
| `src/styles/` | the design language (`docs/design.md`, P2-01): `tokens.css` (every colour, size, space, radius, shadow and scrim token, the two font stacks, the three font-size roots 16 / 18 / 21 px, the high-contrast overrides, and the three transition aliases the print pages still use), `base.css` (the bundled Inter `@font-face`, resets, the page width and gutter, headings, links, `code`, the focus ring, the print base), `components.css` (`.btn*` with `.btn-link` and `.btn-compact`, `.field` with `.field-grow`, `.field-line` and `.field-mono`, `.form-actions` and `.toolbar`, `.chip*`, `.strip`, `.card`, `.tabs`, `.table` with `.table-box`, `.label`, `.num` and `.pick`, `.dl`, `.rows` — a subgrid so the columns line up down the list, with `.rows-3` / `.rows-2` / `.rows-log` and `.rows-actions-always`, the `.row-*` cells and lines, `.row-button`, `.rows-box` and the sticky `.rows-top`, P2-03 — `.popover` with `.popover-host` and the modal `.popover-dialog`, `.toast`, `.msg*`, `.empty`, `.icon`, and the `.shell*` rules of the top bar with its drill tint, P2-02), `transition.css` (the P1-09 element rules the two print pages still lean on; P2-05 restyles them and removes the file); `src/app.css` only imports them |
| `src/assets/fonts/` | `InterVariable.woff2` with its SIL OFL 1.1 licence; precached by the service worker, so no font request leaves the page |
| `src/lib/icons.ts` | the sixteen stroke icons as path data on a 20 px grid; `components/Icon.svelte` draws one (`aria-hidden` unless given a label) |
| `src/lib/colourLiterals.ts` | finds `#hex`, `rgb(` and `hsl(` outside `styles/tokens.css`; its test counts them and is `todo` until P2-05 turns it on at zero |
| `src/lib/shortcuts.ts` | the keyboard shortcuts as one pure rule (key in, action out; nothing in a text field but Ctrl+Enter and Esc; the G chords), and the documented set the `?` overlay lists; `shortcutDispatch.ts` the window listener and the handler registry the screens register on; `shortcutHelp.svelte.ts` whether the overlay is open |
| `src/lib/journalRows.ts` | the journal rows' rules (P2-03): the chip look (tint and dot) of every status and strip state, the batch counters as chips, a message row's direction glyph |
| `src/lib/queueRows.ts` | the send-to-all queue's rules (P2-04): the counts in the card title as the batch row's counter chips, a row's state chip (warn with an outline dot while the queue or the outbox holds the message) |
| `src/lib/recipientGroups.ts` | the recipient picker's street grouping (P2-04): the register as groups, one per street in the collator's order, the entries without a street last; whether a group is all, some or none chosen |
| `src/lib/registerFilter.ts` | the register's search (P2-04): an exact, case-folded substring of the label, person, street, role or notes |
| `src/lib/statusChips.ts` | the status cluster of the top bar (P2-02) as one pure rule: for each of radio, clock, storage and update, whether the chip shows, its tint, its words and what its popover says and offers, from the stores' states; `popover.svelte.ts` which popover is open (one at a time); `toast.svelte.ts` the one confirmation showing, four seconds |
| `src/lib/clock.svelte.ts` | clock trust for this session (`ntp` / `manual` / `unknown`) and `now()` |
| `src/lib/version.ts` | the running build's version, commit and build time, injected by `define` in `vite.config.ts`; `versionLabel()` for the top bar and settings |
| `src/lib/updates.svelte.ts` | the installed app's updates: the service worker waits for the operator's Reload (the update chip in the top bar, and Settings → About), "last checked", "Check now"; `main.ts` starts it with `registerSW` |
| `src/lib/currentIncident.svelte.ts` | which incident the app is working in (id only, kept in `localStorage`), a change listener the inbox drains on, and the revision the switcher bumps when it closes or reopens the incident |
| `src/lib/router.svelte.ts` | hash routing: `#/journal` (also `#/`, no hash, and `#/send`, the old stand-in — there is no home page), `#/handover`, `#/queue`, `#/register`, `#/register/print`, `#/radio`, `#/settings`, `#/print`, `#/styleguide` (not in the navigation; linked from Settings → About) |
| `src/lib/elapsed.ts` | "12 s" / "3 min" / "1 h 5 min" for the top bar |
| `src/lib/persistence.svelte.ts` | `navigator.storage.persist()` on start and the usage estimate (P1-04): a refusal is the storage chip in the top bar until a journal folder is set |
| `src/lib/journalText.ts` | the words of a journal row (strip, batch counters, history line, times), shared by the timeline and the print view |
| `src/lib/file-system-access.d.ts` | the File System Access API members lib.dom lacks: the directory picker, `queryPermission` / `requestPermission` |
| `src/lib/storage.ts` | the only place that touches `localStorage` |
| `src/store/` | the journal in IndexedDB (`idb`): `journalStore.ts` is the one write path per object kind, validated with `ajv` against `contract/journal.schema.json` (`schema.ts`); `status.ts` derives a message's status; `dedupeKey.ts` hashes an incoming message; `register.ts` is the register's rules (key validation, ad hoc labels, the edit and its journal note); `outgoing.ts` the `#n` prefix, the 160-byte rule, composing a `message_out` with its reserved number (one, or one per recipient for send-to-all; with `refersTo` when it answers an incoming message) and the operator's manual status changes; `incoming.ts` the roger rules of the text protocol applied to a stored `message_in`; `incidents.ts` open / closed and the two status changes that move it, and whether an incident is a drill (P1-05: `drill: true`, fixed at creation; `outgoing.ts` puts `ØVELSE ` in front of every text of a drill, the export can be scoped to drills or real incidents and the drill file is named `-drill`); `drillMode.svelte.ts` follows the current incident so the band on every screen and the window title say ØVELSE while a drill is selected; `manual.ts` the entries the operator types in (note, correction, non-mesh incoming message); `journalView.ts` what the journal screen shows, derived from an incident's entries (the timeline newest first: one row per slip with the status strip on an outgoing message, its transitions folded into a history, the messages of one send-to-all as one row with counters; open items; last heard from); `export.ts` writes the export file; `mirrorFile.ts` the journal folder's files (P1-04: one append-only `.ndjson` per device, one line per write with its kind first, read back into an envelope; the export file written whole) and `mirror.svelte.ts` the mirror itself (listens to the store's writes, keeps the folder handle in `meta`, re-asks the permission after a restart, shows its state in the top bar, never blocks a write); `printView.ts` the print view's rows (the timeline's folding, oldest first, "since last print" by what changed in a row); `handoverView.ts` the handover screen's four lists (P1-08: open orders, given up, unanswered incoming, quiet radios, each oldest first, derived from the entries and the register) and `handover.ts` its writes (the handover note, the status request `#n Meld status`, "send by courier" on a given-up message); `registerCsv.ts` the register as a CSV file (P1-06: the import's parsing and rules, every fault an error naming the line, the export with `;`, BOM and CRLF) and `registerImport.ts` its write (one transaction for the entries and the pending rows — rows without a key, kept in `meta` until a key is bound — and the note in the current incident); `index.ts` is the app's store |
| `src/radio/` | the MeshCore companion: `serial.ts` is the protocol (constants, frame helpers, parsers, payload builders), `CompanionLink` (one command at a time over a frame transport, pushes to an inbox) and the Web Serial transport (a port given or chosen, kept for reopening); `ble.ts` the Web Bluetooth transport (the device kept for the session); `radioStore.svelte.ts` the app's view of the radio (state, self info, contacts, last heard, blind, push listeners, and P1-07: why it is disconnected, the reconnect loop with backoff over the kept transport, one granted USB port connected on start and on its `connect` event, the link check after a wake, the companion's clock drift); `capability.ts` which transports the browser has; `outbox.svelte.ts` sends a stored message through the radio (sent → delivered, resends with the same timestamp, given up), one at a time; `inbox.svelte.ts` drains what the radio received into the journal as `message_in` (sender by key prefix, unknown senders get a register entry, dedupe, then the roger rules); `sendQueue.svelte.ts` the send-to-all queue over the outbox (minimum gap between transmissions, paused while no radio is connected, batches keyed by the messages' `batchId`, pending messages queued again under their batch after a reload); `contactSource.ts` the `ContactSource` the register's key picker reads from; `deferred.ts` the one promise resolver the transports need; `web-apis.d.ts` the Web Serial / Bluetooth types; `index.ts` wires the app's instances |
| `src/test-support/` | fakes for tests: `localStorage`, a store on `fake-indexeddb`, the contract walkthrough, a frame transport and the companion frames it answers with, Web Serial (granted ports with real streams, plug events) and Web Bluetooth (a device, GATT server and the UART characteristics) so the real transports run in tests, an in-memory journal folder, the register CSV fixtures (built as strings so the BOM and CRLF are exact) |
| `src/components/` | the shell (P2-02): `TopBar.svelte` (the one 56 px bar: wordmark with the version in its tooltip, the incident, the status cluster, the navigation, the operator chip, the compact language select, the ? button), `IncidentSwitcher.svelte` (the incident chip with its open duration and the ØVELSE chip beside it in a drill, and the popover that picks, creates — with the "This is a drill" checkbox and drills under their own heading — closes or reopens, exports and prints), `StatusChips.svelte` (radio, clock, storage, update, each a chip that opens its popover; the clock popover carries the confirm checkbox), `Popover.svelte` (title, sentences, one action; Esc, a click outside or the chip closes it), `Toast.svelte` (the confirmation bottom left); the `?` overlay with the keyboard shortcuts as a popover-sized card, language select, and — on the components since P2-04 — the register form (`.field`s, the key with Pick from radio beside it; also binds a key to a row imported without one), the ad hoc batch form (a table of label and key per row), the register CSV import (file, summary, errors, the preview as a table with a chip per row, commit), the contact picker (a small card with a table of the radio's contacts, Pick per row), the send-to-all compose form (the recipients as a checklist table grouped by street with a checkbox per street, All / None, the text with the byte counter for the longest prefix on its meta line, Ctrl+Enter sends), and the journal screen's parts (P2-03): `SetupCard.svelte` (first run: name, clock confirm, radio connect, Start), `ComposeForm.svelte` (one line: transport, recipient, the text that grows as it is typed, Send; the byte counter on the meta line; "Replying to" as an inline message when a reply was started from a row, Esc drops it, Ctrl+Enter sends), `ManualEntryForm.svelte` (a note or a non-mesh incoming message, the other tab of the compose card), `Timeline.svelte` (the row list newest first — time, who with the direction glyph, body, strip of dot-chips — with the row actions as quiet buttons on hover and focus, the history as a 14 px list under an expanded row, corrections as 14 px lines, batch rows with counter chips, the "N new" chip stuck to the top of the box, Reply on every incoming row with the answer linked both ways), `OpenItemsPanel.svelte` and `LastHeardPanel.svelte` (the side cards, the count in the title) |
| `src/pages/` | one file per screen; `JournalPage.svelte` is the screen the staff live on (`#/journal`, and where `#/` lands; the compose card with its two tabs above the row list, which takes the rest of the viewport and scrolls inside, the two side cards at 320 px stacking under 60 rem, the setup card on first run — every route but settings and the style guide lands here until a name is set), `HandoverPage.svelte` (`#/handover`) the shift handover (P2-04: a slim card — incident, operator change, clock confirm, radio state, Print — over four row-list cards in a 2 × 2 grid that takes the viewport, each with its count in the title and its actions on the row; Reply opens the message form between them; printed in place), `QueuePage.svelte` the send-to-all queue they watch drain (P2-04: the compose card over the queue card, whose title carries the counter chips, the phase and the time to drain; the table takes the rest of the viewport; the compose card folds away once a batch is queued), `PrintPage.svelte` (`#/print`) the journal as a document for the browser's print dialog, `RegisterPage.svelte` the register (P2-04: a toolbar with the search field, the count and the buttons over the table in a scrolling box with a sticky header; add / edit / bind in a card that slides in at the right from 60 rem, inline under the toolbar below that; the ad hoc batch and the CSV import as cards under the toolbar; the rows not yet bound to a radio as a second table), `PrintRegisterPage.svelte` (`#/register/print`) the register as a printable list for the box, `RadioPage.svelte` (`#/radio`, reached from the radio chip and Settings → Radio: the state card with the transport buttons, the self info as a definition list and the clock drift as a message, the contacts table, the log as a monospaced row list newest first with Clear), `SettingsPage.svelte` (P2-04: one column of cards — Operator, Clock, Journal folder, Radio, Hub, Text & contrast, Language, About — a Save per card with typed values, the switches at once), `StyleGuidePage.svelte` (`#/styleguide`) every component of the design language in every variant and state with the colour pairs and their contrast ratios, for review |
| `scripts/make-icon.mjs` | writes `public/icon-192.png` and `icon-512.png` before `dev` and `build` |
| `scripts/check-contrast.mjs` | the WCAG contrast check over the colour tokens in `src/styles/tokens.css` (`contrast.mjs` is the pure part): text 7:1, UI chrome 3:1, in normal and high-contrast mode, plus the 16 px / 1.4 base; runs first in `npm run test` |

Every user-facing string goes through `t("key")`. A key in `en.json` that is missing from
`da.json` fails `npm run test`.

Every colour on screen is a token in `src/styles/tokens.css` (`--ink`, `--ink-2`,
`--surface`, the status pairs `--ok` / `--ok-bg`, …) and every size, space and radius too; a
component's `<style>` block only lays out and never writes a colour or a size of its own
(`docs/design.md`). The colour-literal test (`src/lib/colourLiterals.test.ts`) counts every
`#hex`, `rgb(` and `hsl(` outside the token sheet and fails on any once P2-05 turns it on.
A new text-on-surface pairing is added to `PAIRS` in `scripts/contrast.mjs`; the style guide
at `#/styleguide` prints the same list with the ratios on screen.

The contract schema is imported straight from `../contract/journal.schema.json`; the dev
server is allowed to serve one level above the project for that (`server.fs.allow` in
`vite.config.ts`).
