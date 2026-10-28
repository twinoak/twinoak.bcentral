# P0-01 — Scaffold, PWA, i18n, settings

**Depends on:** nothing.

## Goal

An installable PWA under `app/` that opens with no network, speaks English and Danish, and
has a settings page. No journal, no radio yet.

## Scope

In:
- `app/` as a Vite + Svelte 5 + TypeScript project. `npm run dev`, `npm run build`,
  `npm run test`, `npm run check` (svelte-check) all work.
- `vite-plugin-pwa` with a service worker that precaches the whole build, so the installed
  app opens offline. Manifest with name "BCentral", a plain generated icon (no logo work).
- i18n: `app/src/i18n/en.json` and `da.json`, a `t(key, params?)` function, a language
  switch in settings persisted in `localStorage`, default language from the browser with
  Danish as fallback. A test that fails when `da.json` lacks a key present in `en.json`.
- Settings page: operator name (required before anything else can be done), device id
  (a ULID generated once and stored; shown read-only), hub URL (stored, unused for now),
  "blind after N minutes" (default 15, unused for now), language.
- A top bar with: app name, operator name, placeholder radio status, language.
- Vitest configured. ESLint + Prettier with the conventions (no `Promise.all`, no
  `new Promise` — an ESLint rule for each).

Out: anything about incidents, the journal, the register, the radio, the hub.

## Read first

`tasks/CONVENTIONS.md`, `spec/ROADMAP.md` (phase 0 table).

## Acceptance

- `npm run build` produces a `dist/` that, served statically, installs as a PWA in Chrome
  and opens after the network is disabled and the tab is reloaded.
- All UI strings go through `t()`; grep for a hard-coded Danish or English sentence in a
  `.svelte` file finds nothing but keys.
- Settings persist across a browser restart.
- `npm run test` passes, including the i18n completeness test.
- ESLint fails on a file containing `Promise.all(` or `new Promise(`.

## Verify

```
cd app && npm ci && npm run check && npm run lint && npm run test && npm run build
```

## Left open (decide and report)

- Router: none, hash-based, or a small library. Prefer none or hash; the app has four screens.
- How the generated icon is made (a script in `app/scripts/` is fine).
