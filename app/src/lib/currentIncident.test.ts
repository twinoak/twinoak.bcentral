import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "../test-support/fakeStorage.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";

async function load() {
  vi.resetModules();
  return await import("./currentIncident.svelte.ts");
}

describe("current incident", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with none selected", async () => {
    const { currentIncidentId } = await load();
    expect(currentIncidentId()).toBeNull();
  });

  it("keeps the selection across a reload", async () => {
    const first = await load();
    first.setCurrentIncidentId(INCIDENT);
    expect(first.currentIncidentId()).toBe(INCIDENT);
    const second = await load();
    expect(second.currentIncidentId()).toBe(INCIDENT);
  });

  it("clears the selection, also from storage", async () => {
    const first = await load();
    first.setCurrentIncidentId(INCIDENT);
    first.setCurrentIncidentId(null);
    expect(first.currentIncidentId()).toBeNull();
    expect(localStorage.getItem(first.CURRENT_INCIDENT_KEY)).toBeNull();
    const second = await load();
    expect(second.currentIncidentId()).toBeNull();
  });

  it("ignores a stored value that is not a ULID", async () => {
    localStorage.setItem("bcentral.currentIncidentId", "incident-1");
    const { currentIncidentId } = await load();
    expect(currentIncidentId()).toBeNull();
  });

  it("onCurrentIncidentChange runs on every change until stopped", async () => {
    const { onCurrentIncidentChange, setCurrentIncidentId } = await load();
    const seen: (string | null)[] = [];
    const stop = onCurrentIncidentChange((id) => seen.push(id));
    expect(seen).toEqual([]);

    setCurrentIncidentId(INCIDENT);
    expect(seen).toEqual([INCIDENT]);

    setCurrentIncidentId(null);
    expect(seen).toEqual([INCIDENT, null]);

    stop();
    setCurrentIncidentId(INCIDENT);
    expect(seen).toEqual([INCIDENT, null]);
  });
});
