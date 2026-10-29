# P1-03 — Walkthrough fixes

**Depends on:** P1-02.

## Goal

Every unchecked `fix-next` line in `tasks/phase-0/FOLLOWUPS.md` and `tasks/phase-1/FOLLOWUPS.md`
is either fixed or shown to be already fixed, so phase 1 does not carry phase-0 debt.

## Scope

In — work through these, in this order, verifying each is still open before touching code
(some may have been absorbed by P0-07, P0-08 or P1-01):

1. `register.picker.placeholder` key and `contactSourceIsPlaceholder` flag: remove if dead.
2. `pages/SendPage.svelte` (if it still exists) and anything else P0-05 left as a stand-in:
   remove; the journal screen owns compose.
3. `recordManualStatus` versus mesh messages: allow a manual `given_up` and a manual `roger`
   on a `mesh` message, each with a required reason stored in the status change's `text`;
   keep `sent` and `delivered` radio-only for mesh. Tests for the allowed and refused cases.
4. Send-to-all with no radio connected: the queue pauses while `radio.state` is
   `disconnected` instead of giving up every recipient at the gap rate; the queue screen says
   "paused — no radio"; sending resumes by itself when the radio connects. Test with a fake
   link toggling state.
5. `RegisterForm.svelte` `state_referenced_locally` warnings (7): silence them in the Svelte 5
   way (`untrack` or an explicit snapshot on open) so `npm run check` reports 0 warnings.
6. Any `fix-next` line added to either FOLLOWUPS file after this task was written: fix it too,
   and say so in the report.

Tick each handled line in the FOLLOWUPS file (`- [x] … (fixed in P1-03)`), with one line on
what was done or why it was already fixed.

Out: anything marked `note`, anything in `docs/open-questions.md` (those wait for the users),
new features.

## Read first

Both FOLLOWUPS files, `tasks/phase-1/reports/P1-01.md` and `P1-02.md` (what changed since the
lines were written), `contract/text-protocol.md` (status chain).

## Acceptance

- Every `fix-next` line in both FOLLOWUPS files is ticked with a reason.
- `npm run check` reports 0 errors **and 0 warnings**.
- Tests for items 3 and 4 as described.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
