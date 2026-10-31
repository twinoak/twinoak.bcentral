# P2-05 — Print, the literal check, and the screenshot audit

**Depends on:** P2-04.

## Goal

The sprint ends with proof: print pages on the tokens, the colour-literal test turned on at
zero, and a set of screenshots of every screen that the reviewer (and the next task writer)
can look at without running the app.

## Scope

In:
- **Print pages** (`PrintPage`, `PrintRegisterPage`, the handover print): the tokens, 12 pt
  body, black on white, status words instead of chips, page header/footer as before.
- **Colour-literal test** switched from `todo` to on; count must be 0 everywhere except
  `tokens.css`.
- **Screenshot script** `app/scripts/screenshots.mjs` (Playwright, already installed in the
  dev environment — do not add it as a dependency if `require('playwright')` resolves;
  otherwise add it as a devDependency): builds, serves `dist/` locally, seeds the store with
  `contract/examples/walkthrough.json` plus a 25-recipient batch and a drill incident through
  a test hook (`window.__bcentral.seed(envelope)` exposed only when `?seed` is in the URL),
  and captures every route — journal (normal and drill), handover, send to all (queue
  draining), register (with the add card open), radio (disconnected), settings, styleguide,
  the three print pages — at 1280×720 and 1440×900, normal font, plus journal at largest
  font and in high contrast. PNGs to `tasks/phase-2/reports/screens/<route>-<size>.png`,
  committed. `npm run screenshots` runs it; not part of `npm run test`.
- **Audit**: the session looks at its own screenshots against `docs/design.md` §Forbidden
  and §Components and lists every deviation it finds in the report (and fixes the ones under
  an hour). The reviewer does the same with fresh eyes.
- `docs/design.md`: a short "As built" section at the end with anything that deviated from
  the document and why.

Out: new features; the hub.

## Read first

`docs/design.md`, all P2 reports, `PrintPage.svelte`, `PrintRegisterPage.svelte`, the
handover print path, `app/scripts/`.

## Acceptance

- `npm run test` green with the literal check on.
- `npm run screenshots` produces the full set; every PNG is committed; the report embeds
  them (relative links) with one line each.
- Print preview of the walkthrough journal fits A4 with readable 12 pt body.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build && npm run screenshots
```
