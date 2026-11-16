import { describe, expect, it } from "vitest";
import { hasStatusChain, latestStatusChange, statusOf } from "./status.ts";
import type { JournalEntry, Status } from "./types.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";

const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";
const OTHER_DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W00";
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const MESSAGE = "01JB8ZK3QX9V2M4N6P8R0T2W51";
const OTHER_MESSAGE = "01JB8ZK3QX9V2M4N6P8R0T2W59";

// Ids that sort in the order given, so tests can state which id is "later".
function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T2X${n.toString().padStart(2, "0")}`;
}

// A message_out with the given id: over the radio with its #n, or by another transport as a
// plain record (no seqNo, P3-07).
function messageOut(messageId: string, transport: JournalEntry["transport"] = "mesh"): JournalEntry {
  return {
    id: messageId,
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: 1,
    timestamp: "2026-10-28T19:00:00Z",
    clockTrust: "manual",
    operator: "Thomas",
    type: "message_out",
    transport,
    counterpartyId: HANS,
    ...(transport === "mesh" ? { seqNo: 1, text: "#1 Meld status" } : { text: "Meld status" }),
  };
}

const message = messageOut(MESSAGE);
const otherMessage = messageOut(OTHER_MESSAGE);

interface ChangeOptions {
  seq: number;
  at: string;
  to: Status;
  refersTo?: string;
  deviceId?: string;
  id?: string;
}

function change(options: ChangeOptions): JournalEntry {
  return {
    id: options.id ?? id(options.seq),
    incidentId: INCIDENT,
    deviceId: options.deviceId ?? DEVICE,
    deviceSeq: options.seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "status_change",
    refersTo: options.refersTo ?? MESSAGE,
    newStatus: options.to,
  };
}

describe("hasStatusChain", () => {
  it("is true for a mesh message_out and nothing else (P3-07)", () => {
    expect(hasStatusChain(message)).toBe(true);
    for (const transport of ["phone", "courier", "verbal"] as const) {
      expect(hasStatusChain(messageOut(id(1), transport))).toBe(false);
    }
    expect(hasStatusChain(change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }))).toBe(false);
    expect(hasStatusChain({ ...message, type: "message_in" })).toBe(false);
    expect(hasStatusChain({ ...message, type: "note", transport: undefined })).toBe(false);
  });
});

describe("statusOf", () => {
  it("is pending when nothing refers to the message", () => {
    expect(statusOf([], message)).toBe("pending");
    expect(
      statusOf([change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", refersTo: OTHER_MESSAGE })], message),
    ).toBe("pending");
  });

  it("is null for a message by phone, courier or verbal, whatever refers to it (P3-07)", () => {
    for (const transport of ["phone", "courier", "verbal"] as const) {
      const plain = messageOut(id(9), transport);
      expect(statusOf([], plain)).toBeNull();
      // A status change referring to it (which the store never writes) does not give it one.
      expect(statusOf([change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", refersTo: plain.id })], plain)).toBeNull();
    }
    // Nothing but a message_out has a status.
    expect(statusOf([change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", refersTo: id(9) })], { ...message, id: id(9), type: "note" })).toBeNull();
  });

  it("follows the chain in the contract walkthrough: #1 roger, the courier record nothing", () => {
    const { entries } = loadWalkthrough();
    const order1 = entries.find((entry) => entry.id === MESSAGE) as JournalEntry;
    const courier = entries.find((entry) => entry.id === OTHER_MESSAGE) as JournalEntry;
    expect(statusOf(entries, order1)).toBe("roger");
    expect(courier.transport).toBe("courier");
    expect(courier.seqNo).toBeUndefined();
    expect(statusOf(entries, courier)).toBeNull();
    expect(entries.some((entry) => entry.type === "status_change" && entry.refersTo === courier.id)).toBe(false);
    expect(latestStatusChange(entries, INCIDENT)?.newStatus).toBe("closed");
  });

  it("follows pending → sent → delivered → roger, whatever order the entries are read in", () => {
    const chain = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "pending" }),
      change({ seq: 2, at: "2026-10-28T19:00:02Z", to: "sent" }),
      change({ seq: 3, at: "2026-10-28T19:00:09Z", to: "delivered" }),
      change({ seq: 4, at: "2026-10-28T19:03:40Z", to: "roger" }),
    ];
    expect(statusOf(chain.slice(0, 1), message)).toBe("pending");
    expect(statusOf(chain.slice(0, 2), message)).toBe("sent");
    expect(statusOf(chain.slice(0, 3), message)).toBe("delivered");
    expect(statusOf(chain, message)).toBe("roger");
    expect(statusOf([...chain].reverse(), message)).toBe("roger");
  });

  it("goes back from given_up to sent on a manual retry", () => {
    const chain = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:04:00Z", to: "given_up" }),
    ];
    expect(statusOf(chain, message)).toBe("given_up");
    chain.push(change({ seq: 3, at: "2026-10-28T19:06:00Z", to: "sent" }));
    expect(statusOf(chain, message)).toBe("sent");
    chain.push(change({ seq: 4, at: "2026-10-28T19:06:30Z", to: "delivered" }));
    expect(statusOf(chain, message)).toBe("delivered");
  });

  it("picks by timestamp first, even when deviceSeq says otherwise", () => {
    const entries = [
      change({ seq: 9, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:00:01Z", to: "delivered" }),
    ];
    expect(statusOf(entries, message)).toBe("delivered");
  });

  it("breaks a timestamp tie by deviceSeq", () => {
    const entries = [
      change({ seq: 3, at: "2026-10-28T19:00:00Z", to: "delivered" }),
      change({ seq: 2, at: "2026-10-28T19:00:00Z", to: "sent" }),
    ];
    expect(statusOf(entries, message)).toBe("delivered");
    expect(statusOf([...entries].reverse(), message)).toBe("delivered");
  });

  it("compares timestamps as instants, not as strings", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T21:00:00+02:00", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:00:00Z", to: "delivered" }),
    ];
    // Same instant: deviceSeq decides.
    expect(statusOf(entries, message)).toBe("delivered");
    const later = [
      change({ seq: 1, at: "2026-10-28T19:00:01Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T21:00:00+02:00", to: "delivered" }),
    ];
    // 19:00:01Z is after 19:00:00Z however it is spelled.
    expect(statusOf(later, message)).toBe("sent");
  });

  it("breaks a tie on timestamp and deviceSeq across devices by id", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", id: id(1) }),
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "delivered", id: id(2), deviceId: OTHER_DEVICE }),
    ];
    expect(statusOf(entries, message)).toBe("delivered");
    expect(statusOf([...entries].reverse(), message)).toBe("delivered");
  });

  it("ignores entries that are not status changes, even when they refer to the message", () => {
    const correction: JournalEntry = {
      id: id(50),
      incidentId: INCIDENT,
      deviceId: DEVICE,
      deviceSeq: 50,
      timestamp: "2026-10-28T23:00:00Z",
      clockTrust: "manual",
      operator: "Thomas",
      type: "correction",
      refersTo: MESSAGE,
      text: "wrong street",
    };
    const entries = [change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }), correction];
    expect(statusOf(entries, message)).toBe("sent");
  });

  it("keeps messages apart", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:30:00Z", to: "roger", refersTo: OTHER_MESSAGE }),
    ];
    expect(statusOf(entries, message)).toBe("sent");
    expect(statusOf(entries, otherMessage)).toBe("roger");
  });
});
