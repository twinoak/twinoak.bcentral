# P2-02 — The shell and the notice system

**Depends on:** P2-01.

## Goal

One 56 px top bar carries everything that is global — incident, status cluster, navigation,
operator — and every band, banner and home page disappears. After this task the top of every
screen looks the same and says, in one glance, what needs the operator.

## Scope

In — exactly as "The shell" in `docs/design.md`:
- `TopBar.svelte` rebuilt: wordmark, incident chip-button (name, open duration; opens the
  switcher that `IncidentBar.svelte` provided — the bar component is removed), status
  cluster, nav with the underline, operator chip, compact language select.
- **Status cluster** as a component `StatusChips.svelte`: four chips (radio, clock, storage,
  update) with one `Popover.svelte` component: title, sentence, one action. The clock
  popover contains the confirm checkbox itself (no trip to settings). The update chip is
  hidden until an update waits. Storage chip hidden when persistent **and** a journal folder
  is set. States and texts from the existing stores (`radio`, `clock`, `storage`/`persist`,
  `updater`) — no new logic, only a new surface.
- **Removed**: `UpdateBanner.svelte`, `DrillBand.svelte`, `IncidentBar.svelte`, the two
  pill notices under the bar, `HomePage.svelte` (route `/#/` → journal; the first-run setup
  card lands on the journal in P2-03 — until then, the journal's existing "operator name
  required" message does).
- **Drill**: `[data-drill="true"]` on the root while a drill incident is current; the bar's
  background and text take the drill pair; a drill chip next to the incident with the
  on-air word; document title prefixed (existing). Everything else unchanged.
- **Toast** component for confirmations, wired to the three places that confirm today
  (settings saved, exported, printed) — remove their inline "Saved" texts.
- Keyboard: the `?` overlay (P1-09) restyled as a popover-sized card; `Esc` closes popovers.
- Colour literal count after this task reported.
- i18n: new keys for chip texts and popover sentences; the old banner keys removed from both
  files.

Out: page bodies (P2-03/04); print pages.

## Read first

`docs/design.md` §The shell, `tasks/phase-2/reports/P2-01.md`, `TopBar.svelte`,
`UpdateBanner.svelte`, `DrillBand.svelte`, `IncidentBar.svelte`, `HomePage.svelte`,
`lib/updates.svelte.ts`, `lib/clock.svelte.ts`, the storage/persist module from P1-04.

## Acceptance

- With fakes for the four stores: each chip shows the right state and tint; opening a chip
  shows its popover with the right sentence and action; the clock checkbox in the popover
  sets `manual`; `Esc` closes; only one popover is open at a time.
- No element with a band role exists below the bar; `HomePage` is gone; `/#/` renders the
  journal.
- Drill: root attribute set/unset with the current incident; the bar takes the drill pair.
- Snapshot of the bar at 1280 and 1440 px (in the screenshot script of P2-05 later; here a
  manual look).
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
