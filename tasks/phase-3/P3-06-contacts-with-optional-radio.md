# P3-06 — The register is a contact list; a radio is optional

**Depends on:** P3-05.

## Goal

A register entry is a person the staff talk to. Some have a radio; some are reached by phone,
courier or in person. An incoming phone call from someone without a radio can be recorded
against that person, and the MeshCore tab offers only the people who can be reached by radio.

## Why

Found in use (2026-11-16): every message needs a counterparty, every counterparty needed a
public key, so a caller without a radio could not be recorded at all.

## Contract

Done 2026-11-16 in `contract/journal.schema.json`: `registerEntry.publicKey` is optional
(still 64 hex, still unique when present), `origin` is allowed only with a `publicKey` and
required when there is one, and `phone` (free text) is new. The description now says
"a contact". No backward compatibility is needed (decided 2026-11-16).

## Scope

In:
- **Store** (`store/register.ts`, `journalStore.ts`): uniqueness of `publicKey` only among
  entries that have one; `phone` stored as typed; the rule "an entry with a key must have an
  origin" enforced on write (the schema does; the form must not be able to produce the
  invalid shape).
- **Register screen**: the form has Label, Person, Street, Role, Phone, Notes, and a
  "Radio" section — public key (typed or picked from the contact list) and Origin, the
  latter enabled only when a key is present. Table columns: label, person, street, role,
  phone, radio (a glyph + key prefix, or "—"), last heard. A filter "Has radio / No radio /
  All" in the toolbar.
- **Pending rows from P1-06 are removed as a concept**: a CSV row without a key is simply
  an entry without a radio. Delete the `meta` pending store, the "Not yet bound to a radio"
  table, and the binding flow; the import preview shows "n with radio, m without". The CSV
  gains a `phone` column; `origin` is read only when `publicKey` is present and reported
  as an error otherwise.
- **Unknown mesh sender** (P0-06): unchanged — creates an entry *with* the key and origin
  `private`.
- **MeshCore tab** (P3-01): recipient list = entries with a `publicKey`, nothing else.
  **New record tab**: all entries. **Reply** (P3-01 routing): unchanged.
- **Send to all** (hidden page, keep working): recipients = entries with a key; "by street"
  grouping skips entries without one.
- **Last heard from**: unchanged; a phone call counts (as built in P0-07).
- **Handover "Send status request"**: only for entries with a key; "quiet radios" lists only
  entries with a key (a person without a radio cannot be quiet on the radio).
- Register print and CSV export carry `phone` and show the radio column as above.
- Tests: an entry without a key validates and can be a counterparty on a phone `message_in`;
  an entry with a key and no origin is refused at the form and at the store; the MeshCore
  recipient list excludes keyless entries; CSV round-trip with mixed rows; the removed
  pending flow has no remaining references (grep in a test).
- i18n for every new or changed string, `da.json` complete.

Out: merging two entries into one; a contact's address beyond `street`.

## Read first

`contract/journal.schema.json` (`registerEntry`), `store/register.ts`, `registerCsv.ts`,
`registerImport.ts`, `RegisterPage.svelte`, `RegisterForm.svelte`, `RegisterImport.svelte`,
`ComposeForm.svelte`, `ManualEntryForm.svelte`, `BatchComposeForm.svelte`,
`store/handoverView.ts`, `tasks/phase-1/reports/P1-06.md`, `tasks/phase-3/reports/P3-01.md`.

## Acceptance

- Create "Grethe, Nørregade 12, phone 12 34 56 78" with no radio; record an incoming phone
  message from her on the New record tab; she is absent from the MeshCore recipient list and
  present in the New record counterparty list; "last heard from" shows her call.
- Give Grethe a radio later (edit, paste key, pick origin): she appears on the MeshCore tab.
- Import a CSV with two rows with keys and one without: three entries, none pending; a row
  with `origin` but no key is an error naming the line.
- `npm run check`, `lint`, `test`, `build` green; register screenshots refreshed.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
