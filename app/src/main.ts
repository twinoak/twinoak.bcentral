import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import "./app.css";
import App from "./App.svelte";
import { applyAppearance } from "./lib/appearance.ts";
import { updater } from "./lib/updates.svelte.ts";
import { persistence } from "./lib/persistence.svelte.ts";
import { settings } from "./lib/settings.svelte.ts";
import { drillMode, journalStore, mirror } from "./store/index.ts";
import type { Envelope } from "./store/types.ts";

declare global {
  interface Window {
    // The seed hook below; present only when the URL asks for it.
    __bcentral?: { seed(envelope: Envelope): Promise<void> };
  }
}

const target = document.getElementById("app");
if (!target) {
  throw new Error("index.html has no #app element");
}

// A test hook for the screenshot script (scripts/screenshots.mjs, P2-05): with `?seed` in the
// URL, `window.__bcentral.seed(envelope)` loads an export envelope into the store as it is
// (ids, times and counters kept, validated against the contract like every write), so a
// built app can be filled with a known journal before a capture. Only when the URL asks; a
// normal start exposes nothing.
if (new URLSearchParams(location.search).has("seed")) {
  window.__bcentral = {
    seed: async (envelope) => {
      const store = await journalStore();
      await store.importEnvelope(envelope);
    },
  };
}

// The stored text size and contrast mode (P1-09), before the first paint; App.svelte keeps
// them in step with the settings from then on.
applyAppearance(document.documentElement, settings);

// The service worker waits for the operator's click before it takes over (lib/updates).
updater.start(registerSW);

// Ask the browser to keep the journal, and reconnect the journal folder (P1-04). Both report
// through the top bar; neither can fail the app.
void persistence.start();
void mirror.start();

// The drill band on every screen (P1-05) follows the current incident from here on.
void drillMode.start();

mount(App, { target });
