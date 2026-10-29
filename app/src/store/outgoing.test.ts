import { describe, expect, it } from "vitest";
import { openTestStore, uniqueDatabaseName } from "../test-support/testStore.ts";
import { MAX_TEXT_LEN } from "../radio/serial.ts";
import {
  BatchComposeError,
  EmptyMessageError,
  MAX_MESSAGE_BYTES,
  ManualStatusError,
  MessageTooLongError,
  REPLY_SNIPPET_LENGTH,
  ReplyTargetError,
  appendStatusChange,
  batchPreview,
  byteLength,
  composeBatch,
  composeMessage,
  composeText,
  manualStatusesFor,
  previewText,
  recordManualStatus,
  replySnippet,
  seqNoPrefix,
} from "./outgoing.ts";
import { ValidationError } from "./schema.ts";
import type { JournalStore } from "./journalStore.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const PETER = "01JB8ZK3QX9V2M4N6P8R0T2W70";

function compose(store: JournalStore, body: string, counterpartyId = HANS, transport: "mesh" | "courier" | "phone" | "verbal" = "mesh") {
  return composeMessage(store, { incidentId: INCIDENT, operator: "Thomas", counterpartyId, transport, body });
}

// A body that makes "#<seqNo> <body>" exactly `total` bytes.
function bodyOfBytes(seqNo: number, total: number): string {
  return "x".repeat(total - seqNoPrefix(seqNo).length);
}

describe("the #n prefix and the byte limit", () => {
  it("agrees with the radio layer on 160 bytes", () => {
    expect(MAX_MESSAGE_BYTES).toBe(160);
    expect(MAX_MESSAGE_BYTES).toBe(MAX_TEXT_LEN);
  });

  it("counts bytes of UTF-8, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("æøå")).toBe(6);
    expect(byteLength("#12 ")).toBe(4);
    expect(byteLength("")).toBe(0);
  });

  it("builds the prefix as '#n ' with no leading zeros and one space", () => {
    expect(seqNoPrefix(1)).toBe("#1 ");
    expect(seqNoPrefix(12)).toBe("#12 ");
    expect(seqNoPrefix(1000)).toBe("#1000 ");
    expect(() => seqNoPrefix(0)).toThrow(RangeError);
    expect(() => seqNoPrefix(1.5)).toThrow(RangeError);
    expect(() => seqNoPrefix(-3)).toThrow(RangeError);
  });

  it("composes the text as transmitted, trimming the body", () => {
    expect(composeText(1, "Meld status for Nørregade")).toBe("#1 Meld status for Nørregade");
    expect(composeText(7, "  kør til nr 4 \n")).toBe("#7 kør til nr 4");
  });

  it("refuses an empty body", () => {
    expect(() => composeText(1, "")).toThrow(EmptyMessageError);
    expect(() => composeText(1, "   \n")).toThrow(EmptyMessageError);
  });

  it("sends exactly 160 bytes including the prefix and refuses 161", () => {
    expect(byteLength(composeText(1, bodyOfBytes(1, 160)))).toBe(160);
    expect(() => composeText(1, bodyOfBytes(1, 161))).toThrow(MessageTooLongError);
    // Danish letters count double: 78 "æ" = 156 bytes + "#1 " = 159; 79 is 161.
    expect(byteLength(composeText(1, "æ".repeat(78)))).toBe(159);
    expect(() => composeText(1, "æ".repeat(79))).toThrow(MessageTooLongError);
  });

  it("the prefix's own bytes count: a longer n leaves less room", () => {
    const body = bodyOfBytes(9, 160); // fits with "#9 "
    expect(byteLength(composeText(9, body))).toBe(160);
    expect(() => composeText(10, body)).toThrow(MessageTooLongError);
  });

  it("previews the predicted prefix, bytes and whether it may be sent", () => {
    expect(previewText(0, "hej")).toEqual({ seqNo: 1, prefix: "#1 ", bytes: 6, empty: false, tooLong: false });
    expect(previewText(11, "")).toEqual({ seqNo: 12, prefix: "#12 ", bytes: 4, empty: true, tooLong: false });
    expect(previewText(0, bodyOfBytes(1, 160)).tooLong).toBe(false);
    expect(previewText(0, bodyOfBytes(1, 161)).tooLong).toBe(true);
    expect(previewText(0, bodyOfBytes(1, 161)).bytes).toBe(161);
  });

  it("a batch previews with the longest prefix among the chosen recipients (P0-08)", () => {
    expect(batchPreview([0, 11, 3], "hej")).toEqual(previewText(11, "hej"));
    expect(batchPreview([], "hej")).toEqual(previewText(0, "hej"));
    // Fits every recipient at #9 or below, not one at #10.
    const body = bodyOfBytes(9, 160);
    expect(batchPreview([2, 8], body).tooLong).toBe(false);
    expect(batchPreview([2, 9], body).tooLong).toBe(true);
  });
});

describe("composeBatch (send to all, P0-08)", () => {
  const ANNE = "01JB8ZK3QX9V2M4N6P8R0T2W90";
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  it("stores one mesh message_out per recipient with that recipient's own next #n, all pending, all with one batchId", async () => {
    const store = await openTestStore();
    await compose(store, "earlier", HANS);
    await compose(store, "earlier", HANS);
    const batch = await composeBatch(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyIds: [HANS, PETER, ANNE],
      body: " Meld status ",
    });
    expect(batch.map((c) => [c.message.counterpartyId, c.message.seqNo, c.message.text])).toEqual([
      [HANS, 3, "#3 Meld status"],
      [PETER, 1, "#1 Meld status"],
      [ANNE, 1, "#1 Meld status"],
    ]);
    const batchId = batch[0]?.message.batchId ?? "";
    expect(batchId).toMatch(ULID);
    for (const { message } of batch) {
      expect(message.transport).toBe("mesh");
      expect(message.batchId).toBe(batchId);
      expect(await store.statusOf(message.id)).toBe("pending");
    }
    // Nothing but the messages themselves: no pending status change (P1-01).
    const all = await store.allEntries();
    expect(all).toHaveLength(5);
    expect(all.filter((e) => e.type === "message_out")).toHaveLength(5);
    // The two single sends before the batch have no batchId; a second batch gets its own.
    expect(all.filter((e) => e.batchId === undefined)).toHaveLength(2);
    const second = await composeBatch(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyIds: [HANS, PETER],
      body: "igen",
    });
    expect(second[0]?.message.batchId).toMatch(ULID);
    expect(second[0]?.message.batchId).not.toBe(batchId);
    expect(second[1]?.message.batchId).toBe(second[0]?.message.batchId);
    store.close();
  });

  it("refuses a repeated or empty recipient list before writing anything", async () => {
    const store = await openTestStore();
    await expect(
      composeBatch(store, { incidentId: INCIDENT, operator: "Thomas", counterpartyIds: [HANS, HANS], body: "x" }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      composeBatch(store, { incidentId: INCIDENT, operator: "Thomas", counterpartyIds: [], body: "x" }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(await store.allEntries()).toEqual([]);
    store.close();
  });

  it("a failure in the middle keeps what was stored and says where it stopped", async () => {
    const store = await openTestStore();
    for (let i = 0; i < 9; i++) {
      await compose(store, "x", PETER);
    }
    // Fits "#1 " (Hans) and "#9 " but not Peter's "#10 ".
    const body = bodyOfBytes(9, 160);
    let failure: unknown;
    try {
      await composeBatch(store, { incidentId: INCIDENT, operator: "Thomas", counterpartyIds: [HANS, PETER, ANNE], body });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(BatchComposeError);
    const batchError = failure as BatchComposeError;
    expect(batchError.counterpartyId).toBe(PETER);
    expect(batchError.cause).toBeInstanceOf(MessageTooLongError);
    expect(batchError.stored.map((c) => c.message.counterpartyId)).toEqual([HANS]);
    expect(await store.statusOf(batchError.stored[0]?.message.id ?? "")).toBe("pending");
    // Nothing for Anne, and Peter's counter did not move.
    const outs = (await store.allEntries()).filter((e) => e.type === "message_out");
    expect(outs.filter((e) => e.counterpartyId === ANNE)).toHaveLength(0);
    expect(await store.lastSeqNo(PETER)).toBe(9);
    store.close();
  });
});

describe("composeMessage", () => {
  it("stores the message_out with #1 and nothing else; its status is pending (P1-01)", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "Meld status for Nørregade");
    expect(message.type).toBe("message_out");
    expect(message.transport).toBe("mesh");
    expect(message.counterpartyId).toBe(HANS);
    expect(message.seqNo).toBe(1);
    expect(message.batchId).toBeUndefined();
    expect(message.text).toBe("#1 Meld status for Nørregade");
    expect(await store.statusOf(message.id)).toBe("pending");
    expect(await store.lastSeqNo(HANS)).toBe(1);
    expect(await store.allEntries()).toEqual([message]);
    expect(await store.entriesReferringTo(message.id)).toEqual([]);
    store.close();
  });

  it("increments #n per recipient, independently", async () => {
    const store = await openTestStore();
    const a = await compose(store, "one");
    const b = await compose(store, "two");
    const p = await compose(store, "to Peter", PETER);
    const c = await compose(store, "three");
    expect([a.message.seqNo, b.message.seqNo, c.message.seqNo]).toEqual([1, 2, 3]);
    expect(p.message.seqNo).toBe(1);
    expect(c.message.text).toBe("#3 three");
    expect(p.message.text).toBe("#1 to Peter");
    store.close();
  });

  it("survives a restart between two sends", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    await compose(first, "one");
    await compose(first, "two");
    first.close();

    const second = await openTestStore({ name });
    const { message } = await compose(second, "three");
    expect(message.seqNo).toBe(3);
    expect(message.text).toBe("#3 three");
    expect(await second.lastSeqNo(HANS)).toBe(3);
    second.close();
  });

  it("the store path refuses 161 bytes and leaves the counter and the journal untouched", async () => {
    const store = await openTestStore();
    await expect(compose(store, bodyOfBytes(1, 161))).rejects.toBeInstanceOf(MessageTooLongError);
    expect(await store.lastSeqNo(HANS)).toBe(0);
    expect(await store.allEntries()).toEqual([]);
    expect(await store.lastDeviceSeq()).toBe(0);

    // The next send still gets #1: no gap from the refusal.
    const { message } = await compose(store, bodyOfBytes(1, 160));
    expect(message.seqNo).toBe(1);
    expect(byteLength(message.text ?? "")).toBe(160);
    store.close();
  });

  it("refuses an empty body before anything is reserved", async () => {
    const store = await openTestStore();
    await expect(compose(store, "  ")).rejects.toBeInstanceOf(EmptyMessageError);
    expect(await store.lastSeqNo(HANS)).toBe(0);
    expect(await store.allEntries()).toEqual([]);
    store.close();
  });

  it("the limit is checked against the number actually reserved", async () => {
    const store = await openTestStore();
    for (let i = 0; i < 9; i++) {
      await compose(store, "x");
    }
    expect(await store.lastSeqNo(HANS)).toBe(9);
    // "#10 " is one byte longer than "#9 ", so a body that fits #9 does not fit #10.
    await expect(compose(store, bodyOfBytes(9, 160))).rejects.toBeInstanceOf(MessageTooLongError);
    expect(await store.lastSeqNo(HANS)).toBe(9);
    const { message } = await compose(store, bodyOfBytes(10, 160));
    expect(message.seqNo).toBe(10);
    store.close();
  });

  it("a non-mesh message is stored alone too; its derived status is pending", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "Pumpe på vej med Peter på cykel", HANS, "courier");
    expect(message.transport).toBe("courier");
    expect(message.text).toBe("#1 Pumpe på vej med Peter på cykel");
    expect(await store.statusOf(message.id)).toBe("pending");
    expect(await store.allEntries()).toHaveLength(1);
    store.close();
  });

  it("an invalid input is rejected by the schema and reserves nothing", async () => {
    const store = await openTestStore();
    await expect(
      composeMessage(store, { incidentId: "not-a-ulid", operator: "Thomas", counterpartyId: HANS, transport: "mesh", body: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await store.lastSeqNo(HANS)).toBe(0);
    expect(await store.allEntries()).toEqual([]);
    store.close();
  });
});

describe("reply from the row (P1-02)", () => {
  const DEDUPE = "18d73efd29124c872895031fd9c2d8c286a29e476c6b7b52e32f35c384e87064";

  async function incoming(store: JournalStore, text: string, transport: "mesh" | "courier" = "mesh") {
    return await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "message_in",
      transport,
      counterpartyId: HANS,
      text,
      dedupeKey: transport === "mesh" ? DEDUPE : undefined,
    });
  }

  it("a reply is a message_out with refersTo = the incoming entry's id and the recipient's next #n", async () => {
    const store = await openTestStore();
    await compose(store, "Meld status for Nørregade");
    const question = await incoming(store, "vedr. #1 alle ok, kælder i nr 4 har vand");
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: HANS,
      transport: "mesh",
      body: "Pumpe på vej",
      refersTo: question.id,
    });
    expect(message.type).toBe("message_out");
    expect(message.refersTo).toBe(question.id);
    expect(message.seqNo).toBe(2);
    expect(message.text).toBe("#2 Pumpe på vej");
    expect(message.counterpartyId).toBe(HANS);
    expect(await store.statusOf(message.id)).toBe("pending");
    // The link is on the reply only; the incoming entry is untouched (entries are immutable).
    expect(await store.getEntry(question.id)).toEqual(question);
    expect(await store.entriesReferringTo(question.id)).toEqual([message]);
    store.close();
  });

  it("a courier note is answered by courier when the form says so; the transport is the caller's", async () => {
    const store = await openTestStore();
    const note = await incoming(store, "Kælderen er tør nu", "courier");
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: HANS,
      transport: "courier",
      body: "Tak, kom tilbage til staben",
      refersTo: note.id,
    });
    expect(message.transport).toBe("courier");
    expect(message.refersTo).toBe(note.id);
    store.close();
  });

  it("without refersTo the message carries none (the ✕ dropped the link)", async () => {
    const store = await openTestStore();
    await incoming(store, "hej");
    const { message } = await compose(store, "svar uden kobling");
    expect(message.refersTo).toBeUndefined();
    expect("refersTo" in message).toBe(false);
    store.close();
  });

  it("refuses a reply to an entry that is not a stored message_in, and reserves nothing", async () => {
    const store = await openTestStore();
    const { message: order } = await compose(store, "x");
    for (const refersTo of ["01JB8ZK3QX9V2M4N6P8R0T2X00", order.id]) {
      await expect(
        composeMessage(store, {
          incidentId: INCIDENT,
          operator: "Thomas",
          counterpartyId: HANS,
          transport: "mesh",
          body: "y",
          refersTo,
        }),
      ).rejects.toBeInstanceOf(ReplyTargetError);
    }
    expect(await store.lastSeqNo(HANS)).toBe(1);
    expect(await store.allEntries()).toEqual([order]);
    store.close();
  });

  it("the snippet is the first 60 characters with an ellipsis when cut, counted in characters", () => {
    expect(REPLY_SNIPPET_LENGTH).toBe(60);
    expect(replySnippet("vedr. #1 alle ok")).toBe("vedr. #1 alle ok");
    expect(replySnippet("x".repeat(60))).toBe("x".repeat(60));
    expect(replySnippet("x".repeat(61))).toBe(`${"x".repeat(60)}…`);
    // Danish letters and an emoji are one character each, never split.
    expect(replySnippet("æ".repeat(70))).toBe(`${"æ".repeat(60)}…`);
    expect(replySnippet("😀".repeat(61))).toBe(`${"😀".repeat(60)}…`);
    expect(replySnippet("abcdef", 3)).toBe("abc…");
    expect(replySnippet("")).toBe("");
  });
});

describe("status changes", () => {
  it("appendStatusChange walks the chain and the latest wins", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "x");
    await appendStatusChange(store, message, "sent");
    expect(await store.statusOf(message.id)).toBe("sent");
    const delivered = await appendStatusChange(store, message, "delivered", "round trip 1234 ms");
    expect(delivered.text).toBe("round trip 1234 ms");
    expect(delivered.operator).toBe("Thomas");
    expect(await store.statusOf(message.id)).toBe("delivered");
    store.close();
  });

  it("the operator sets sent, delivered, roger and given_up by hand on a courier message", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "Pumpe på vej", HANS, "courier");
    const sent = await recordManualStatus(store, message, "sent", { operator: "Anne", text: "Peter cyklede 19:10" });
    expect(sent.newStatus).toBe("sent");
    expect(sent.text).toBe("Peter cyklede 19:10");
    expect(sent.operator).toBe("Anne");
    expect(await store.statusOf(message.id)).toBe("sent");

    const delivered = await recordManualStatus(store, message, "delivered", {
      operator: "Anne",
      text: "  Peter tilbage 19:40  ",
    });
    expect(delivered.text).toBe("Peter tilbage 19:40");
    expect(await store.statusOf(message.id)).toBe("delivered");

    await recordManualStatus(store, message, "roger", { operator: "Anne", text: "sagde ok i telefonen" });
    expect(await store.statusOf(message.id)).toBe("roger");
    store.close();
  });

  it("a manual status change needs a reason (P0-07)", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "x", HANS, "courier");
    await expect(recordManualStatus(store, message, "sent", { operator: "Anne", text: "" })).rejects.toBeInstanceOf(
      ManualStatusError,
    );
    await expect(recordManualStatus(store, message, "sent", { operator: "Anne", text: " \n " })).rejects.toBeInstanceOf(
      ManualStatusError,
    );
    expect(await store.statusOf(message.id)).toBe("pending");
    expect(await store.lastDeviceSeq()).toBe(1);
    store.close();
  });

  it("roger is final for a manual status too", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "x", HANS, "phone");
    await recordManualStatus(store, message, "roger", { operator: "Anne", text: "ok" });
    await expect(
      recordManualStatus(store, message, "given_up", { operator: "Anne", text: "ok" }),
    ).rejects.toBeInstanceOf(ManualStatusError);
    expect(await store.statusOf(message.id)).toBe("roger");
    store.close();
  });

  it("on a mesh message the operator may give up or record a roger, but sent and delivered are the radio's", async () => {
    const store = await openTestStore();
    expect(manualStatusesFor("mesh")).toEqual(["roger", "given_up"]);
    expect(manualStatusesFor("courier")).toEqual(["sent", "delivered", "roger", "given_up"]);

    const stuck = await compose(store, "x");
    await appendStatusChange(store, stuck.message, "sent");
    await expect(
      recordManualStatus(store, stuck.message, "delivered", { operator: "Anne", text: "r" }),
    ).rejects.toBeInstanceOf(ManualStatusError);
    await expect(
      recordManualStatus(store, stuck.message, "sent", { operator: "Anne", text: "r" }),
    ).rejects.toBeInstanceOf(ManualStatusError);
    const givenUp = await recordManualStatus(store, stuck.message, "given_up", {
      operator: "Anne",
      text: "browser reloaded mid-send, no receipt",
    });
    expect(givenUp.newStatus).toBe("given_up");
    expect(givenUp.text).toBe("browser reloaded mid-send, no receipt");
    expect(await store.statusOf(stuck.message.id)).toBe("given_up");

    const byPhone = await compose(store, "y");
    await appendStatusChange(store, byPhone.message, "sent");
    await recordManualStatus(store, byPhone.message, "roger", { operator: "Anne", text: "Hans rang: modtaget" });
    expect(await store.statusOf(byPhone.message.id)).toBe("roger");
    store.close();
  });

  it("a manual given_up or roger on a mesh message needs a reason too, and the reason is the status change's text (P1-03)", async () => {
    const store = await openTestStore();
    const { message } = await compose(store, "x");
    await appendStatusChange(store, message, "sent");
    const seqBefore = await store.lastDeviceSeq();
    for (const status of ["given_up", "roger"] as const) {
      await expect(recordManualStatus(store, message, status, { operator: "Anne", text: "" })).rejects.toBeInstanceOf(
        ManualStatusError,
      );
      await expect(
        recordManualStatus(store, message, status, { operator: "Anne", text: " \t " }),
      ).rejects.toBeInstanceOf(ManualStatusError);
    }
    // Nothing was written by the refusals.
    expect(await store.statusOf(message.id)).toBe("sent");
    expect(await store.lastDeviceSeq()).toBe(seqBefore);

    const roger = await recordManualStatus(store, message, "roger", { operator: "Anne", text: "  sagde ok på vej forbi  " });
    expect(roger.type).toBe("status_change");
    expect(roger.refersTo).toBe(message.id);
    expect(roger.newStatus).toBe("roger");
    expect(roger.text).toBe("sagde ok på vej forbi");
    expect(roger.operator).toBe("Anne");
    expect(await store.statusOf(message.id)).toBe("roger");
    store.close();
  });

  it("refuses a manual status on a non-message and a status that is not manual", async () => {
    const store = await openTestStore();
    const courier = await compose(store, "y", HANS, "courier");
    await expect(
      recordManualStatus(store, courier.message, "pending", { operator: "Anne", text: "r" }),
    ).rejects.toBeInstanceOf(ManualStatusError);
    await expect(
      recordManualStatus(store, courier.message, "closed", { operator: "Anne", text: "r" }),
    ).rejects.toBeInstanceOf(ManualStatusError);
    const note = await store.appendEntry({ incidentId: INCIDENT, operator: "Anne", type: "note", text: "n" });
    await expect(recordManualStatus(store, note, "sent", { operator: "Anne", text: "r" })).rejects.toBeInstanceOf(
      ManualStatusError,
    );
    expect(await store.statusOf(courier.message.id)).toBe("pending");
    store.close();
  });
});
