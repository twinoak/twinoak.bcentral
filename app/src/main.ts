import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import "./app.css";
import App from "./App.svelte";
import { updater } from "./lib/updates.svelte.ts";

const target = document.getElementById("app");
if (!target) {
  throw new Error("index.html has no #app element");
}

// The service worker waits for the operator's click before it takes over (lib/updates).
updater.start(registerSW);

mount(App, { target });
