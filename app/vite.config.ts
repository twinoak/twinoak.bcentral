import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

// The app is deployed to GitHub Pages as a project site, so the production build lives under
// the repository's path. The dev server stays at "/". With a custom domain this becomes "/"
// (deploy/README.md).
const PAGES_BASE = "/twinoak.bcentral/";

// Version shown in the UI (lib/version.ts): package.json version, the short commit hash and
// the build time, fixed when the build runs.
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function appCommit(): string {
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // No git in the build environment: GitHub Actions still sets GITHUB_SHA.
    const sha = process.env["GITHUB_SHA"];
    return sha ? sha.slice(0, 7) : "dev";
  }
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? PAGES_BASE : "/",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_COMMIT__: JSON.stringify(appCommit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      // A new service worker waits until the operator clicks "reload" (lib/updates.svelte.ts);
      // it never takes over under a running staff.
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "BCentral",
        short_name: "BCentral",
        description: "Communication desk and journal for a local emergency preparedness group",
        lang: "da",
        start_url: ".",
        scope: ".",
        display: "standalone",
        theme_color: "#1f3a5f",
        background_color: "#f4f6f8",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the whole build so the installed app opens with no network at all.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
  server: {
    // src/store/schema.ts imports contract/journal.schema.json from the repo root, one level
    // above this project; the dev server only serves files inside the allow list.
    fs: { allow: [".."] },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
}));
