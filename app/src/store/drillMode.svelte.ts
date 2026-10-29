// Drill mode (P1-05): whether the incident the app is working in is a drill, as rune state
// every screen can read. The current incident is an id in localStorage
// (lib/currentIncident.svelte.ts); the drill flag is on the stored incident, so this module
// reads the incident from the store whenever the id changes and keeps it. The band across
// the top of every screen, the document title and the print view read `active()`; nothing
// here is stored, and nothing is guessed: no incident, or one the store does not have, is
// not a drill.

import type { JournalStore } from "./journalStore.ts";
import { isDrill } from "./incidents.ts";
import type { Incident } from "./types.ts";

export interface DrillModeDeps {
  store: () => Promise<JournalStore>;
  incidentId: () => string | null;
  // Fires after every change of the current incident; the incident is read again on it.
  onIncidentChange: (listener: (id: string | null) => void) => () => void;
}

export interface DrillMode {
  // Reads the current incident and subscribes to changes of it.
  start(): Promise<void>;
  // The current incident as stored, or null while none is selected (or it is not in the
  // store).
  incident(): Incident | null;
  // True while the current incident is a drill.
  active(): boolean;
  // Resolves once the incident of the latest change has been read. For tests.
  settled(): Promise<void>;
  stop(): void;
}

export function createDrillMode(deps: DrillModeDeps): DrillMode {
  let incident: Incident | null = $state.raw(null);
  let loading: Promise<void> | null = null;
  let unsubscribe: (() => void) | null = null;

  // The incident for `id`, kept only if `id` is still the current one when the read is back,
  // so a quick switch cannot leave the previous incident's flag on the screen.
  async function load(id: string | null): Promise<void> {
    if (id === null) {
      incident = null;
      return;
    }
    const store = await deps.store();
    const found = await store.getIncident(id);
    if (deps.incidentId() === id) {
      incident = found ?? null;
    }
  }

  function reload(id: string | null): Promise<void> {
    loading = load(id);
    return loading;
  }

  async function start(): Promise<void> {
    unsubscribe?.();
    unsubscribe = deps.onIncidentChange((id) => void reload(id));
    await reload(deps.incidentId());
  }

  async function settled(): Promise<void> {
    while (loading !== null) {
      const current = loading;
      await current;
      if (loading === current) {
        loading = null;
      }
    }
  }

  function stop(): void {
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    start,
    incident: () => incident,
    active: () => isDrill(incident),
    settled,
    stop,
  };
}
