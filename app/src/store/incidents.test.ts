import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { IncidentStateError, closeIncident, incidentStateOf, reopenIncident } from "./incidents.ts";

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
