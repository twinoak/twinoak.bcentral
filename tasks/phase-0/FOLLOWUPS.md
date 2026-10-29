# Phase 0 follow-ups

Findings from review, one line each. Severity: blocker / fix-next / note.

## Review 2026-10-29 (after the first unattended run)

Outcome of the run: P0-01 done and committed (`a4f9afe Scaffold`). P0-02 to P0-05 written but
never compiled, tested, branched or committed — `--permission-mode acceptEdits` refused every
`npm`, `node` and `git` command. P0-06 to P0-09 stopped at runbook step 2 (dependency not on
`main`) and built nothing. So phase 0 is about half done, and the half that exists had not
been run once.

Verified by the reviewer on the working tree, 2026-10-29, after `npm install`:
`check` 0 errors / 7 warnings, `lint` clean, `test` 212/212, `build` ok — with the four fixes
below applied first.

- [x] blocker (fixed in review): `app/src/pages/RadioPage.svelte` declared `const state = $derived(...)`,
      which made Svelte read `$state(false)` as the store-subscription of that variable.
      Renamed to `radioState`. (P0-04)
- [x] blocker (fixed in review): `app/src/radio/serial.test.ts` `let rest = new Uint8Array(0)` typed as
      `Uint8Array<ArrayBuffer>` and refused `extractFrames().rest`. Annotated `Uint8Array`. (P0-04)
- [x] blocker (fixed in review): `svelte/prefer-svelte-reactivity` fired on non-reactive `Set`/`Date`
      internals in `.svelte.ts` modules (6 errors). Rule turned off in `eslint.config.js` with
      the reason; reactive state is declared with `$state` explicitly. (P0-04, P0-05)
- [x] blocker (fixed in review): `src/conventions.test.ts` first ESLint call takes ~30 s cold on a slow
      disk and hit Vitest's 5 s default. `describe` timeout raised to 120 s. (P0-01)
- [x] blocker (fixed in review): `app/package-lock.json` was behind `package.json` (`ajv-formats`,
      `fake-indexeddb` missing), so `npm ci` would fail in Actions. Regenerated; commit it
      with P0-02. (P0-02)
- [x] blocker (done 2026-10-29): commit P0-02 to P0-05 on `main` in task order, messages starting with the task
      id, so the dependency check in `run-all.ps1` finds them. Each report's *Done* section
      names its files.
- [x] blocker (done 2026-10-29): P0-01's commit is named `Scaffold`; the dependency check looks for `P0-01` in a
      subject. Either `git commit --allow-empty -m "P0-01 scaffold (see a4f9afe)"` or run with
      `-SkipDependencyCheck` once.
- [x] fix-next (fixed in review): `run-all.ps1` ran sessions with `acceptEdits`, which blocks every
      shell command, and skipped any task that had a report, so a stop report counted as done.
      Now: `--allowedTools` for `npm`/`npx`/`node`/`git`, dependency check against `main`
      before each session, merge of the task branch into `main` after a passed session, no
      report-based skipping.
- [x] fix-next (fixed in review): `RUNBOOK.md` step 2 said "stop" without saying what an unattended
      session does when the dependency is only in the working tree — four sessions proceeded,
      four stopped. Now explicit: in an unattended run the dependency is on `main` because the
      script merged it; a session never builds against an unmerged working tree.
- [x] fix-next: `register.picker.placeholder` key and `contactSourceIsPlaceholder` flag are dead
      since P0-04 delivered the real `ContactSource` (P0-04 report). Remove in P0-07.
      (fixed in P1-03: already gone — P0-07 `fee5041` removed both; neither string is in
      `app/src` today, nothing to do.)
- [x] fix-next: `pages/SendPage.svelte` is a stand-in; P0-05 asked P0-07 to absorb the compose
      form and the incident row into the journal screen and delete the page.
      (fixed in P1-03: already gone — P0-07 `fee5041` deleted the page; `ComposeForm` sits in
      `JournalPage` and nothing references `SendPage`.)
- [x] fix-next: `recordManualStatus` refuses `mesh` messages, but P0-07 needs a manual
      `given_up` with a reason on a mesh message stuck at `sent` after a reload (P0-05 and
      P0-07 reports). Reconcile in P0-07: allow manual `given_up` and `roger` on mesh with a
      required reason; keep `sent`/`delivered` radio-only.
      (fixed in P1-03: already done by P0-07 `fee5041` — `MESH_MANUAL_STATUSES` = roger,
      given_up; the reason is required and stored as the status change's `text`; the Timeline
      offers exactly those two on a mesh row. P1-03 added the missing test for the refused
      empty-reason case on mesh, `outgoing.test.ts`.)
- [x] fix-next: a recipient whose `given_up` comes from "no radio connected" would give up 25
      times at the gap rate in send-to-all (P0-08 report). P0-08 should pause the queue while
      `radio.state` is `disconnected`.
      (fixed in P1-03: already done by P0-08 `9a29108` — `sendQueue` has a `paused` phase
      while `radioState()` is `disconnected`/`connecting`, resumes on `onConnected`, the queue
      screen says `queue.paused`; tested in `sendQueue.test.ts` with a fake transport toggled
      disconnected → connected → disconnected → connected.)
- [x] note: 7 `state_referenced_locally` warnings in `components/RegisterForm.svelte` — the form
      captures `entry` once on open, which is the intended behaviour for an edit form; silence
      with `$state.snapshot`/untrack or accept.
      (fixed in P1-03: one `untrack(() => entry)` snapshot on open seeds the drafts; `npm run
      check` is at 0 warnings.)
- [ ] note: `docs/decisions.md` candidates from the reports, to add when P0-02..05 are merged:
      `ajv` + `ajv-formats` for schema validation at write time; the ported radio code is `.ts`
      (not `.js` + `.d.ts`); the companion log is a string log (`onLog`) kept for the later
      package extraction.
- [ ] note: no task touched `contract/`; `store/schema.ts` imports the schema file directly
      (no copy). Good — keep it that way.
- [ ] note: the manual acceptance lines of P0-04 and P0-05 (real radio over USB and BLE, real
      phone, `#1` arrives, `delivered`, round-trip time) are still pending the reviewer.

## Rerun

After the two open blockers: `.\tasks\run-all.ps1 -Phase 0 -From P0-06`. The stop reports for
P0-06 to P0-09 are overwritten by the rerun.
