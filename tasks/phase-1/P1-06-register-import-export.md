# P1-06 — Register import and export (CSV)

**Depends on:** P1-01.

## Goal

The association's resident list goes into the register in one step, and the register comes
back out as a file that can be printed and kept in the box.

## Scope

In:
- **Import CSV** on the register screen. Columns, matched by header name, case-insensitive,
  in any order: `label` (required), `person`, `street`, `role`, `origin`
  (`issued`/`adhoc`/`private`, default `issued`), `publicKey`, `notes`. The schema requires a key,
  so a row without one is imported as a *pending* register row kept in `meta` until a key is
  bound from the contact list or typed; the register screen lists pending rows under "Not yet
  bound to a radio". Separator `;` or `,` auto-detected from the header line; UTF-8 with or without
  BOM; CRLF or LF. Nothing fuzzy: an unknown header is an error naming it, a bad key is an
  error naming the row, a duplicate key within the file or against the store is an error
  naming both. Preview table before commit: N to add, M pending, errors listed; nothing is
  written while there is an error.
- **Export CSV** with the same columns, `;` separator, UTF-8 BOM (opens in Danish Excel
  without a dialog), one row per register entry, pending rows included with an empty key.
- **Print register**: a printable list (label, person, street, role, key prefix) for the box.
- Every import appends one `note` to the current incident, if one is open: "register: imported
  N entries from ‹file name›".
- i18n for every new string, `da.json` complete.

Out: Excel files; any matching of names to radios heard on the air; editing in the preview.

## Read first

`contract/journal.schema.json` (`registerEntry`), `tasks/phase-0/reports/P0-03.md` (what the
register screen is built from), `tasks/CONVENTIONS.md` (nothing fuzzy).

## Acceptance

- Fixtures: a `;` file with BOM and CRLF, a `,` file without, a file with an unknown header,
  a file with a duplicate key, a file with rows missing keys — each behaves as specified, with
  tests.
- Import → export → import round-trips to identical entries.
- A pending row, once bound, becomes a normal register entry and leaves the pending list.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
