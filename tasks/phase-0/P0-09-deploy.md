# P0-09 — Deploy

**Depends on:** P0-08.

## Goal

The app is at a fixed URL, installs from there, and tells the operator which version it is.

## Scope

In:
- GitHub Actions workflow: on push to `main`, `npm ci`, `npm run check`, `npm run lint`,
  `npm run test`, `npm run build`, deploy `app/dist` to GitHub Pages. Vite `base` set for the
  Pages path; a note in `deploy/README.md` on switching to a custom domain later.
- Version: `package.json` version + short commit hash + build date injected at build time and
  shown in settings and in the top bar's about tooltip.
- PWA update: `vite-plugin-pwa` `registerType: "prompt"` — the app shows "a new version is
  available, reload" and never swaps the service worker under a running staff. Settings shows
  "installed version" and "last checked for updates".
- A one-page `app/README.md` for the staff: how to install the PWA on a laptop, that it must
  be opened once online before a drill, and which browsers work.

Out: the hub, any custom domain setup.

## Acceptance

- The workflow is green on `main`; the Pages URL installs as a PWA; after disabling the
  network it still opens.
- Version string in the UI matches the deployed commit.
- Pushing a change makes the running installed app offer a reload, not swap silently.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```

and the Actions run for the commit.
