import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  IncidentStateError,
  closeIncident,
  incidentStateOf,
  isDrill,
  reopenIncident,
  splitByDrill,
} from "./incidents.ts";
import type { Incident } from "./types.ts";

describe("drills (P1-05)", () => {
  const [walkthroughIncident] = loadWalkthrough().incidents as [Incident];
  function incident(n: number, drill?: boolean): Incident {
    return {
      ...walkthroughIncident,
      id: `01JB8ZK3QX9V2M4N6P8R0T2X${String(n).padStart(2, "0")}`,
      name: `incident ${n}`,
      createdAt: `2026-10-28T1${n}:00:00Z`,
      drill,
    };
  }

  it("isDrill is true only for drill: true; absent, false and no incident are real", () => {
    expect(isDrill(incident(1, true))).toBe(true);
    expect(isDrill(incident(1, false))).toBe(false);
    expect(isDrill(incident(1))).toBe(false);
    expect(isDrill(null)).toBe(false);
    expect(isDrill(undefined)).toBe(false);
  });

  it("splitByDrill puts drills under their own heading, each list newest first", () => {
    const list = [incident(1), incident(2, true), incident(3, false), incident(4, true)];
    const { real, drills } = splitByDrill(list);
    expect(real.map((i) => i.name)).toEqual(["incident 3", "incident 1"]);
    expect(drills.map((i) => i.name)).toEqual(["incident 4", "incident 2"]);
    expect(splitByDrill([])).toEqual({ real: [], drills: [] });
  });
});

describe("incident state", () => {
  it("is open with no status change, closed after closed, open again after reopened", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Øvelse", createdBy: "Thomas" });
    expect(incidentStateOf(await store.entriesForIncident(incident.id), incident.id)).toBe("open");
    expect(await store.isIncidentOpen(incident.id)).toBe(true);

    const closed = await closeIncident(store, incident, {
      operator: "Anne",
      text: " Strømmen tilbage 20:52 ",
    });
    expect(closed).toMatchObject({
      type: "status_change",
      refersTo: incident.id,
      incidentId: incident.id,
      newStatus: "closed",
      text: "Strømmen tilbage 20:52",
      operator: "Anne",
    });
    expect(closed.counterpartyId).toBeUndefined();
    expect(incidentStateOf(await store.entriesForIncident(incident.id), incident.id)).toBe(
      "closed",
    );
    expect(await store.isIncidentOpen(incident.id)).toBe(false);

    const reopened = await reopenIncident(store, incident, { operator: "Anne", text: "" });
    expect(reopened.newStatus).toBe("reopened");
    expect(reopened.text).toBeUndefined();
    expect(incidentStateOf(await store.entriesForIncident(incident.id), incident.id)).toBe("open");
    expect(await store.isIncidentOpen(incident.id)).toBe(true);
    store.close();
  });

  it("refuses to close a closed incident or reopen an open one", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Øvelse", createdBy: "Thomas" });
    await expect(reopenIncident(store, incident, { operator: "Anne" })).rejects.toBeInstanceOf(
      IncidentStateError,
    );
    await closeIncident(store, incident, { operator: "Anne" });
    await expect(closeIncident(store, incident, { operator: "Anne" })).rejects.toBeInstanceOf(
      IncidentStateError,
    );
    expect((await store.entriesForIncident(incident.id)).length).toBe(1);
    store.close();
  });

  it("reads the walkthrough's incident as closed", () => {
    const { entries, incidents } = loadWalkthrough();
    expect(incidentStateOf(entries, incidents[0]?.id ?? "")).toBe("closed");
    expect(incidentStateOf(entries, "01JB8ZK3QX9V2M4N6P8R0T2X00")).toBe("open");
  });
});
