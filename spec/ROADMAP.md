# Roadmap

Phases are cut so that each one ends with something a staff can use in a drill. A phase is
done when its last task is merged and the walkthrough at the bottom of the phase passes on a
real radio.

## Phase 0 — walking skeleton

One staff PC, one companion radio, one incident. Everything the text protocol and the journal
need, nothing else. No hub.

| Task | Delivers | Depends on |
| --- | --- | --- |
| P0-01 | Vite + Svelte 5 + TypeScript scaffold; PWA that installs and opens offline; i18n (`en`, `da`); settings page (operator name, device id, hub URL placeholder) | — |
| P0-02 | Journal store in IndexedDB: incidents, register, entries; ULIDs, device sequence, clock trust; every write validated against `contract/journal.schema.json`; export to a `.json` file in the schema's envelope | P0-01 |
| P0-03 | Register screen: add/edit entries, origin, label, binding to a public key picked from the radio's contact list or typed | P0-02 |
| P0-04 | Radio layer: `CompanionLink`, Web Serial and Web Bluetooth transports ported from meshguide; connect/disconnect, self info, contact list, time sync; "blind" indicator when nothing has been heard for a configurable time | P0-01 |
| P0-05 | Send to one recipient: `#n` assignment per recipient per device, `CMD_SEND_TXT_MSG`, `RESP_CODE_SENT` → `sent`, `PUSH_CODE_SEND_CONFIRMED` → `delivered`, retries with the same timestamp, `given_up`; all as `status_change` entries | P0-02, P0-03, P0-04 |
| P0-06 | Receive: `PUSH_CODE_MSG_WAITING` → drain `CMD_SYNC_NEXT_MESSAGE`; `message_in` entries with dedupe key; roger rules exactly per `contract/text-protocol.md`, with unit tests for every rule and counter-example in that document | P0-05 |
| P0-07 | Journal screen: pick/create incident, timeline of entries, derived status per outgoing message, open items per recipient, "last heard from" per register entry, manual entries (note, non-mesh message, manual status change, correction) | P0-06 |
| P0-08 | Send to all: pick recipients, one `message_out` each, a queue screen with per-recipient status, rate limiting with a visible countdown, retry/give-up from the queue | P0-07 |
| P0-09 | Deploy: GitHub Actions build to GitHub Pages; version and build date shown in the UI; "last updated" of the installed PWA | P0-08 |

**Phase 0 walkthrough** (the acceptance test, on a real radio, no internet):

1. Install the PWA, disconnect from the network, close and reopen the browser: it opens.
2. Create an incident. Add two register entries bound to two real radios.
3. Send `#1` to one of them. See `sent`, then `delivered`. On the phone, reply `R1`. See `roger`.
4. Reply from the phone with free text. See it in the journal under that radio, unparsed.
5. Send to all. Watch the queue drain with a countdown; see each recipient's own `#n`.
6. Add a note, a courier message, and mark it delivered by hand.
7. Close the browser, reopen: everything is there. Export: the file validates against the schema.
8. Unplug the radio: the app says it is blind.

## Phase 1 — the hub

Self-hosted C#/ASP.NET Core in Docker. Receives journal envelopes from any number of apps,
merges by ULID union, dedupes `message_in` by key, shows a read-only merged journal. Sync is
up only, paused offline, resumed when online, with the app showing when it last synced.
Discord bridge as the first internet-side platform. Written in `contract/sync-api.openapi.yaml`
before any code.

## Phase 2 — hardening for a real drill

Drill mode if adopted, "print journal since last time", File System Access API journal mirror
to a local folder, the "prepare radio for BCentral" page (in meshguide), and whatever the
first real drill with the association turns up.

## Not planned

A custom field app, a situation board, maps, action cards, resource tracking. See the scope
rule in `README.md`.
