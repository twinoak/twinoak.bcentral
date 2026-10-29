// The app's radio-side services: the one radio store, wired to the real transports, the
// settings' blind time and the console; the ContactSource the register's picker reads; the
// outbox that sends stored messages through the radio (P0-05); and the inbox that files
// what the radio receives (P0-06).

import { currentIncidentId, onCurrentIncidentChange } from "../lib/currentIncident.svelte.ts";
import { settings } from "../lib/settings.svelte.ts";
import { journalStore } from "../store/index.ts";
import { MeshCoreBle } from "./ble.ts";
import { CompanionContactSource, type ContactSource } from "./contactSource.ts";
import { createInbox } from "./inbox.svelte.ts";
import { createOutbox } from "./outbox.svelte.ts";
import { createRadioStore } from "./radioStore.svelte.ts";
import { MeshCoreSerial, type TransportKind } from "./serial.ts";

export const radio = createRadioStore({
  now: () => Date.now(),
  blindAfterMs: () => settings.blindAfterMinutes * 60_000,
  createTransport: (kind: TransportKind) => (kind === "usb" ? new MeshCoreSerial() : new MeshCoreBle()),
  appName: "BCentral",
  logSink: (line) => console.log(line),
});

// Which transports this browser offers; both false outside Chromium.
export const transportSupport: Readonly<Record<TransportKind, boolean>> = {
  usb: MeshCoreSerial.isSupported(),
  ble: MeshCoreBle.isSupported(),
};

// The top bar's elapsed time and the blind flip run on this tick, not on frames.
if (typeof window !== "undefined") {
  setInterval(() => radio.refreshNow(), 1000);
}

export const contactSource: ContactSource = new CompanionContactSource(radio);

export const outbox = createOutbox({
  store: journalStore,
  link: () => radio.link(),
  onPush: radio.onPush,
  now: () => Date.now(),
  maxAttempts: () => settings.maxSendAttempts,
  operator: () => settings.operatorName.trim(),
  log: (line) => console.log(`outbox: ${line}`),
});

export const inbox = createInbox({
  store: journalStore,
  link: () => radio.link(),
  onPush: radio.onPush,
  contacts: radio.contacts,
  refreshContacts: radio.refreshContacts,
  incidentId: currentIncidentId,
  operator: () => settings.operatorName.trim(),
  log: (line) => console.log(`inbox: ${line}`),
});

// Drain once right after connect, and when an incident is picked (messages that arrived
// while none was selected are still on the companion). MSG_WAITING pushes drain by themselves.
radio.onConnected(() => void inbox.drain());
onCurrentIncidentChange(() => void inbox.drain());
