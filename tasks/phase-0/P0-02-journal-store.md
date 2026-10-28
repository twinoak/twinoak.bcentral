# P0-02 — Journal store and export

**Depends on:** P0-01.

## Goal

The data layer: incidents, register entries and journal entries in IndexedDB, exactly as
`contract/journal.schema.json` defines them, with an export that validates.

## Scope

In:
- `app/src/store/` with `idb`. Object stores: `incidents`, `register`, `entries`, and a
  `meta` store for the device's own running counters (device sequence, per-recipient `seqNo`
  counters). Indexes on `entries`: by `incidentId`, by `counterpartyId`, by `refersTo`, by
  `dedupeKey`.
- A single `appendEntry(entry)` path and single `putIncident` / `putRegisterEntry` paths.
  `appendEntry` assigns `id` (ULID), `deviceId`, `deviceSeq` (gap-free, from `meta`) and
  `timestamp` + `clockTrust` (see below), validates with `ajv` against the contract schema,
  and stores. Validation failure throws and stores nothing. There is no update or delete for
  entries.
- Clock trust: a `clock` module that reports `ntp` when the app has confirmed its clock
  against a trusted source during this session (for phase 0: never — leave the hook),
  `manual` when the operator has set/confirmed the time in settings this session, else
  `unknown`. A settings control "the clock on this PC is correct" that sets `manual`.
- Derived status: `statusOf(messageOutId)` = `newStatus` of the latest `status_change`
  referring to it by `timestamp` then `deviceSeq`, or `pending` when none. Pure function over
  entries, tested.
- Dedupe: `appendEntry` for a `message_in` whose `dedupeKey` already exists returns the
  existing entry and stores nothing. `dedupeKey` computed by a tested helper per the schema
  description.
- Export: builds the schema's envelope (`format`, `version`, `deviceId`, `exportedAt`, the
  three arrays), validates it, downloads it as `bcentral-journal-<deviceId>-<timestamp>.json`.
- A "journal" placeholder screen with only the export button, so the feature is reachable.

Out: any real UI for entries, the register screen, the radio.

## Read first

`contract/journal.schema.json`, `contract/text-protocol.md` (status chain), `tasks/CONVENTIONS.md`.

## Acceptance

- `contract/examples/walkthrough.json` round-trips: import into a fresh store (an
  `importEnvelope` used only by tests for now) → export → validates with `ajv` → identical
  entries. Its dedupe keys were computed by the schema's rule; the helper must reproduce them.
- `deviceSeq` is gap-free across 1,000 appends, including across a simulated restart (new
  store instance, same database).
- An entry failing validation is not in the store afterwards.
- A second `message_in` with the same `dedupeKey` does not create a second entry.
- `statusOf` follows the latest `status_change`, tested for the chain in the contract
  including `given_up` → `sent` on retry.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- Whether `meta` counters are also written as entries for auditability (lean no; counters
  are reconstructible from entries).
