# Runbook

How a task in `tasks/phase-N/` is carried out. The same text is the prompt for an unattended
Claude Code session and the checklist for a human doing it by hand.

## One task, one session, one branch

1. Read, in this order: `README.md`, `tasks/CONVENTIONS.md`, `contract/` (all files),
   `spec/ROADMAP.md`, then the task file itself. For a task that touches the radio layer, also
   the files it names in `../meshguide.dk/lib/` — a sibling checkout of
   github.com/twinoak/meshguide.dk next to this repo.
2. Check the task's **Depends on** list is merged on `main` (a commit whose subject starts
   with that task id). If not, stop and say so — never build against an unmerged working
   tree. In an unattended run this holds by construction: `run-all.ps1` merges each passed
   task into `main` before it starts the next, and refuses to start a task whose
   dependency is missing.
3. Branch from `main`: `task/P0-05-send-one` (the task id, then its slug).
4. Do only what the task's **Scope** says. Anything you notice that is out of scope goes into
   the report under *Follow-ups*, not into the code.
5. Satisfy every line of **Acceptance** and run every command under **Verify**. A task is not
   done while a verify command fails. An acceptance line that starts with **Manual:** needs
   a real radio and is the reviewer's step, not the session's: list it under *Open questions*
   in the report as "manual check pending" and carry on.
6. Write the report to `tasks/phase-N/reports/<task id>.md` (template below).
7. Commit on the task branch with a message that starts with the task id, e.g.
   `P0-05 send to one recipient`. Do not merge: in an unattended run `run-all.ps1` merges
   a passed task into `main`; otherwise the reviewer does. Leave the working tree clean.

## Review (the reviewer, per task)

- Read the report first, then the diff.
- Run **Verify** again, and do the **Manual:** acceptance lines with a real radio; write the
  result (board, firmware, timings) into the report under *Verify*.
- Anything found goes into `tasks/phase-N/FOLLOWUPS.md` as `- [ ] <task id>: <finding>`, with a
  severity: *blocker* (must fix before merge), *fix-next* (fix in the next task that touches it),
  *note*.
- Merge to `main` with a merge commit (keeps the task's commits readable).

## Unattended runs

`tasks/run-all.ps1 -Phase N` starts one headless Claude Code session per task file in
`tasks/phase-N/`, in file-name order, each with this runbook and the task file as its prompt.
Sessions run with `acceptEdits` plus `--allowedTools` for `npm`, `npx`, `node` and `git`, so
they can verify, branch and commit; nothing else is allowed. After a session exits 0 with a
report that is not a stop report, the script merges its `task/<id>-*` branch into `main`
and goes on; it stops at the first failure, stop report or missing dependency. Reports land
in `tasks/phase-N/reports/`. The reviewer then goes through the merged tasks one by one;
a bad merge is reverted, not amended.

## Report template

```markdown
# <task id> — <title>

## Done
What was built, in a few lines. Name the files.

## Decisions taken
Choices the task file left open and how they were decided, with the reason. Anything that
belongs in docs/decisions.md is flagged.

## Verify
The commands run and their result.

## Follow-ups
Out-of-scope findings, as `- [ ] <finding>` lines.

## Open questions
Anything a human has to answer before the next task.
```
