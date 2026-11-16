// The New record tab's store path (P3-01): a note, an incoming message by phone, an outgoing
// message by courier — each the entry the journal already had for it; the outgoing one a
// plain record since P3-07 — and what the tab refuses: the radio on either message kind, a
// counterparty that is not in the register.

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
    expect(await store.lastSeqNo(HANS)).toBe(1);
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
    // The counter is the radio's; an incoming message does not move it.
    expect(await store.lastSeqNo(HANS)).toBe(1);
  });

  it("a contact without a radio is a counterparty like any other (P3-06), and her call is 'last heard from'", async () => {
    const store = await storeWithWalkthrough();
    const grethe = await store.createRegisterEntry({
      label: "Grethe",
      street: "Nørregade 12",
      phone: "12 34 56 78",
    });
    const message = stored(
      await recordByHand(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        type: "message_in",
        counterpartyId: grethe.id,
        transport: "phone",
        text: "Der er vand i kælderen i nr 12",
      }),
    );
    expect(message).toMatchObject({
      type: "message_in",
      transport: "phone",
      counterpartyId: grethe.id,
    });
    expect(await store.lastHeardAt(grethe.id)).toBe(message.timestamp);
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
  it("is a plain message_out: the text as typed, no seqNo, no prefix, no status, the counter untouched (P3-07)", async () => {
    const store = await storeWithWalkthrough();
    expect(await store.lastSeqNo(HANS)).toBe(1);
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
      text: "Pumpe på vej med Peter på cykel",
      operator: "Anne",
    });
    expect("seqNo" in message).toBe(false);
    expect(message.refersTo).toBeUndefined();
    expect(message.batchId).toBeUndefined();
    expect(await store.lastSeqNo(HANS)).toBe(1);
    // No status chain: nothing refers to it and its status is null, not pending.
    expect(await store.statusOf(message.id)).toBeNull();
    expect(await store.entriesReferringTo(message.id)).toEqual([]);
    // The counter is the radio's alone: the next radio message to Hans is #2.
    const { message: radio } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: HANS,
      transport: "mesh",
      body: "Meld status",
    });
    expect(radio.text).toBe("#2 Meld status");
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
    expect(await store.lastSeqNo(HANS)).toBe(1);
  });

  it("carries no ØVELSE prefix in a drill: the prefix is the radio's, like the number (P3-07)", async () => {
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
    expect(message.text).toBe("Meld status");
    expect(message.incidentId).toBe(drill.id);
  });
});

describe("a reply to a courier incoming (P1-02 on the New record tab)", () => {
  it("is a courier message_out with refersTo = the incoming entry's id, as typed, with no number", async () => {
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
      text: "Modtaget, bliv ved nr 4",
      refersTo: incoming.id,
    });
    expect(reply.seqNo).toBeUndefined();
    expect(await store.lastSeqNo(HANS)).toBe(1);
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
