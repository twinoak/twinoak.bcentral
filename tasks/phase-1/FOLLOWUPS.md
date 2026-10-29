# Phase 1 follow-ups

Findings from review, one line each. Severity: blocker / fix-next / note.

- [ ] note (walkthrough 2026-10-29): incoming messages land in the currently viewed incident when several are open — a guess, not a rule. Held for the users: `docs/open-questions.md` §1. Until then, test with one incident open.
- [x] fix-next (fixed 2026-10-29): compose and manual-entry forms side by side; transport field before recipient; "Vælg en radio" → "Vælg en modtager"; transport label "Kanal" → "Via" ("Kanal" means channel messages in MeshCore).
- [x] fix-next (walkthrough 2026-10-29): a bare `?` after every time because the clock is unconfirmed — folded into P1-01 (one top-bar line, dimmed row mark, ✓ for manual). (fixed in P1-03: verified already done by P1-01 `8aeac57` — `TopBar` carries the one `topbar.clockUnconfirmed` line, `Timeline` shows the dimmed `?` / green `✓` mark; nothing to change.)
- [x] fix-next (fixed 2026-10-29): "Besked ud" → "Ny besked" / "New message".
- [x] fix-next (walkthrough 2026-10-29): no way to answer an incoming message from its row — written as P1-02. (fixed in P1-03: verified already done by P1-02 `dcb9557` — Reply on every incoming row, `refersTo` on the answer; nothing to change.)

## Review of P1-01 (2026-10-29)

Merged as `dd26f77`; reviewer re-ran the suite on main: 24 files, 334 tests, green.

- [x] note (fixed in review): `contract/text-protocol.md` said the batch id is not exchanged data; now points at `batchId`.
- [ ] note: journal texts the app writes itself (`attempt 2/3`, `no radio connected`, round-trip notes) are stored in the UI language. Decide before the hub merges journals from mixed-language devices: store English or a code. (P1-01 report)
- [ ] note: open-items panel is newest first per the task, so the most overdue item is at the bottom — ask the users; see `docs/open-questions.md` §2. (P1-01 report)
- [ ] note: a `status_change` whose message is not loaded is shown nowhere; only importable data can produce it. Revisit with the hub/merge path in phase 2. (P1-01 report)
- [ ] note: manual check pending — the "N new" pill while scrolled down, the strip walking live, the batch row draining, the top-bar clock line, on a real radio.
