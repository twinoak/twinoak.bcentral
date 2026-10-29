// The app's radio-side services: the one radio store, wired to the real transports, the
// settings' blind time and the console; the ContactSource the register's picker reads; the
// outbox that sends stored messages through the radio (P0-05); the inbox that files what
// the radio receives (P0-06); and the send-to-all queue over the outbox (P0-08).

import { currentIncidentId, onCurrentIncidentChange } from "../lib/currentIncident.svelte.ts";
import { settings } from "../lib/settings.svelte.ts";
import { journalStore } from "../store/index.ts";
import { MeshCoreBle } from "./ble.ts";
import { capabilityOf, transportSupportOf } from "./capability.ts";
import { CompanionContactSource, type ContactSource } from "./contactSource.ts";
import { createInbox } from "./inbox.svelte.ts";
import { createOutbox } from "./outbox.svelte.ts";
import { createRadioStore } from "./radioStore.svelte.ts";
import { createSendQueue } from "./sendQueue.svelte.ts";
import { MeshCoreSerial, type TransportKind } from "./serial.ts";

const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export const radio = createRadioStore({
  now: () => Date.now(),
  blindAfterMs: () => settings.blindAfterMinutes * 60_000,
  createTransport: (kind: TransportKind, port?: SerialPort) =>
    kind === "usb" ? new MeshCoreSerial({ port }) : new MeshCoreBle(),
  appName: "BCentral",
  logSink: (line) => console.log(line),
  // The plug events and the granted ports (P1-07); undefined outside Chromium.
  serial: typeof navigator === "undefined" ? undefined : navigator.serial,
  // The link is checked when the laptop comes back (P1-07).
  page: inBrowser
    ? { document, window, isVisible: () => document.visibilityState === "visible" }
    : undefined,
});

// Which transports this browser offers; both false outside Chromium.
export const transportSupport = transportSupportOf(
  typeof navigator === "undefined" ? undefined : navigator,
);
export const capability = capabilityOf(transportSupport);

// The top bar's elapsed time, the blind flip and the reconnect countdown run on this tick.
if (inBrowser) {
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

export const sendQueue = createSendQueue({
  store: journalStore,
  outbox,
  now: () => Date.now(),
  gapMs: () => settings.sendGapSeconds * 1000,
  radioState: () => radio.state(),
  onConnected: radio.onConnected,
  log: (line) => console.log(`queue: ${line}`),
});

// The queue survives a reload through the store alone: on start, and when an incident is
// picked, the incident's mesh messages still pending (no `sent` yet) are queued again.
function requeuePending(): void {
  const incidentId = currentIncidentId();
  if (incidentId !== null) {
    void sendQueue.requeuePending(incidentId);
  }
}
requeuePending();
onCurrentIncidentChange(requeuePending);

// Last, so the inbox and the queue are listening when the one granted USB port connects
// without a gesture (P1-07).
if (inBrowser) {
  radio.start();
}
