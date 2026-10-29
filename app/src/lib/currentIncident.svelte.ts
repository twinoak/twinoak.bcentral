// Which incident the app is working in, kept across reloads in localStorage. P0-03 reads it
// to attach register-edit notes to the open incident; P0-07's incident bar is what sets it.
// Only the id is stored; whether the incident exists and is open is the store's answer.

import { readStorage, removeStorage, writeStorage } from "./storage.ts";
import { ULID_PATTERN } from "./settings.svelte.ts";

export const CURRENT_INCIDENT_KEY = "bcentral.currentIncidentId";

function load(): string | null {
  const stored = readStorage(CURRENT_INCIDENT_KEY);
  return stored !== null && ULID_PATTERN.test(stored) ? stored : null;
}

let current: string | null = $state(load());

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
}
