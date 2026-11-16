// The handover screen's writes (P1-08) on a store with the walkthrough loaded: the one
// handover note, the status request with the radio's next #n, and "send by courier" on a
// given-up message — recorded from the New record tab since P3-01, so the copy's transport
// and text are the form's.

import { describe, expect, it } from "vitest";
import { openTestStore } from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  HandoverError,
  STATUS_REQUEST_BODY,
  composeStatusRequest,
  handoverNoteText,
  recordHandover,
  resendByHand,
} from "./handover.ts";
import { bodyOf } from "./journalView.ts";
import type { JournalStore } from "./journalStore.ts";
import { composeMessage, appendStatusChange, RecipientError } from "./outgoing.ts";
import type { JournalEntry } from "./types.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";

async function storeWithWalkthrough(): Promise<JournalStore> {
  const store = await openTestStore();
  await store.importEnvelope(loadWalkthrough());
  return store;
}

async function addPeter(store: JournalStore): Promise<string> {
  const peter = await store.createRegisterEntry({
    publicKey: "a".repeat(64),
    label: "Peter",
    origin: "issued",
  });
  return peter.id;
}

// A mesh message to Hans that was sent and given up, as the outbox leaves it.
async function givenUpToHans(store: JournalStore, body = "Kør til nr 4"): Promise<JournalEntry> {
  const { message } = await composeMessage(store, {
    incidentId: INCIDENT,
    operator: "Thomas",
    counterpartyId: HANS,
    transport: "mesh",
    body,
  });
  await appendStatusChange(store, message, "sent");
  await appendStatusChange(store, message, "given_up", "no ack after 3 attempts");
  return message;
}

describe("the handover note", () => {
  it("is exactly 'handover: ‹old› → ‹new›'", () => {
    expect(handoverNoteText("Thomas", "Anne")).toBe("handover: Thomas → Anne");
  });

  it("appends exactly one note, stamped with the operator taking over", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.allEntries();
    const note = await recordHandover(store, { incidentId: INCIDENT, from: "Thomas", to: "Anne" });
    expect(note).not.toBeNull();
    expect(note).toMatchObject({
      type: "note",
      incidentId: INCIDENT,
      operator: "Anne",
      text: "handover: Thomas → Anne",
    });
    expect(note?.refersTo).toBeUndefined();
    const after = await store.allEntries();
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((entry) => !before.some((old) => old.id === entry.id))).toEqual([note]);
  });

  it("trims the names and writes nothing when the name did not change", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.lastDeviceSeq();
    expect(
      await recordHandover(store, { incidentId: INCIDENT, from: "Thomas", to: " Thomas " }),
    ).toBeNull();
    expect(await store.lastDeviceSeq()).toBe(before);
    const note = await recordHandover(store, {
      incidentId: INCIDENT,
      from: " Thomas",
      to: "Anne ",
    });
    expect(note?.text).toBe("handover: Thomas → Anne");
    expect(note?.operator).toBe("Anne");
  });

  it("refuses an empty new name and writes nothing", async () => {
    const store = await storeWithWalkthrough();
    const before = await store.lastDeviceSeq();
    await expect(
      recordHandover(store, { incidentId: INCIDENT, from: "Thomas", to: "  " }),
    ).rejects.toThrow(HandoverError);
    expect(await store.lastDeviceSeq()).toBe(before);
  });
});

describe("the status request", () => {
  it("composes '#n Meld status' with the radio's next #n: #3 for Hans after the walkthrough, #1 for a new radio", async () => {
    const store = await storeWithWalkthrough();
    expect(STATUS_REQUEST_BODY).toBe("Meld status");
    const { message } = await composeStatusRequest(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: HANS,
    });
    expect(message).toMatchObject({
      type: "message_out",
      transport: "mesh",
      counterpartyId: HANS,
      seqNo: 3,
      text: "#3 Meld status",
      operator: "Anne",
      incidentId: INCIDENT,
    });
    expect(await store.statusOf(message.id)).toBe("pending");
    expect(await store.lastSeqNo(HANS)).toBe(3);

    const peter = await addPeter(store);
    const second = await composeStatusRequest(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: peter,
    });
    expect(second.message.text).toBe("#1 Meld status");
    expect(second.message.seqNo).toBe(1);
    // A second request to Hans takes the next number again.
    const third = await composeStatusRequest(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: HANS,
    });
    expect(third.message.text).toBe("#4 Meld status");
  });

  it("carries the ØVELSE prefix in a drill incident", async () => {
    const store = await storeWithWalkthrough();
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    const { message } = await composeStatusRequest(store, {
      incidentId: drill.id,
      operator: "Thomas",
      counterpartyId: HANS,
    });
    expect(message.text).toBe("ØVELSE #3 Meld status");
  });

  it("refuses a contact without a radio and an unknown id, and reserves nothing (P3-06)", async () => {
    const store = await storeWithWalkthrough();
    const grethe = await store.createRegisterEntry({ label: "Grethe", phone: "12 34 56 78" });
    const before = await store.lastDeviceSeq();
    await expect(
      composeStatusRequest(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        counterpartyId: grethe.id,
      }),
    ).rejects.toBeInstanceOf(RecipientError);
    await expect(
      composeStatusRequest(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2X00",
      }),
    ).rejects.toBeInstanceOf(RecipientError);
    expect(await store.lastSeqNo(grethe.id)).toBe(0);
    expect(await store.lastDeviceSeq()).toBe(before);
  });
});

describe("send by courier", () => {
  it("writes a courier copy with the same body and the next #n, and closes the original with roger and the reason", async () => {
    const store = await storeWithWalkthrough();
    const original = await givenUpToHans(store);
    expect(original.text).toBe("#3 Kør til nr 4");
    expect(bodyOf(original)).toBe("Kør til nr 4");
    const before = await store.lastDeviceSeq();

    const { copy, closed } = await resendByHand(store, original, {
      operator: "Anne",
      transport: "courier",
      body: bodyOf(original),
      reason: (message) => `sent by courier as #${message.seqNo}`,
    });
    expect(copy).toMatchObject({
      type: "message_out",
      transport: "courier",
      counterpartyId: HANS,
      seqNo: 4,
      text: "#4 Kør til nr 4",
      operator: "Anne",
      incidentId: INCIDENT,
    });
    expect(copy.refersTo).toBeUndefined();
    expect(copy.batchId).toBeUndefined();
    expect(await store.statusOf(copy.id)).toBe("pending");
    expect(closed).toMatchObject({
      type: "status_change",
      refersTo: original.id,
      newStatus: "roger",
      text: "sent by courier as #4",
      operator: "Anne",
    });
    expect(await store.statusOf(original.id)).toBe("roger");
    // Two entries, nothing else; the original is untouched.
    expect(await store.lastDeviceSeq()).toBe(before + 2);
    expect(await store.getEntry(original.id)).toEqual(original);
  });

  it("refuses a message that is not given up, and writes nothing", async () => {
    const store = await storeWithWalkthrough();
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: HANS,
      transport: "mesh",
      body: "x",
    });
    await appendStatusChange(store, message, "sent");
    const before = await store.lastDeviceSeq();
    const courier = {
      operator: "Anne",
      transport: "courier" as const,
      body: "x",
      reason: () => "r",
    };
    await expect(resendByHand(store, message, courier)).rejects.toThrow(HandoverError);
    const incoming = (await store.allEntries()).find(
      (entry) => entry.type === "message_in",
    ) as JournalEntry;
    await expect(resendByHand(store, incoming, courier)).rejects.toThrow(HandoverError);
    expect(await store.lastDeviceSeq()).toBe(before);
    expect(await store.lastSeqNo(HANS)).toBe(3);
  });

  it("the copy carries the text as recorded and the transport the form chose; the radio is refused", async () => {
    const store = await storeWithWalkthrough();
    const original = await givenUpToHans(store);
    const before = await store.lastDeviceSeq();
    await expect(
      resendByHand(store, original, {
        operator: "Anne",
        transport: "mesh",
        body: "Kør til nr 4",
        reason: () => "r",
      }),
    ).rejects.toThrow(HandoverError);
    expect(await store.lastDeviceSeq()).toBe(before);
    expect(await store.statusOf(original.id)).toBe("given_up");

    const { copy, closed } = await resendByHand(store, original, {
      operator: "Anne",
      transport: "phone",
      body: "Kør til nr 4, Peter har nøglen",
      reason: (message) => `sent via Phone as #${message.seqNo}`,
    });
    expect(copy).toMatchObject({
      transport: "phone",
      seqNo: 4,
      text: "#4 Kør til nr 4, Peter har nøglen",
    });
    expect(closed.text).toBe("sent via Phone as #4");
    expect(await store.statusOf(original.id)).toBe("roger");
  });

  it("a given-up courier message can be sent by courier again; the copy is a fresh courier message", async () => {
    const store = await storeWithWalkthrough();
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: HANS,
      transport: "courier",
      body: "Pumpe",
    });
    await appendStatusChange(store, message, "given_up", "Peter kom tilbage med sedlen");
    const { copy } = await resendByHand(store, message, {
      operator: "Thomas",
      transport: "courier",
      body: bodyOf(message),
      reason: (c) => `again as #${c.seqNo}`,
    });
    expect(copy.text).toBe("#4 Pumpe");
    expect(copy.transport).toBe("courier");
    expect(await store.statusOf(message.id)).toBe("roger");
  });

  it("in a drill the copy carries the ØVELSE prefix once, read off the original's body", async () => {
    const store = await storeWithWalkthrough();
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    const { message } = await composeMessage(store, {
      incidentId: drill.id,
      operator: "Thomas",
      counterpartyId: HANS,
      transport: "mesh",
      body: "Meld status",
    });
    expect(message.text).toBe("ØVELSE #3 Meld status");
    await appendStatusChange(store, message, "given_up", "no radio");
    const { copy } = await resendByHand(store, message, {
      operator: "Thomas",
      transport: "courier",
      body: bodyOf(message),
      reason: () => "r",
    });
    expect(copy.text).toBe("ØVELSE #4 Meld status");
  });
});
