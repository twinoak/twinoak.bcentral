# deploy

How BCentral is published. The hub part (docker-compose and configuration) comes with phase 1;
nothing of it is here yet.

## The app on GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, `check`, `lint`, `test`,
`build` in `app/`, then publishes `app/dist` to GitHub Pages. The app is at

    https://twinoak.github.io/twinoak.bcentral/

and installs as a PWA from there (`app/README.md` tells the staff how).

One-time repository setting, done once by hand: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. Until that is set the `deploy` job fails with a "Pages not enabled"
error while `build` is green.

The build carries its version: `package.json` version, the short hash of the commit the
workflow ran on, and the build time (`define` in `app/vite.config.ts`, shown under Settings →
About and in the top bar's tooltip). The version string in a running app therefore names the
commit on `main` it was built from.

A new deployment does not replace the app a staff is running. The service worker is
registered with `registerType: "prompt"`: the new build is downloaded in the background and the
app shows "A new version is available" with a Reload button; nothing changes until the operator
clicks it.

## Switching to a custom domain later

The project site lives under the repository path, so the production build has Vite's `base`
set to `/twinoak.bcentral/` (`PAGES_BASE` in `app/vite.config.ts`). With a custom domain the
site is served from `/`, so three things change, all in one commit:

1. `PAGES_BASE` in `app/vite.config.ts` becomes `"/"`.
2. A `CNAME` file with the domain name goes into `app/public/`, so every build carries it and
   Pages keeps the domain across deployments.
3. The DNS record (a `CNAME` to `twinoak.github.io`, or the Pages `A`/`AAAA` records for an
   apex domain) and **Settings → Pages → Custom domain** are set by hand; tick "Enforce HTTPS"
   once the certificate is issued.

The installed PWAs on the staff laptops are bound to the old origin; after the move each
laptop installs the app once more from the new address. Everything in the browser's storage
(journal, settings) belongs to the origin, so export the journal first.
