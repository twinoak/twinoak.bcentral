import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { ManualEntryError, appendCorrection, appendMessageIn, appendNote } from "./manual.ts";
import { appendStatusChange, composeMessage } from "./outgoing.ts";
import { applyIncoming } from "./incoming.ts";
import type { JournalStore } from "./journalStore.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";

async function hans(store: JournalStore) {
  return await store.createRegisterEntry({
    publicKey: "7a".repeat(32),
    label: "Hans",
    origin: "adhoc",
  });
}

describe("note", () => {
  it("stores the trimmed text under the incident with the operator", async () => {
    const store = await openTestStore();
    const note = await appendNote(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      text: "  Ringede til forsyningen  ",
    });
    expect(note).toMatchObject({
      type: "note",
      text: "Ringede til forsyningen",
      operator: "Anne",
      incidentId: INCIDENT,
    });
    expect(note.counterpartyId).toBeUndefined();
    store.close();
  });

  it("refuses an empty note", async () => {
    const store = await openTestStore();
    await expect(
      appendNote(store, { incidentId: INCIDENT, operator: "Anne", text: " \n" }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    expect(await store.lastDeviceSeq()).toBe(0);
    store.close();
  });
});

describe("correction", () => {
  it("is a new entry referring to the original, which stays exactly as it was", async () => {
    const store = await openTestStore();
    const note = await appendNote(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      text: "forsyningen",
    });
    const correction = await appendCorrection(store, note, {
      operator: "Bo",
      text: " kommunens vagt ",
    });
    expect(correction).toMatchObject({
      type: "correction",
      refersTo: note.id,
      text: "kommunens vagt",
      operator: "Bo",
      incidentId: INCIDENT,
    });
    expect(await store.getEntry(note.id)).toEqual(note);
    store.close();
  });

  it("can correct any entry type, including a status change", async () => {
    const store = await openTestStore();
    const entry = await hans(store);
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: entry.id,
      transport: "mesh",
      body: "Meld status",
    });
    const sent = await appendStatusChange(store, message, "sent");
    const correction = await appendCorrection(store, sent, {
      operator: "Anne",
      text: "sent to the wrong radio",
    });
    expect(correction.refersTo).toBe(sent.id);
    store.close();
  });

  it("refuses an empty text and a target that is not in the journal", async () => {
    const store = await openTestStore();
    const note = await appendNote(store, { incidentId: INCIDENT, operator: "Anne", text: "x" });
    await expect(
      appendCorrection(store, note, { operator: "Anne", text: "   " }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    const ghost = { ...note, id: "01JB8ZK3QX9V2M4N6P8R0T2X00" };
    await expect(
      appendCorrection(store, ghost, { operator: "Anne", text: "y" }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    expect(await store.lastDeviceSeq()).toBe(1);
    store.close();
  });
});

describe("incoming message on a non-mesh transport", () => {
  it("is stored as typed, with transport and counterparty, without a dedupe key", async () => {
    const store = await openTestStore();
    const entry = await hans(store);
    const message = await appendMessageIn(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: entry.id,
      transport: "phone",
      text: " kælderen er tør ",
    });
    expect(message).toMatchObject({
      type: "message_in",
      transport: "phone",
      counterpartyId: entry.id,
      text: "kælderen er tør",
    });
    expect(message.dedupeKey).toBeUndefined();
    expect(await store.lastHeardAt(entry.id)).toBe(message.timestamp);
    store.close();
  });

  it("is not parsed for roger: 'R1' by phone stays a message; the operator records the roger by hand", async () => {
    const store = await openTestStore();
    const entry = await hans(store);
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: entry.id,
      transport: "phone",
      body: "Meld status",
    });
    const phoned = await appendMessageIn(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: entry.id,
      transport: "phone",
      text: "R1",
    });
    expect(phoned.text).toBe("R1");
    expect(await store.statusOf(message.id)).toBe("pending");
    // Were the roger rules applied to it, they would still find nothing open (pending).
    expect(await applyIncoming(store, phoned)).toBeNull();
    store.close();
  });

  it("refuses mesh, an unknown counterparty and an empty text", async () => {
    const store = await openTestStore();
    const entry = await hans(store);
    const base = { incidentId: INCIDENT, operator: "Anne", counterpartyId: entry.id, text: "x" };
    await expect(appendMessageIn(store, { ...base, transport: "mesh" })).rejects.toBeInstanceOf(
      ManualEntryError,
    );
    await expect(
      appendMessageIn(store, {
        ...base,
        transport: "courier",
        counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2X00",
      }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    await expect(
      appendMessageIn(store, { ...base, transport: "verbal", text: "" }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    expect(await store.lastDeviceSeq()).toBe(0);
    store.close();
  });
});
