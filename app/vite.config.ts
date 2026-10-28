import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // The service worker takes over on the next load without a prompt; P0-09 adds
      // "last updated" on top of this.
      registerType: "autoUpdate",
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
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
