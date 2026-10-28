# Decisions

Newest first. One line per decision, with the reason. Reversals get a new row, never an edit.

| Date | Decision | Why |
| --- | --- | --- |
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
