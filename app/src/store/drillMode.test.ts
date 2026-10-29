// Drill mode (P1-05): the band on every screen follows the current incident. Over a store on
// fake-indexeddb and a hand-rolled current-incident registry, like the app's.

import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { createDrillMode } from "./drillMode.svelte.ts";
import type { JournalStore } from "./journalStore.ts";

async function setUp(store: JournalStore) {
  let current: string | null = null;
  const listeners = new Set<(id: string | null) => void>();
  const drillMode = createDrillMode({
    store: async () => store,
    incidentId: () => current,
    onIncidentChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  async function pick(id: string | null): Promise<void> {
    current = id;
    for (const listener of [...listeners]) {
      listener(id);
    }
    await drillMode.settled();
  }
  return { drillMode, pick, listeners };
}

describe("drill mode", () => {
  it("is active while the current incident is a drill and not otherwise, from start and on every change", async () => {
    const store = await openTestStore();
    const real = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    const { drillMode, pick } = await setUp(store);
    expect(drillMode.active()).toBe(false);
    expect(drillMode.incident()).toBeNull();

    await drillMode.start();
    expect(drillMode.active()).toBe(false);

    await pick(drill.id);
    expect(drillMode.active()).toBe(true);
    expect(drillMode.incident()).toStrictEqual(drill);

    await pick(real.id);
    expect(drillMode.active()).toBe(false);
    expect(drillMode.incident()).toStrictEqual(real);

    await pick(null);
    expect(drillMode.active()).toBe(false);
    expect(drillMode.incident()).toBeNull();

    // An id the store does not have (a stale localStorage value) is no incident, so no drill.
    await pick("01JB8ZK3QX9V2M4N6P8R0T2X99");
    expect(drillMode.active()).toBe(false);
    expect(drillMode.incident()).toBeNull();
    drillMode.stop();
    store.close();
  });

  it("reads the incident that is current when the app starts", async () => {
    const store = await openTestStore();
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    const { drillMode, pick, listeners } = await setUp(store);
    await pick(drill.id);
    // Before start nothing is read and nothing is subscribed.
    expect(drillMode.active()).toBe(false);
    expect(listeners.size).toBe(0);
    await drillMode.start();
    expect(drillMode.active()).toBe(true);
    expect(listeners.size).toBe(1);
    drillMode.stop();
    expect(listeners.size).toBe(0);
    store.close();
  });

  it("a quick switch keeps the latest incident, never a previous one's flag", async () => {
    const store = await openTestStore();
    const real = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    let current: string | null = null;
    const listeners = new Set<(id: string | null) => void>();
    const drillMode = createDrillMode({
      store: async () => store,
      incidentId: () => current,
      onIncidentChange: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    await drillMode.start();
    // Two changes before either read is back: the drill, then the real one.
    current = drill.id;
    for (const listener of listeners) {
      listener(drill.id);
    }
    current = real.id;
    for (const listener of listeners) {
      listener(real.id);
    }
    await drillMode.settled();
    expect(drillMode.active()).toBe(false);
    expect(drillMode.incident()).toStrictEqual(real);
    drillMode.stop();
    store.close();
  });
});
