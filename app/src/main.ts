import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import "./app.css";
import App from "./App.svelte";
import { updater } from "./lib/updates.svelte.ts";
import { persistence } from "./lib/persistence.svelte.ts";
import { mirror } from "./store/index.ts";

const target = document.getElementById("app");
if (!target) {
  throw new Error("index.html has no #app element");
}

// The service worker waits for the operator's click before it takes over (lib/updates).
updater.start(registerSW);

// Ask the browser to keep the journal, and reconnect the journal folder (P1-04). Both report
// through the top bar; neither can fail the app.
void persistence.start();
void mirror.start();

mount(App, { target });
