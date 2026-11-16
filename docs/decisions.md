# Decisions

Newest first. One line per decision, with the reason. Reversals get a new row, never an edit.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-16 | The staff can close an unconfirmed radio message with one click; it is recorded as `closed` (staff stopped waiting), never as `roger` | People forget to send `R`; the list must be clearable without faking a confirmation. |
| 2026-11-16 | `#n` numbering and the sent/delivered/confirmed chain exist only on MeshCore messages; a phone, courier or verbal message is a plain record, followed up with a point if needed | Marking a phone call sent/delivered/confirmed by hand describes nothing; the chain is the radio's receipt chain. Supersedes the 2026-10-28 "same chain, set by hand" rule. |
| 2026-11-16 | A register entry is a contact — a person the staff talk to — with an optional radio (`publicKey` + `origin`) and an optional `phone` | A caller without a radio must be recordable; a free-text name on the message would split one person into spellings and lose history. |
| 2026-11-16 | New entry type `point` (da *punkt*): a follow-up opened from any line, closed with a reason, reopenable; one per origin entry | The staff need a to-do list that comes out of the journal itself; the light answer to several things going on in one journal. |
| 2026-11-16 | No backward compatibility with earlier journals or schema versions until the first real deployment | Nobody uses the system yet; no migrations, no tolerance code for old shapes. |
| 2026-11-16 | Compose card: tab 1 "New record" (*Opret registrering*: note / incoming / outgoing by hand, non-radio transports only), tab 2 "MeshCore" (radio send only, no *Via* choice) | One job per tab; the same thing was possible from two places and neither name said what the tab was for. |
| 2026-11-16 | Phase 3 is workflow streamlining from use; the hub moves to phase 4 | Findings from real use first. |
| 2026-10-31 | Phase 2 is a design sprint on `docs/design.md`; the hub moves to phase 3 | After phase 1 every feature had added its own coloured band; the screens need one system before more features. |
| 2026-10-31 | Design language: a calm operations desk — Inter bundled, one accent (navy), colour only as status pairs, one 56 px bar with status chips and popovers instead of bands, no home page | Operators must see what needs them in one glance; nothing decorative; works in black and white. |
| 2026-10-31 | Base font size back to 16 px (large 18, largest 21); the setting is where readability lives | P1-09's 18 px default made every screen look oversized; the three-size setting stays. |
| 2026-10-29 | Delivery status is shown as metadata on the message row, never as journal lines; the store keeps `status_change` entries | A message form carries its own "sent at / acknowledged at" fields; four lines per message made the journal unreadable in the first walkthrough. Keeping the entries keeps immutability and merge-by-union. |
| 2026-10-29 | `pending` is implicit (a `message_out` without `sent`); no `pending` status change is written | One entry fewer per message, no information lost. |
| 2026-10-29 | Send-to-all messages carry a shared `batchId` (optional ULID on `message_out`) and render as one row | Grouping must survive a reload; the only contract change from the walkthrough. |
| 2026-10-29 | Lists are newest first | The staff look for what just happened. |
| 2026-10-29 | Phase 1 is "a solid PWA"; the hub moves to phase 2 | The hub is fair-weather functionality; the PWA is what must work when the power is out. |
| 2026-10-29 | `vite preview` serves at the Pages base like the build | Previewing the build at `/` loaded HTML as JS (walkthrough finding). |
| 2026-10-28 | App stack: Vite + Svelte 5 + TypeScript, `idb` for IndexedDB, `ulid`, `ajv` validating every write against the contract schema, plain JSON i18n with a tiny `t()`, `vite-plugin-pwa`, Vitest | Small, no promise plumbing, the schema as the law in practice, no i18n framework to fight. |
| 2026-10-28 | Radio layer ported from meshguide/automagical (`lib/serial.js`, `lib/ble.js`, the send/ack pattern in `lib/remote-cli.js`), extracted to its own package later | Proven code, same author, same licence; extract when it works here too. |
| 2026-10-28 | Work runs as phases of task files under `tasks/`, one unattended Claude Code session per task, reviewed per merge | Same pattern as meshmaster; one developer, many small verifiable steps. |
| 2026-10-28 | Licence: MIT | Open source, no strings. |
| 2026-10-28 | Hub in C#/ASP.NET Core, packaged in Docker | Matches meshmaster and existing hosting; Docker for easy deploy anywhere. |
| 2026-10-28 | Everything in English; the UI is translatable, Danish first | Open source project; the staff screens must be in Danish. |
| 2026-10-28 | No spike on the browser→radio link | Already proven in meshguide/automagical. |
| 2026-10-28 | Target device: laptops with Chrome/Edge, not iPads | Safari has neither Web Serial nor Web Bluetooth. |
| 2026-10-28 | No custom field app for v1; stock MeshCore app | One piece of software to maintain. The text protocol works with the stock app. |
| 2026-10-28 | All traffic is 1:1 direct messages; "send to all" is a queue over them | Staff control who gets what; direct messages carry delivery receipts; channels drown. |
| 2026-10-28 | Roger as an in-message text protocol (`#12` / `R12`) | Works today with the stock app; a custom app only adds a button later. |
| 2026-10-28 | Journal is append-only; ULIDs at creation; corrections are new entries | Offline creation on any device, deterministic merge, audit trail. |
| 2026-10-28 | Sync is up only (app → hub) for now; hub merges | Simplest thing that gives central insight; down-sync is an addition later. |
| 2026-10-28 | Internet platforms (Discord etc.) live in the hub, not the app | They only work with internet, and so does the hub. Keeps the app small. |
| 2026-10-28 | Scope: communication and its journal only; situation board, maps, plans stay on paper | Paper is the least fragile thing in the room. Everything BCentral does must have a paper equivalent. |
| 2026-10-28 | One monorepo (app, hub, contract, docs, deploy); the MeshCore web library extracted to its own repo later | One developer; contract changes land in app and hub in one commit. |
