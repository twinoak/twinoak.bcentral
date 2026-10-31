# P2-01 — Tokens, typeface, components

**Depends on:** P1-09.

## Goal

The foundation every later task styles against: the token sheet, the bundled typeface, the
base styles and the component stylesheet from `docs/design.md`, plus a style-guide page that
shows every component — so the look is decided once, here, and the screens only apply it.

## Scope

In:
- `app/src/styles/tokens.css` — every token in `docs/design.md` (colour pairs, type scale,
  space, radius, shadow), light + `[data-contrast="high"]`, the three font-size roots
  (16/18/21). `app.css` keeps only the imports and resets. The contrast script is updated to
  the new token names and **must pass** at the document's thresholds; adjust hex values to
  pass, never the thresholds. Remove every token the document does not name once nothing
  references it.
- **Inter variable** bundled: `app/src/assets/fonts/InterVariable.woff2` + `LICENSE.txt`
  (SIL OFL 1.1), `@font-face` in `styles/base.css`, `font-display: block`, the feature
  settings and fallback stack from the document. The PWA precache includes the font (check
  `dist/sw.js` after build). No network font.
- `app/src/styles/base.css` — resets, root type, headings scale, links, focus ring, print
  base.
- `app/src/styles/components.css` — every component class in the document (`.btn*`,
  `.field`, `.chip*`, `.strip`, `.card`, `.tabs`, `.table`, `.rows`, `.popover`, `.toast`,
  `.msg*`, `.empty`), written once, with the states (hover, focus, disabled, selected).
- `app/src/lib/icons.ts` — the ≤ 16 inline SVG icons as string constants (or a tiny
  `<Icon name>` component), 20 px, 1.75 px stroke, `currentColor`, `aria-hidden` by default.
- **Style guide** page at `#/styleguide` (not in the nav; reachable by URL and from Settings →
  About): every component in every variant and state, the colour pairs with their contrast
  ratios printed, the type scale, the icons — the page the reviewer looks at first.
- A **test that fails on colour literals** (`#hex`, `rgb(`, `hsl(`) in any `.svelte` file or
  any CSS outside `tokens.css`. It will fail on the current code — that is expected; the
  task marks it `todo` with the count and P2-02..P2-05 bring the count to zero (each task
  states its remaining count; P2-05 turns the test on).
- Nothing else is restyled in this task: screens may look odd in between. Fine.

Out: any screen layout; the shell; removing banners.

## Read first

`docs/design.md` (all of it), `app/src/app.css`, `app/scripts/check-contrast.mjs`,
`tasks/phase-1/reports/P1-09.md` (what it introduced and why).

## Acceptance

- `npm run test` passes with the contrast check on the new tokens; the literal check exists
  and reports its count.
- `dist/sw.js` precaches the font file; the built app renders in Inter with no network (check
  the request log in DevTools — no font request leaves the page).
- `#/styleguide` renders every component and variant listed in the document with no
  component-local colour or size.
- `npm run check`, `lint`, `test`, `build` green.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- `<Icon>` component versus string constants in markup (lean: component, so size and
  `aria-hidden` are one place).
