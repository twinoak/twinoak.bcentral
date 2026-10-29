# Conventions

Short, because they are read before every task.

## Code

- TypeScript everywhere in `app/`; the ported radio files may stay `.js` until a task says
  otherwise, with a `.d.ts` beside them.
- Plain linear `async`/`await`. No `new Promise` wrappers, no `Promise.all`, no callback
  pyramids. A loop that awaits is fine.
- Nothing fuzzy. No heuristics, no "probably", no similarity matching. If a rule is not in
  `contract/`, it is not a rule; propose it in the report instead.
- Every write to the journal store is validated against `contract/journal.schema.json` with
  `ajv` before it is stored. A failed validation throws; it never stores a "best effort".
- Entries are immutable once stored. There is no update path for an entry. Status is derived.
- Comments and identifiers in English. User-facing strings only through `t("key")` with
  `en.json` as the reference and `da.json` complete for every key (a missing Danish key is a
  failing test).
- Names: the words from the contract — `incident`, `registerEntry`, `journalEntry`,
  `seqNo`, `dedupeKey`, `clockTrust`. Not synonyms.
- Dependencies: only what the stack decision lists plus what a task file names. Adding one
  is a decision for the report.

## Tests

- Vitest. The text protocol rules in `contract/text-protocol.md` each get a test, including
  the counter-examples listed there.
- Store logic is tested against a fake IndexedDB (`fake-indexeddb`), not mocked away.
- The radio layer is tested at the frame level (bytes in, parsed objects out) with the
  fixtures the ported code already implies; no hardware in CI.

## Repo

- Branch per task. Only the implementation commit starts with the task id (`P1-01 status as
  metadata`), and its merge is `Merge task/P1-01-…`; `run-all.ps1` reads those two shapes as
  "done". A commit that writes or edits task files, roadmap or follow-ups says `tasks: …`
  and never starts with an id.
- `contract/` is changed only when a task says so, and the change is named in the report.
- Reports and follow-ups are part of the repo; they are not cleaned up.
- No files outside `app/`, `tasks/`, `spec/` and `docs/` in phase 0, except P0-09's
  `.github/workflows/` and its note in `deploy/README.md`.
