# P1-02 — Reply from the row

**Depends on:** P1-01.

## Goal

Answering an incoming message is one click: a **Reply** button on every `message_in` row
opens "New message" with the right recipient and transport already set, the cursor in the
text, and the outgoing message linked to the one it answers.

## Why

Walkthrough 2026-10-29: to answer Hans, the operator had to scroll to "New message" and find
Hans in the recipient list. Replying is the most frequent action on the screen; it must not
involve a search.

## Scope

In:
- A **Reply** button on each `message_in` row in the timeline (and on the recipient rows of an
  expanded batch when they are incoming replies). Clicking it: sets the compose form's
  recipient to the row's `counterpartyId`, transport to the row's transport (a courier note is
  answered by courier unless the operator changes it), focuses the text field, scrolls the
  form into view, and shows a small "Replying to: ‹first 60 chars of the incoming text›" line
  with a ✕ to drop the link.
- The outgoing `message_out` carries `refersTo` = the incoming entry's id (already allowed by
  the schema; no contract change). The timeline shows a reply with a "↳ answers ‹time›"
  mark that scrolls to the incoming row when clicked; the incoming row shows "answered
  ‹time›" once a reply exists (derived from entries with `refersTo` pointing at it).
- Keyboard: `R` on a focused incoming row = Reply; `Esc` in the compose form drops the
  reply link; `Ctrl+Enter` sends.
- The open-items panel gets the same **Reply** affordance on incoming rows it lists, if any.
- i18n for every new string, `da.json` complete.

Out: quick-reply templates; replying from the register panel; anything about channels.

## Read first

`tasks/phase-1/reports/P1-01.md` (how the timeline and compose form look after P1-01),
`contract/journal.schema.json` (`refersTo`), `tasks/CONVENTIONS.md`.

## Acceptance

- With the walkthrough fixture: Reply on the free-text row prefills Hans + mesh and focuses the
  text; sending stores a `message_out` with `refersTo` = that row's id and the next `seqNo`
  for Hans; the timeline shows the link both ways.
- Reply on a courier `message_in` prefills transport `courier`.
- ✕ drops the link: the sent message has no `refersTo`.
- `R`, `Esc`, `Ctrl+Enter` work as specified; nothing else on the page reacts to them.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
