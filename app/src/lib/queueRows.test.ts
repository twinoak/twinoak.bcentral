import { describe, expect, it } from "vitest";
import { counterChips } from "./journalRows.ts";
import { queueCounters, queueRowChip, queueRowShape } from "./queueRows.ts";

describe("queueCounters", () => {
  it("counts every message once by its status, in the batch counters' shape", () => {
    const counters = queueCounters([
      "pending",
      "sent",
      "sent",
      "delivered",
      "roger",
      "given_up",
      "roger",
      "closed",
    ]);
    expect(counters).toEqual({
      total: 8,
      pending: 1,
      sent: 2,
      delivered: 1,
      roger: 2,
      givenUp: 1,
      closed: 1,
    });
  });

  it("renders as the journal's counter chips, zeros omitted", () => {
    const chips = counterChips(queueCounters(["sent", "given_up", "given_up"]));
    expect(chips.map((chip) => [chip.key, chip.n])).toEqual([
      ["sent", 1],
      ["given_up", 2],
    ]);
  });

  it("ignores reopened (never on a message) and an empty queue is all zeros; closed by the staff counts (P3-09)", () => {
    expect(queueCounters(["reopened"]).total).toBe(0);
    expect(queueCounters([]).total).toBe(0);
    expect(queueCounters(["closed"])).toMatchObject({ total: 1, closed: 1 });
  });
});

describe("queueRowChip", () => {
  it("is the status chip for a stored status", () => {
    expect(queueRowChip("roger")).toEqual({ tint: "ok", dot: "filled" });
    expect(queueRowChip("given_up")).toEqual({ tint: "danger", dot: "filled" });
    expect(queueRowChip("pending")).toEqual({ tint: "warn", dot: "filled" });
  });

  it("is warn with an outline dot while the message is held by the queue or the outbox", () => {
    expect(queueRowChip(null)).toEqual({ tint: "warn", dot: "outline" });
  });
});

describe("queueRowShape (P3-03)", () => {
  it("draws a row's state with the status column's symbols", () => {
    expect(queueRowShape("pending")).toBe("hollow");
    expect(queueRowShape("sent")).toBe("filled");
    expect(queueRowShape("delivered")).toBe("filled");
    expect(queueRowShape("roger")).toBe("check");
    expect(queueRowShape("given_up")).toBe("cross");
    expect(queueRowShape("closed")).toBe("dash");
    expect(queueRowShape(null)).toBe("clock");
  });
});
