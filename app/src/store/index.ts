// The app's one journal store: the "bcentral" database, this browser's device id (settings)
// and the session clock. Screens import from here; tests open their own store through
// openJournalStore() with a fake IndexedDB.

import { settings } from "../lib/settings.svelte.ts";
import { now } from "../lib/clock.svelte.ts";
import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
import { openJournalStore, type JournalStore } from "./journalStore.ts";
import { downloadEnvelope } from "./export.ts";
import { saveRegisterEntry as saveWithNote, type SaveResult } from "./register.ts";
import {
  composeMessage as composeWithStore,
  recordManualStatus as recordWithStore,
  type ComposeInput,
  type Composed,
} from "./outgoing.ts";
import type { Incident, JournalEntry, NewRegisterEntry, RegisterEntry, Status } from "./types.ts";

export const DATABASE_NAME = "bcentral";

let opening: Promise<JournalStore> | undefined;

export function journalStore(): Promise<JournalStore> {
  if (opening === undefined) {
    opening = openJournalStore({ name: DATABASE_NAME, deviceId: settings.deviceId, clock: now });
  }
  return opening;
}

// Builds, validates and downloads the export file; returns its name.
export async function exportJournal(): Promise<string> {
  const store = await journalStore();
  const envelope = await store.exportEnvelope();
  return downloadEnvelope(envelope);
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

// --- incidents (the slice P0-05 needs; P0-07 owns the incident bar) --------------------

export async function listIncidents(): Promise<Incident[]> {
  const store = await journalStore();
  return await store.allIncidents();
}

export async function addIncident(name: string): Promise<Incident> {
  const store = await journalStore();
  return await store.createIncident({ name: name.trim(), createdBy: settings.operatorName.trim() });
}

// --- outgoing messages (P0-05) ----------------------------------------------------------

// Reserves #n, stores the message_out (and, for mesh, its pending status). Sending is the
// outbox's job (src/radio/index.ts).
export async function composeMessage(input: Omit<ComposeInput, "operator">): Promise<Composed> {
  const store = await journalStore();
  return await composeWithStore(store, { ...input, operator: settings.operatorName.trim() });
}

// The operator's own status change on a non-mesh message.
export async function recordManualStatus(message: JournalEntry, newStatus: Status, text?: string): Promise<JournalEntry> {
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
