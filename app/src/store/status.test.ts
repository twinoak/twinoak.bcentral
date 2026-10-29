import { describe, expect, it } from "vitest";
import { latestStatusChange, statusOf } from "./status.ts";
import type { JournalEntry, Status } from "./types.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";

const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";
const OTHER_DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W00";
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const MESSAGE = "01JB8ZK3QX9V2M4N6P8R0T2W51";
const OTHER_MESSAGE = "01JB8ZK3QX9V2M4N6P8R0T2W59";

// Ids that sort in the order given, so tests can state which id is "later".
function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T2X${n.toString().padStart(2, "0")}`;
}

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

describe("statusOf", () => {
  it("is pending when nothing refers to the message", () => {
    expect(statusOf([], MESSAGE)).toBe("pending");
    expect(statusOf([change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", refersTo: OTHER_MESSAGE })], MESSAGE)).toBe(
      "pending",
    );
  });

  it("follows the chain in the contract walkthrough", () => {
    const { entries } = loadWalkthrough();
    expect(statusOf(entries, "01JB8ZK3QX9V2M4N6P8R0T2W51")).toBe("roger");
    expect(statusOf(entries, "01JB8ZK3QX9V2M4N6P8R0T2W59")).toBe("delivered");
    expect(latestStatusChange(entries, INCIDENT)?.newStatus).toBe("closed");
  });

  it("follows pending → sent → delivered → roger, whatever order the entries are read in", () => {
    const chain = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "pending" }),
      change({ seq: 2, at: "2026-10-28T19:00:02Z", to: "sent" }),
      change({ seq: 3, at: "2026-10-28T19:00:09Z", to: "delivered" }),
      change({ seq: 4, at: "2026-10-28T19:03:40Z", to: "roger" }),
    ];
    expect(statusOf(chain.slice(0, 1), MESSAGE)).toBe("pending");
    expect(statusOf(chain.slice(0, 2), MESSAGE)).toBe("sent");
    expect(statusOf(chain.slice(0, 3), MESSAGE)).toBe("delivered");
    expect(statusOf(chain, MESSAGE)).toBe("roger");
    expect(statusOf([...chain].reverse(), MESSAGE)).toBe("roger");
  });

  it("goes back from given_up to sent on a manual retry", () => {
    const chain = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:04:00Z", to: "given_up" }),
    ];
    expect(statusOf(chain, MESSAGE)).toBe("given_up");
    chain.push(change({ seq: 3, at: "2026-10-28T19:06:00Z", to: "sent" }));
    expect(statusOf(chain, MESSAGE)).toBe("sent");
    chain.push(change({ seq: 4, at: "2026-10-28T19:06:30Z", to: "delivered" }));
    expect(statusOf(chain, MESSAGE)).toBe("delivered");
  });

  it("picks by timestamp first, even when deviceSeq says otherwise", () => {
    const entries = [
      change({ seq: 9, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:00:01Z", to: "delivered" }),
    ];
    expect(statusOf(entries, MESSAGE)).toBe("delivered");
  });

  it("breaks a timestamp tie by deviceSeq", () => {
    const entries = [
      change({ seq: 3, at: "2026-10-28T19:00:00Z", to: "delivered" }),
      change({ seq: 2, at: "2026-10-28T19:00:00Z", to: "sent" }),
    ];
    expect(statusOf(entries, MESSAGE)).toBe("delivered");
    expect(statusOf([...entries].reverse(), MESSAGE)).toBe("delivered");
  });

  it("compares timestamps as instants, not as strings", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T21:00:00+02:00", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:00:00Z", to: "delivered" }),
    ];
    // Same instant: deviceSeq decides.
    expect(statusOf(entries, MESSAGE)).toBe("delivered");
    const later = [
      change({ seq: 1, at: "2026-10-28T19:00:01Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T21:00:00+02:00", to: "delivered" }),
    ];
    // 19:00:01Z is after 19:00:00Z however it is spelled.
    expect(statusOf(later, MESSAGE)).toBe("sent");
  });

  it("breaks a tie on timestamp and deviceSeq across devices by id", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent", id: id(1) }),
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "delivered", id: id(2), deviceId: OTHER_DEVICE }),
    ];
    expect(statusOf(entries, MESSAGE)).toBe("delivered");
    expect(statusOf([...entries].reverse(), MESSAGE)).toBe("delivered");
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
    expect(statusOf(entries, MESSAGE)).toBe("sent");
  });

  it("keeps messages apart", () => {
    const entries = [
      change({ seq: 1, at: "2026-10-28T19:00:00Z", to: "sent" }),
      change({ seq: 2, at: "2026-10-28T19:30:00Z", to: "roger", refersTo: OTHER_MESSAGE }),
    ];
    expect(statusOf(entries, MESSAGE)).toBe("sent");
    expect(statusOf(entries, OTHER_MESSAGE)).toBe("roger");
  });
});
