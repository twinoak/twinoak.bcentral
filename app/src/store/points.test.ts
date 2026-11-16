// Points (P3-05) over the store: a point is opened from an entry with a title, closed with
// a reason, reopened; one per origin entry; every write validated against the contract.

import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { appendNote } from "./manual.ts";
import { closeIncident } from "./incidents.ts";
import { pointsFor } from "./journalView.ts";
import type { JournalStore } from "./journalStore.ts";
import {
  PointError,
  closePoint,
  isPointOpen,
  openPoint,
  reopenPoint,
  storedPointOf,
} from "./points.ts";
import { validateEnvelope } from "./schema.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";

async function call(store: JournalStore) {
  return await appendNote(store, {
    incidentId: INCIDENT,
    operator: "Anne",
    text: "Kommunens vagt ringede: pumpen er fremme 20:30",
  });
}

describe("open point", () => {
  it("stores a point referring to the origin, under its incident, with the trimmed title", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    const point = await openPoint(store, origin, {
      operator: "Bo",
      title: "  Tjek nr 4 kl. 20:30  ",
    });
    expect(point).toMatchObject({
      type: "point",
      refersTo: origin.id,
      text: "Tjek nr 4 kl. 20:30",
      operator: "Bo",
      incidentId: INCIDENT,
    });
    expect(point.counterpartyId).toBeUndefined();
    expect(point.transport).toBeUndefined();
    expect(await storedPointOf(store, origin.id)).toEqual(point);
    expect(await isPointOpen(store, point.id)).toBe(true);
    store.close();
  });

  it("refuses a second point on the same entry (one point per origin)", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    await openPoint(store, origin, { operator: "Bo", title: "Tjek nr 4" });
    await expect(
      openPoint(store, origin, { operator: "Bo", title: "Igen" }),
    ).rejects.toBeInstanceOf(PointError);
    expect(
      (await store.entriesReferringTo(origin.id)).filter((e) => e.type === "point"),
    ).toHaveLength(1);
    store.close();
  });

  it("refuses an empty title, an origin that is not stored, a point and a status change as origin", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    await expect(openPoint(store, origin, { operator: "Bo", title: " \n" })).rejects.toBeInstanceOf(
      PointError,
    );
    await expect(
      openPoint(
        store,
        { ...origin, id: "01JB8ZK3QX9V2M4N6P8R0T2X99" },
        { operator: "Bo", title: "x" },
      ),
    ).rejects.toBeInstanceOf(PointError);
    const point = await openPoint(store, origin, { operator: "Bo", title: "Tjek nr 4" });
    await expect(openPoint(store, point, { operator: "Bo", title: "x" })).rejects.toBeInstanceOf(
      PointError,
    );
    const incident = await store.createIncident({ name: "Test", createdBy: "Anne" });
    const closed = await closeIncident(store, incident, { operator: "Anne" });
    await expect(openPoint(store, closed, { operator: "Bo", title: "x" })).rejects.toBeInstanceOf(
      PointError,
    );
    store.close();
  });
});

describe("close and reopen", () => {
  it("close appends status_change closed with the reason; reopen appends reopened; each refused in the wrong state", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    const point = await openPoint(store, origin, { operator: "Bo", title: "Tjek nr 4" });

    await expect(reopenPoint(store, point, { operator: "Bo" })).rejects.toBeInstanceOf(PointError);
    await expect(closePoint(store, point, { operator: "Bo", reason: "  " })).rejects.toBeInstanceOf(
      PointError,
    );

    const closed = await closePoint(store, point, { operator: "Carl", reason: " Pumpen kom " });
    expect(closed).toMatchObject({
      type: "status_change",
      refersTo: point.id,
      newStatus: "closed",
      text: "Pumpen kom",
      operator: "Carl",
      incidentId: INCIDENT,
    });
    expect(await isPointOpen(store, point.id)).toBe(false);
    await expect(
      closePoint(store, point, { operator: "Carl", reason: "igen" }),
    ).rejects.toBeInstanceOf(PointError);

    const reopened = await reopenPoint(store, point, { operator: "Dan" });
    expect(reopened).toMatchObject({
      type: "status_change",
      refersTo: point.id,
      newStatus: "reopened",
      operator: "Dan",
    });
    expect(reopened.text).toBeUndefined();
    expect(await isPointOpen(store, point.id)).toBe(true);

    // The derivation the screens use agrees with the store's reading.
    const views = pointsFor(await store.entriesForIncident(INCIDENT));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ state: "open", openedAt: reopened.timestamp, reason: null });
    store.close();
  });

  it("refuses to close or reopen anything that is not a stored point", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    await expect(closePoint(store, origin, { operator: "Bo", reason: "x" })).rejects.toBeInstanceOf(
      PointError,
    );
    await expect(
      reopenPoint(
        store,
        { ...origin, id: "01JB8ZK3QX9V2M4N6P8R0T2X99", type: "point" },
        { operator: "Bo" },
      ),
    ).rejects.toBeInstanceOf(PointError);
    expect(await store.lastDeviceSeq()).toBe(1);
    store.close();
  });

  it("the export with points and their status changes validates against the contract", async () => {
    const store = await openTestStore();
    const origin = await call(store);
    const point = await openPoint(store, origin, { operator: "Bo", title: "Tjek nr 4" });
    await closePoint(store, point, { operator: "Bo", reason: "Pumpen kom" });
    await reopenPoint(store, point, { operator: "Bo" });
    const envelope = await store.exportEnvelope();
    expect(validateEnvelope(envelope)).toBe(true);
    expect(envelope.entries.map((entry) => entry.type)).toEqual([
      "note",
      "point",
      "status_change",
      "status_change",
    ]);
    store.close();
  });
});
