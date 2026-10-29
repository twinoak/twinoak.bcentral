# P1-04 — Export that cannot be forgotten

**Depends on:** P1-01.

## Goal

If the laptop dies, the staff still have the journal: a copy outside the browser that is at
most minutes old, a printable journal, and storage the browser will not evict.

## Scope

In:
- **Journal mirror to a folder (File System Access API).** Settings gets "Journal folder":
  `showDirectoryPicker()` once (a user gesture), the handle kept in IndexedDB (`meta`), and
  permission re-requested on start with one click if the browser dropped it. While a folder
  is set, every successful store write (incident, register entry, journal entry) appends to
  `bcentral-journal-<deviceId>.ndjson` in that folder — one JSON object per line, the same
  shapes as the export envelope's arrays, each line prefixed with its kind
  (`{"kind":"entry", ...}`). Append-only, never rewritten; a full `.json` envelope is also
  written on every export. Failures (folder gone, permission lost) are shown in the top bar,
  never silent, and never block the store write itself.
- **Print / human-readable export.** "Print journal" on the journal screen opens a print view
  of the current incident: one line per message with its status strip (P1-01's folding),
  batches as one block with counters, notes and corrections in place, newest first or oldest
  first by a toggle (print defaults to oldest first — a printed journal reads top-down), the
  incident name, device id, operator names and the print time in the header, page numbers.
  Browser `print()`; no PDF library. A "since last print" option prints only entries newer
  than the previous print's time (stored in `meta`) and is the routine button.
- **Persistent storage.** On start, `navigator.storage.persist()`; if it returns `false`, a
  top-bar line "Browser may clear this journal under storage pressure — set a journal folder"
  linking to settings. `navigator.storage.estimate()` shown under Settings → About.
- i18n for every new string, `da.json` complete.

Out: the hub; any cloud sync; encryption of the mirror file.

## Read first

`contract/journal.schema.json` (the envelope and shapes), `tasks/phase-1/reports/P1-01.md`
(the folding to reuse in print), `docs/brainstorm-2026-10-28.md` §6 (why).

## Acceptance

- With a fake directory handle (in tests, an in-memory implementation of the two handle
  methods used): each store write appends exactly one line; a failing handle does not fail
  the write and sets the error state; the `.ndjson` lines re-import into a fresh store
  identically to the `.json` export.
- Print view renders the walkthrough fixture in the expected folding; "since last print"
  excludes entries older than the stored time; the time moves only after a print.
- `persist()` result drives the top-bar line (fake `navigator.storage` in tests).
- Manual: set a real folder in Chrome, write entries, watch the file grow; kill the browser
  process; reopen; the file is intact and the app reconnects to the folder with one click.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- Whether the mirror should be one file per incident or one per device (lean: per device —
  one file to find in a crisis).
