# P0-07 — Journal screen

**Depends on:** P0-06.

## Goal

The screen the staff live on: the incident's journal in time order, with status and open
items visible without reading the log.

## Scope

In:
- Incident bar: current incident (name, opened at), switch incident, create incident (name,
  operator), close/reopen (a `status_change` on the incident).
- Timeline: all entries of the incident, newest at the bottom, auto-scroll unless the
  operator scrolled up. Each row: time (with a clock-trust mark when not `ntp`), operator,
  type, counterparty label, text, and for `message_out` the derived status as a chip.
  `status_change` and `correction` rows render under the entry they refer to, indented, not
  as separate top-level rows.
- Open items panel: per register entry, every `message_out` whose derived status is
  `pending`/`sent`/`delivered` (not yet roger, not given up), plus `given_up` ones flagged.
  Clicking one scrolls the timeline to it.
- "Last heard from" column on the register side panel: time since the latest `message_in`
  per entry; sorted oldest-contact first, so the quiet ones are on top.
- Manual entries from the screen: note; message out/in on a non-mesh transport (goes through
  P0-05's non-mesh path); manual status change on a `message_out` (sent / delivered / roger /
  given up — with a required reason text); correction of any entry (required text).
- Export button moves here from the placeholder.

Out: send-to-all (P0-08), any filtering beyond incident, search.

## Read first

`contract/journal.schema.json`, `docs/brainstorm-2026-10-28.md` §2 and §5 (what the screen is for:
a message desk, not a situation board).

## Acceptance

- Timeline renders the phase-0 walkthrough journal (build it in a test fixture) with correct
  nesting and status chips.
- Open items and last-heard-from are derived live: a new `status_change` → `roger` removes the
  item without reload.
- A correction never changes the original row's text; the correction shows under it.
- Danish and English complete for every new key.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
