// contract/text-protocol.md, "Incoming: field → staff": one test per rule and per
// counter-example, run through the store on fake-indexeddb so the derived status is the real
// one.

import { describe, expect, it } from "vitest";
import { openTestStore, uniqueDatabaseName } from "../test-support/testStore.ts";
import { dedupeKey } from "./dedupeKey.ts";
import {
  BARE_ROGER,
  IncomingError,
  NUMBERED_ROGER,
  applyIncoming,
  chooseRoger,
  isOpenForRoger,
  parseRoger,
} from "./incoming.ts";
import type { JournalStore } from "./journalStore.ts";
import { appendStatusChange } from "./outgoing.ts";
import type { JournalEntry, Status } from "./types.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const PETER = "01JB8ZK3QX9V2M4N6P8R0T2W70";
const HANS_KEY = "7a".repeat(32);
const OTHER_DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W99";

let senderTimestamp = 1793214220;

// A message_out #n to the counterparty, walked to `status` through status_change entries
// (pending is the derived status of a message with none).
async function out(
  store: JournalStore,
  seqNo: number,
  status: Status,
  counterpartyId = HANS,
): Promise<JournalEntry> {
  const message = await store.appendEntry({
    incidentId: INCIDENT,
    operator: "Thomas",
    type: "message_out",
    transport: "mesh",
    counterpartyId,
    seqNo,
    text: `#${seqNo} x`,
  });
  const chain: Status[] = ["pending"];
  if (status !== "pending") {
    chain.push("sent");
  }
  if (status === "delivered" || status === "roger") {
    chain.push("delivered");
  }
  if (status === "roger" || status === "given_up") {
    chain.push(status);
  }
  for (const step of chain) {
    await appendStatusChange(store, message, step);
  }
  expect(await store.statusOf(message.id)).toBe(status);
  return message;
}

// What the inbox does: store the message_in first, then apply the rules.
async function receive(store: JournalStore, text: string, counterpartyId = HANS) {
  senderTimestamp += 1;
  const incoming = await store.appendEntry({
    incidentId: INCIDENT,
    operator: "Thomas",
    type: "message_in",
    transport: "mesh",
    counterpartyId,
    text,
    dedupeKey: await dedupeKey(HANS_KEY, senderTimestamp, text),
  });
  const roger = await applyIncoming(store, incoming);
  return { incoming, roger };
}

async function statusChanges(store: JournalStore, message: JournalEntry): Promise<JournalEntry[]> {
  return (await store.entriesReferringTo(message.id)).filter(
    (entry) => entry.type === "status_change",
  );
}

describe("the regexes are the contract's", () => {
  it("numbered roger: ^[Rr]([1-9][0-9]*)$", () => {
    expect(NUMBERED_ROGER.source).toBe("^[Rr]([1-9][0-9]*)$");
    expect(BARE_ROGER.source).toBe("^[Rr]$");
  });

  it("parseRoger: R12 and r12 are numbered, R and r bare, the rest plain", () => {
    expect(parseRoger("R12")).toEqual({ rule: "numbered", n: 12 });
    expect(parseRoger("r12")).toEqual({ rule: "numbered", n: 12 });
    expect(parseRoger("R1")).toEqual({ rule: "numbered", n: 1 });
    expect(parseRoger("R")).toEqual({ rule: "bare" });
    expect(parseRoger("r")).toEqual({ rule: "bare" });
    for (const plain of [
      "R 12",
      "R12.",
      "roger",
      "R12 tak",
      "R0",
      "R012",
      "RR12",
      "12",
      "",
      "vedr. #12 kælderen er tør",
    ]) {
      expect(parseRoger(plain), plain).toEqual({ rule: "plain" });
    }
  });

  it("trims leading and trailing whitespace before matching, nothing else", () => {
    expect(parseRoger("  R12 \n")).toEqual({ rule: "numbered", n: 12 });
    expect(parseRoger("\tR\r\n")).toEqual({ rule: "bare" });
    // A no-break space is whitespace too (String.prototype.trim); a phone keyboard may add one.
    expect(parseRoger("R12\u00a0")).toEqual({ rule: "numbered", n: 12 });
    expect(parseRoger("R 12")).toEqual({ rule: "plain" });
  });

  it("only sent and delivered are open for a roger", () => {
    expect(isOpenForRoger("sent")).toBe(true);
    expect(isOpenForRoger("delivered")).toBe(true);
    for (const closed of ["pending", "roger", "given_up", "closed", "reopened"] as const) {
      expect(isOpenForRoger(closed)).toBe(false);
    }
  });

  it("chooseRoger picks the exact n, or the highest open n, or nothing", () => {
    const message = (seqNo: number) => ({ id: `m${seqNo}`, seqNo }) as unknown as JournalEntry;
    const candidates = [
      { message: message(3), status: "delivered" as const },
      { message: message(5), status: "sent" as const },
      { message: message(7), status: "roger" as const },
      { message: message(8), status: "given_up" as const },
    ];
    expect(chooseRoger({ rule: "numbered", n: 3 }, candidates)?.id).toBe("m3");
    expect(chooseRoger({ rule: "numbered", n: 7 }, candidates)).toBeNull();
    expect(chooseRoger({ rule: "numbered", n: 9 }, candidates)).toBeNull();
    expect(chooseRoger({ rule: "bare" }, candidates)?.id).toBe("m5");
    expect(chooseRoger({ rule: "bare" }, [])).toBeNull();
    expect(chooseRoger({ rule: "plain" }, candidates)).toBeNull();
  });
});

describe("rule 1: numbered roger", () => {
  it("R12 closes #12 when it is sent", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "sent");
    const { incoming, roger } = await receive(store, "R12");
    expect(roger).not.toBeNull();
    expect(roger).toMatchObject({
      type: "status_change",
      refersTo: message.id,
      newStatus: "roger",
      text: incoming.id,
      incidentId: INCIDENT,
      operator: "Thomas",
    });
    expect(roger?.counterpartyId).toBeUndefined();
    expect(await store.statusOf(message.id)).toBe("roger");
    expect(await store.getEntry(incoming.id)).toMatchObject({ type: "message_in", text: "R12" });
  });

  it("R12 closes #12 when it is delivered", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "delivered");
    const { roger } = await receive(store, "R12");
    expect(roger?.refersTo).toBe(message.id);
    expect(await store.statusOf(message.id)).toBe("roger");
  });

  it("R12 when #12 is already roger: plain message, no status change", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "roger");
    const before = await statusChanges(store, message);
    const { incoming, roger } = await receive(store, "R12");
    expect(roger).toBeNull();
    expect(await statusChanges(store, message)).toEqual(before);
    expect(await store.getEntry(incoming.id)).toMatchObject({ type: "message_in", text: "R12" });
  });

  it("R12 for a given-up #12: plain", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "given_up");
    const { roger } = await receive(store, "R12");
    expect(roger).toBeNull();
    expect(await store.statusOf(message.id)).toBe("given_up");
  });

  it("R12 for a pending #12 (not yet handed to the radio): plain", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "pending");
    const { roger } = await receive(store, "R12");
    expect(roger).toBeNull();
    expect(await store.statusOf(message.id)).toBe("pending");
  });

  it("R12 for an unknown n: plain, and nothing else is guessed at", async () => {
    const store = await openTestStore();
    const eleven = await out(store, 11, "sent");
    const thirteen = await out(store, 13, "delivered");
    const { roger } = await receive(store, "R12");
    expect(roger).toBeNull();
    expect(await store.statusOf(eleven.id)).toBe("sent");
    expect(await store.statusOf(thirteen.id)).toBe("delivered");
  });

  it("r12 is R12", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "sent");
    const { roger } = await receive(store, "r12");
    expect(roger?.refersTo).toBe(message.id);
  });

  it("R12 from another counterparty does not close this one's #12", async () => {
    const store = await openTestStore();
    const hans12 = await out(store, 12, "sent", HANS);
    const { roger } = await receive(store, "R12", PETER);
    expect(roger).toBeNull();
    expect(await store.statusOf(hans12.id)).toBe("sent");
  });

  it("R12 does not close a #12 another device sent", async () => {
    const name = uniqueDatabaseName();
    const other = await openTestStore({ name, deviceId: OTHER_DEVICE });
    const theirs = await out(other, 12, "sent");
    other.close();
    const store = await openTestStore({ name });
    const { roger } = await receive(store, "R12");
    expect(roger).toBeNull();
    expect(await store.statusOf(theirs.id)).toBe("sent");
  });

  it("leading and trailing whitespace is trimmed before matching", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "sent");
    const { incoming, roger } = await receive(store, "  R12 \n");
    expect(roger?.refersTo).toBe(message.id);
    // The message_in keeps the text as received.
    expect(incoming.text).toBe("  R12 \n");
  });
});

describe("rule 2: bare roger", () => {
  it("R closes the highest open n: sent and delivered count, roger and given_up do not", async () => {
    const store = await openTestStore();
    const three = await out(store, 3, "delivered");
    const five = await out(store, 5, "sent");
    const seven = await out(store, 7, "roger");
    const eight = await out(store, 8, "given_up");
    const { roger } = await receive(store, "R");
    expect(roger?.refersTo).toBe(five.id);
    expect(await store.statusOf(five.id)).toBe("roger");
    expect(await store.statusOf(three.id)).toBe("delivered");
    expect(await store.statusOf(seven.id)).toBe("roger");
    expect(await store.statusOf(eight.id)).toBe("given_up");
  });

  it("r is R", async () => {
    const store = await openTestStore();
    const one = await out(store, 1, "sent");
    const { roger } = await receive(store, "r");
    expect(roger?.refersTo).toBe(one.id);
  });

  it("R with nothing open: plain", async () => {
    const store = await openTestStore();
    const one = await out(store, 1, "roger");
    const two = await out(store, 2, "given_up");
    const three = await out(store, 3, "pending");
    const { incoming, roger } = await receive(store, "R");
    expect(roger).toBeNull();
    expect(await store.statusOf(one.id)).toBe("roger");
    expect(await store.statusOf(two.id)).toBe("given_up");
    expect(await store.statusOf(three.id)).toBe("pending");
    expect(await store.getEntry(incoming.id)).toMatchObject({ type: "message_in", text: "R" });
  });

  it("R with no messages at all: plain", async () => {
    const store = await openTestStore();
    const { roger } = await receive(store, "R");
    expect(roger).toBeNull();
  });

  it("two bare rogers close the two highest, one after the other", async () => {
    const store = await openTestStore();
    const one = await out(store, 1, "sent");
    const two = await out(store, 2, "sent");
    expect((await receive(store, "R")).roger?.refersTo).toBe(two.id);
    expect((await receive(store, "R")).roger?.refersTo).toBe(one.id);
    expect((await receive(store, "R")).roger).toBeNull();
  });
});

describe("rule 3: anything else is an ordinary incoming message", () => {
  for (const text of ["R 12", "R12.", "roger", "R12 tak", "Roger 12", "R\u00a012", "#12"]) {
    it(`${JSON.stringify(text)} is plain even with #12 open`, async () => {
      const store = await openTestStore();
      const message = await out(store, 12, "sent");
      const { incoming, roger } = await receive(store, text);
      expect(roger).toBeNull();
      expect(await store.statusOf(message.id)).toBe("sent");
      expect(await store.getEntry(incoming.id)).toMatchObject({ type: "message_in", text });
    });
  }

  it("vedr. #12 is plain and is not linked to #12", async () => {
    const store = await openTestStore();
    const message = await out(store, 12, "delivered");
    const { incoming, roger } = await receive(store, "vedr. #12 kælderen er tør");
    expect(roger).toBeNull();
    expect(await store.statusOf(message.id)).toBe("delivered");
    expect(incoming.refersTo).toBeUndefined();
    expect(await store.entriesReferringTo(message.id)).not.toContainEqual(
      expect.objectContaining({ type: "message_in" }),
    );
  });
});

describe("applyIncoming refusals", () => {
  it("refuses anything but a message_in", async () => {
    const store = await openTestStore();
    const message = await out(store, 1, "sent");
    await expect(applyIncoming(store, message)).rejects.toBeInstanceOf(IncomingError);
  });
});

describe("dedupe at the store", () => {
  it("the same message delivered twice produces one message_in", async () => {
    const store = await openTestStore();
    const key = await dedupeKey(HANS_KEY, 1793214220, "R1");
    const input = {
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "message_in" as const,
      transport: "mesh" as const,
      counterpartyId: HANS,
      text: "R1",
      dedupeKey: key,
    };
    const first = await store.appendEntry(input);
    const second = await store.appendEntry(input);
    expect(second).toEqual(first);
    expect((await store.allEntries()).filter((entry) => entry.type === "message_in")).toHaveLength(
      1,
    );
    expect(await store.lastDeviceSeq()).toBe(1);
  });
});

describe("lastHeardAt per register entry", () => {
  it("is null before anything came in, then the latest message_in's timestamp", async () => {
    const store = await openTestStore();
    expect(await store.lastHeardAt(HANS)).toBeNull();
    await out(store, 1, "sent");
    expect(await store.lastHeardAt(HANS)).toBeNull();
    const { incoming: first } = await receive(store, "hej");
    expect(await store.lastHeardAt(HANS)).toBe(first.timestamp);
    const { incoming: second } = await receive(store, "R1");
    expect(await store.lastHeardAt(HANS)).toBe(second.timestamp);
    expect(Date.parse(second.timestamp)).toBeGreaterThan(Date.parse(first.timestamp));
    expect(await store.lastHeardAt(PETER)).toBeNull();
  });
});
