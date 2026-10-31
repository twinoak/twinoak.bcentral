// Which incident the app is working in, kept across reloads in localStorage. P0-03 reads it
// to attach register-edit notes to the open incident; the incident switcher in the top bar
// (P2-02, before that P0-07's incident bar) is what sets it. Only the id is stored; whether
// the incident exists and is open is the store's answer.

import { readStorage, removeStorage, writeStorage } from "./storage.ts";
import { ULID_PATTERN } from "./settings.svelte.ts";

export const CURRENT_INCIDENT_KEY = "bcentral.currentIncidentId";

function load(): string | null {
  const stored = readStorage(CURRENT_INCIDENT_KEY);
  return stored !== null && ULID_PATTERN.test(stored) ? stored : null;
}

let current: string | null = $state(load());

type IncidentListener = (id: string | null) => void;
const listeners = new Set<IncidentListener>();

export function currentIncidentId(): string | null {
  return current;
}

export function setCurrentIncidentId(id: string | null): void {
  current = id;
  if (id === null) {
    removeStorage(CURRENT_INCIDENT_KEY);
  } else {
    writeStorage(CURRENT_INCIDENT_KEY, id);
  }
  for (const listener of [...listeners]) {
    listener(id);
  }
}

// Called after every setCurrentIncidentId. The inbox drains the companion on it (P0-06):
// messages that arrived while no incident was selected are pulled in once one is. Plain
// listeners rather than an effect, so it works the same outside a component and in tests.
// Returns the unsubscribe.
export function onCurrentIncidentChange(listener: IncidentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Bumped by the switcher (P2-02) after it closes or reopens the current incident, so a
// screen that derives the incident's state from its entries (journal, handover) reloads: the
// switcher lives in the top bar, outside every screen, and the id did not change.
let revision = $state(0);

export function incidentRevision(): number {
  return revision;
}

export function bumpIncidentRevision(): void {
  revision += 1;
}
