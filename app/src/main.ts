import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import "./app.css";
import App from "./App.svelte";
import { applyAppearance } from "./lib/appearance.ts";
import { updater } from "./lib/updates.svelte.ts";
import { persistence } from "./lib/persistence.svelte.ts";
import { settings } from "./lib/settings.svelte.ts";
import { drillMode, mirror } from "./store/index.ts";

const target = document.getElementById("app");
if (!target) {
  throw new Error("index.html has no #app element");
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
