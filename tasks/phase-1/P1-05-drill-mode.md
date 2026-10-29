# P1-05 — Drill mode (øvelse)

**Depends on:** P1-01.

## Goal

The association can rehearse with BCentral without polluting the real journal or confusing
anyone on a phone: a drill incident is marked everywhere, prefixes every message on the air
with `ØVELSE`, and is kept apart in lists and exports.

## Scope

In:
- `incident.drill` (already in the schema as proposed; this task makes it real — update the
  description from "Proposed, not decided" to a plain description in
  `contract/journal.schema.json`; that is the only contract change).
- Create incident: a "This is a drill" checkbox, off by default, immutable after creation.
- While a drill incident is current: a coloured band across the top of every screen ("ØVELSE /
  DRILL"), the incident name shown with the prefix, and the document title prefixed.
- Outgoing text: `composeText` prepends `ØVELSE ` before `#n ` for messages in a drill
  incident, on every transport; the byte counter includes it. The prefix is in the stored
  `text` (the journal shows exactly what went on the air). Incoming parsing is unchanged
  (`contract/text-protocol.md`: the prefix is for the humans reading their phones).
- Lists: the incident switcher groups drills under their own heading; the journal export
  file name carries `-drill`; the print header says DRILL; the register is shared (same
  radios), but "last heard from" counts drill traffic too — say so in the panel's tooltip
  (lean: count it, it is real radio contact).
- A real incident cannot be converted to a drill or back. Entries of a drill incident are
  never re-queued into a real one on start.
- i18n for every new string, `da.json` complete. The on-air prefix itself is **not**
  translated: it is `ØVELSE` in both languages, because the people reading it are Danish and
  the word must be identical everywhere.

Out: separate databases; drill-only register entries; any scheduling.

## Read first

`contract/text-protocol.md` (Drill mode section), `contract/journal.schema.json`
(`incident.drill`), `tasks/phase-1/reports/P1-01.md`.

## Acceptance

- A message in a drill incident is stored and transmitted as `ØVELSE #3 …`; the counter
  refuses at 160 bytes including the prefix; a real incident's message has no prefix.
- The drill band is present on every page while a drill incident is current and absent
  otherwise.
- Export of a drill incident validates against the schema with `drill: true`; the file name
  carries `-drill`.
- Re-queue on start skips drill incidents when the current incident is real, and vice versa.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
