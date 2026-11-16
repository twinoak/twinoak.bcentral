// The New record tab's store path (P3-01): a note, an incoming message by phone, an outgoing
// message by courier — each the entry the journal already had for it — and what the tab
// refuses: the radio on either message kind, a counterparty that is not in the register.

import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import type { JournalStore } from "./journalStore.ts";
import { ManualEntryError } from "./manual.ts";
import { composeMessage } from "./outgoing.ts";
import { RECORD_TYPES, recordByHand } from "./record.ts";
import { validateJournalEntry } from "./schema.ts";
import type { JournalEntry } from "./types.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";

async function storeWithWalkthrough(): Promise<JournalStore> {
  const store = await openTestStore();
  await store.importEnvelope(loadWalkthrough());
  return store;
}

function stored(entry: JournalEntry): JournalEntry {
  expect(validateJournalEntry(entry), JSON.stringify(validateJournalEntry.errors)).toBe(true);
  return entry;
}

describe("the Type select", () => {
  it("offers note, incoming message, outgoing message, in that order", () => {
    expect(RECORD_TYPES).toEqual(["note", "message_in", "message_out"]);
  });
});

describe("a note", () => {
  it("is stored as a note with the text and nothing of a message, whatever else the form holds", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.lastDeviceSeq();
    const note = stored(
      await recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "note",
        counterpartyId: HANS,
        transport: "phone",
        text: "  Ringede til forsyningen  ",
      }),
    );
    expect(note).toMatchObject({ type: "note", text: "Ringede til forsyningen", operator: "Anne" });
    expect(note.counterpartyId).toBeUndefined();
    expect(note.transport).toBeUndefined();
    expect(note.seqNo).toBeUndefined();
    expect(note.refersTo).toBeUndefined();
    expect(await store.lastDeviceSeq()).toBe(before + 1);
    expect(await store.lastSeqNo(HANS)).toBe(2);
  });
});

describe("an incoming message by phone", () => {
  it("is a message_in with the transport and the counterparty, no dedupeKey, no status", async () => {
    const store = await storeWithWalkthrough();
    const message = stored(
      await recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_in",
        counterpartyId: HANS,
        transport: "phone",
        text: "Pumpen er fremme 20:30",
      }),
    );
    expect(message).toMatchObject({
      type: "message_in",
      transport: "phone",
      counterpartyId: HANS,
      text: "Pumpen er fremme 20:30",
    });
    expect(message.dedupeKey).toBeUndefined();
    expect(message.seqNo).toBeUndefined();
    expect(message.newStatus).toBeUndefined();
    expect(await store.entriesReferringTo(message.id)).toEqual([]);
    // The counter is the outgoing side's; an incoming message does not move it.
    expect(await store.lastSeqNo(HANS)).toBe(2);
  });

  it("refuses the radio, a missing counterparty and a counterparty that is not in the register", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.lastDeviceSeq();
    const base = { incidentId: INCIDENT, operator: "Anne", type: "message_in" as const, text: "x" };
    await expect(
      recordByHand(store, { ...base, counterpartyId: HANS, transport: "mesh" }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    await expect(
      recordByHand(store, { ...base, counterpartyId: "", transport: "phone" }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    await expect(recordByHand(store, { ...base, transport: "phone" })).rejects.toBeInstanceOf(
      ManualEntryError,
    );
    await expect(
      recordByHand(store, {
        ...base,
        counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2X00",
        transport: "courier",
      }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    expect(await store.lastDeviceSeq()).toBe(before);
  });
});

describe("an outgoing message by courier", () => {
  it("is a message_out with the recipient's next #n in the text, seqNo reserved, pending, and nothing transmitted", async () => {
    const store = await storeWithWalkthrough();
    expect(await store.lastSeqNo(HANS)).toBe(2);
    const message = stored(
      await recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_out",
        counterpartyId: HANS,
        transport: "courier",
        text: " Pumpe på vej med Peter på cykel ",
      }),
    );
    expect(message).toMatchObject({
      type: "message_out",
      transport: "courier",
      counterpartyId: HANS,
      seqNo: 3,
      text: "#3 Pumpe på vej med Peter på cykel",
      operator: "Anne",
    });
    expect(message.refersTo).toBeUndefined();
    expect(message.batchId).toBeUndefined();
    expect(await store.lastSeqNo(HANS)).toBe(3);
    // No status_change of any kind: pending until the operator marks it from the row.
    expect(await store.statusOf(message.id)).toBe("pending");
    expect(await store.entriesReferringTo(message.id)).toEqual([]);
    // The counter is shared across transports: the next radio message to Hans is #4.
    const { message: radio } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: HANS,
      transport: "mesh",
      body: "Meld status",
    });
    expect(radio.text).toBe("#4 Meld status");
  });

  it("refuses the radio: a mesh message_out is the MeshCore tab's, and the counter stays", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.lastDeviceSeq();
    await expect(
      recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_out",
        counterpartyId: HANS,
        transport: "mesh",
        text: "Meld status",
      }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    await expect(
      recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_out",
        counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2X00",
        transport: "courier",
        text: "Meld status",
      }),
    ).rejects.toBeInstanceOf(ManualEntryError);
    expect(await store.lastDeviceSeq()).toBe(before);
    expect(await store.lastSeqNo(HANS)).toBe(2);
  });

  it("carries the ØVELSE prefix in a drill, like any message_out", async () => {
    const store = await storeWithWalkthrough();
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Anne", drill: true });
    const message = await recordByHand(store, {
      incidentId: drill.id,
      operator: "Anne",
      type: "message_out",
      counterpartyId: HANS,
      transport: "verbal",
      text: "Meld status",
    });
    expect(message.text).toBe("ØVELSE #3 Meld status");
  });
});

describe("a reply to a courier incoming (P1-02 on the New record tab)", () => {
  it("is a courier message_out with refersTo = the incoming entry's id and the next #n", async () => {
    const store = await storeWithWalkthrough();
    const incoming = await recordByHand(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      type: "message_in",
      counterpartyId: HANS,
      transport: "courier",
      text: "Kælderen i nr 4 er tør nu",
    });
    const reply = stored(
      await recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_out",
        counterpartyId: HANS,
        transport: "courier",
        text: "Modtaget, bliv ved nr 4",
        refersTo: incoming.id,
      }),
    );
    expect(reply).toMatchObject({
      type: "message_out",
      transport: "courier",
      counterpartyId: HANS,
      seqNo: 3,
      text: "#3 Modtaget, bliv ved nr 4",
      refersTo: incoming.id,
    });
    expect(await store.getEntry(incoming.id)).toEqual(incoming);
    expect(await store.entriesReferringTo(incoming.id)).toEqual([reply]);
  });

  it("refersTo is not read for a note or an incoming message", async () => {
    const store = await storeWithWalkthrough();
    const target = (await store.allEntries()).find((entry) => entry.type === "message_in")!;
    const note = await recordByHand(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      type: "note",
      text: "x",
      refersTo: target.id,
    });
    const incoming = await recordByHand(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      type: "message_in",
      counterpartyId: HANS,
      transport: "verbal",
      text: "y",
      refersTo: target.id,
    });
    expect(note.refersTo).toBeUndefined();
    expect(incoming.refersTo).toBeUndefined();
  });
});
