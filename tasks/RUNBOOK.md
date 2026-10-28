# Runbook

How a task in `tasks/phase-N/` is carried out. The same text is the prompt for an unattended
Claude Code session and the checklist for a human doing it by hand.

## One task, one session, one branch

1. Read, in this order: `README.md`, `tasks/CONVENTIONS.md`, `contract/` (all files),
   `spec/ROADMAP.md`, then the task file itself. For a task that touches the radio layer, also
   the files it names in `../meshguide.dk/lib/` — a sibling checkout of
   github.com/twinoak/meshguide.dk next to this repo.
2. Check the task's **Depends on** list is merged on `main`. If not, stop and say so.
3. Branch from `main`: `task/P0-05-send-one` (the task id, then its slug).
4. Do only what the task's **Scope** says. Anything you notice that is out of scope goes into
   the report under *Follow-ups*, not into the code.
5. Satisfy every line of **Acceptance** and run every command under **Verify**. A task is not
   done while a verify command fails.
6. Write the report to `tasks/phase-N/reports/<task id>.md` (template below).
7. Commit with a message that starts with the task id, e.g. `P0-05 send to one recipient`.
   Do not merge. The merge is the reviewer's.

## Review (the reviewer, per task)

- Read the report first, then the diff.
- Run **Verify** again.
- Anything found goes into `tasks/phase-N/FOLLOWUPS.md` as `- [ ] <task id>: <finding>`, with a
  severity: *blocker* (must fix before merge), *fix-next* (fix in the next task that touches it),
  *note*.
- Merge to `main` with a merge commit (keeps the task's commits readable).

## Unattended runs

`tasks/run-all.ps1 -Phase N` starts one headless Claude Code session per task file in
`tasks/phase-N/`, in file-name order, each with this runbook and the task file as its prompt,
and stops at the first task whose verify step fails. Reports land in `tasks/phase-N/reports/`.
The reviewer then goes through them one by one.

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
