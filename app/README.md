# app

The staff's browser app. Offline-first PWA in TypeScript: talks to a MeshCore companion radio
over Web Serial / Web Bluetooth, keeps the journal in IndexedDB, exports with one click, and
syncs to a hub when internet is available.

Requires a Chromium browser (Chrome, Edge).

## Run

```
npm ci
npm run dev        # dev server
npm run build      # production build in dist/ (precached by the service worker)
npm run preview    # serve dist/ locally to test install and offline
npm run check      # svelte-check
npm run lint       # eslint, including the no-Promise.all / no-new-Promise rules
npm run format     # prettier --write
npm run test       # vitest
```

## Layout

| Path | Holds |
| --- | --- |
| `src/i18n/` | `en.json` (reference), `da.json`, and `t()` in `index.svelte.ts` |
| `src/lib/settings.svelte.ts` | operator name, device id (ULID, minted once), hub URL, blind-after minutes |
| `src/lib/router.svelte.ts` | hash routing: `#/` home, `#/settings` |
| `src/lib/storage.ts` | the only place that touches `localStorage` |
| `src/components/` | top bar, language select |
| `src/pages/` | one file per screen |
| `scripts/make-icon.mjs` | writes `public/icon-192.png` and `icon-512.png` before `dev` and `build` |

Every user-facing string goes through `t("key")`. A key in `en.json` that is missing from
`da.json` fails `npm run test`.
