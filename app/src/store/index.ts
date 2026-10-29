// The app's one journal store: the "bcentral" database, this browser's device id (settings)
// and the session clock. Screens import from here; tests open their own store through
// openJournalStore() with a fake IndexedDB.

import { settings } from "../lib/settings.svelte.ts";
import { now } from "../lib/clock.svelte.ts";
import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
import { openJournalStore, type JournalStore } from "./journalStore.ts";
import { downloadEnvelope } from "./export.ts";
import { createMirror, type Mirror } from "./mirror.svelte.ts";
import { saveRegisterEntry as saveWithNote, type SaveResult } from "./register.ts";
import {
  composeBatch as composeBatchWithStore,
  composeMessage as composeWithStore,
  recordManualStatus as recordWithStore,
  type BatchComposeInput,
  type ComposeInput,
  type Composed,
} from "./outgoing.ts";
import { closeIncident as closeWithStore, reopenIncident as reopenWithStore } from "./incidents.ts";
import {
  appendCorrection,
  appendMessageIn,
  appendNote,
  type ManualMessageInInput,
} from "./manual.ts";
import { lastHeardFrom } from "./journalView.ts";
import type { Incident, JournalEntry, NewRegisterEntry, RegisterEntry, Status } from "./types.ts";

export const DATABASE_NAME = "bcentral";

let opening: Promise<JournalStore> | undefined;

export function journalStore(): Promise<JournalStore> {
  if (opening === undefined) {
    opening = openJournalStore({ name: DATABASE_NAME, deviceId: settings.deviceId, clock: now });
  }
  return opening;
}

// --- journal folder (P1-04) -------------------------------------------------------------

// The app's mirror: the folder handle lives in the store's meta, the picker is the
// browser's. main.ts starts it. Chromium only; elsewhere `supported()` is false.
export const mirror: Mirror = createMirror<FileSystemDirectoryHandle>({
  store: journalStore,
  now: () => now().timestamp,
  loadFolder: async () => await (await journalStore()).journalFolder(),
  saveFolder: async (folder) => await (await journalStore()).setJournalFolder(folder),
  clearFolder: async () => await (await journalStore()).clearJournalFolder(),
  pickFolder:
    typeof window !== "undefined" && "showDirectoryPicker" in window
      ? () => window.showDirectoryPicker({ id: "bcentral-journal", mode: "readwrite" })
      : undefined,
});

export interface ExportResult {
  filename: string;
  // The same file's name in the journal folder, or null when no folder is set (or the write
  // failed, which the mirror's state shows).
  inFolder: string | null;
}

// Builds, validates and downloads the export file, and writes it into the journal folder
// when one is set; returns the names.
export async function exportJournal(): Promise<ExportResult> {
  const store = await journalStore();
  const envelope = await store.exportEnvelope();
  const filename = downloadEnvelope(envelope);
  const inFolder = await mirror.writeEnvelope(envelope);
  return { filename, inFolder };
}

// --- print (P1-04) ----------------------------------------------------------------------

export async function lastPrintAt(): Promise<string | null> {
  const store = await journalStore();
  return await store.lastPrintAt();
}

export async function recordPrint(printedAt: string): Promise<void> {
  const store = await journalStore();
  await store.recordPrint(printedAt);
}

// --- register (P0-03) ------------------------------------------------------------------

export async function listRegister(): Promise<RegisterEntry[]> {
  const store = await journalStore();
  return await store.allRegisterEntries();
}

export async function addRegisterEntry(input: NewRegisterEntry): Promise<RegisterEntry> {
  const store = await journalStore();
  return await store.createRegisterEntry(input);
}

export async function addRegisterEntries(inputs: readonly NewRegisterEntry[]): Promise<RegisterEntry[]> {
  const store = await journalStore();
  return await store.createRegisterEntries(inputs);
}

// An edit: stored, and noted in the current incident when one is open.
export async function saveRegisterEntry(entry: RegisterEntry): Promise<SaveResult> {
  const store = await journalStore();
  return await saveWithNote(store, entry, {
    operator: settings.operatorName.trim(),
    incidentId: currentIncidentId(),
  });
}

// --- incidents (P0-05 list/create; P0-07 close/reopen, the incident bar) ----------------

export async function listIncidents(): Promise<Incident[]> {
  const store = await journalStore();
  return await store.allIncidents();
}

export async function addIncident(name: string): Promise<Incident> {
  const store = await journalStore();
  return await store.createIncident({ name: name.trim(), createdBy: settings.operatorName.trim() });
}

export async function closeIncident(incident: Incident, text: string): Promise<JournalEntry> {
  const store = await journalStore();
  return await closeWithStore(store, incident, { operator: settings.operatorName.trim(), text });
}

export async function reopenIncident(incident: Incident, text: string): Promise<JournalEntry> {
  const store = await journalStore();
  return await reopenWithStore(store, incident, { operator: settings.operatorName.trim(), text });
}

// --- manual entries (P0-07) -------------------------------------------------------------

export async function addNote(incidentId: string, text: string): Promise<JournalEntry> {
  const store = await journalStore();
  return await appendNote(store, { incidentId, operator: settings.operatorName.trim(), text });
}

export async function addCorrection(target: JournalEntry, text: string): Promise<JournalEntry> {
  const store = await journalStore();
  return await appendCorrection(store, target, { operator: settings.operatorName.trim(), text });
}

export async function addMessageIn(input: Omit<ManualMessageInInput, "operator">): Promise<JournalEntry> {
  const store = await journalStore();
  return await appendMessageIn(store, { ...input, operator: settings.operatorName.trim() });
}

// When every register entry was last heard from, over the whole journal: a radio's silence
// does not reset when a new incident is opened.
export async function lastHeardByCounterparty(): Promise<Map<string, string>> {
  const store = await journalStore();
  return lastHeardFrom(await store.allEntries());
}

// --- outgoing messages (P0-05) ----------------------------------------------------------

// Reserves #n, stores the message_out (and, for mesh, its pending status). Sending is the
// outbox's job (src/radio/index.ts).
export async function composeMessage(input: Omit<ComposeInput, "operator">): Promise<Composed> {
  const store = await journalStore();
  return await composeWithStore(store, { ...input, operator: settings.operatorName.trim() });
}

// The operator's own status change on a message, with the reason (required).
export async function recordManualStatus(message: JournalEntry, newStatus: Status, text: string): Promise<JournalEntry> {
  const store = await journalStore();
  return await recordWithStore(store, message, newStatus, { operator: settings.operatorName.trim(), text });
}

export async function entriesForIncident(incidentId: string): Promise<JournalEntry[]> {
  const store = await journalStore();
  return await store.entriesForIncident(incidentId);
}

export async function lastSeqNo(counterpartyId: string): Promise<number> {
  const store = await journalStore();
  return await store.lastSeqNo(counterpartyId);
}

// --- send to all (P0-08) ---------------------------------------------------------------

// One message_out per recipient, all stored before any is sent. Sending is the send queue's
// job (src/radio/index.ts). A BatchComposeError carries the messages stored before the
// failure; the caller still hands those to the queue.
export async function composeBatch(input: Omit<BatchComposeInput, "operator">): Promise<Composed[]> {
  const store = await journalStore();
  return await composeBatchWithStore(store, { ...input, operator: settings.operatorName.trim() });
}

// The last #n of every given register entry, for the batch's byte counter.
export async function lastSeqNos(counterpartyIds: readonly string[]): Promise<Map<string, number>> {
  const store = await journalStore();
  const result = new Map<string, number>();
  for (const id of counterpartyIds) {
    result.set(id, await store.lastSeqNo(id));
  }
  return result;
}
