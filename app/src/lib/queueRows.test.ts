import { describe, expect, it } from "vitest";
import { counterChips } from "./journalRows.ts";
import { queueCounters, queueRowChip } from "./queueRows.ts";

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
    ]);
    expect(counters).toEqual({
      total: 7,
      pending: 1,
      sent: 2,
      delivered: 1,
      roger: 2,
      givenUp: 1,
    });
  });

  it("renders as the journal's counter chips, zeros omitted", () => {
    const chips = counterChips(queueCounters(["sent", "given_up", "given_up"]));
    expect(chips.map((chip) => [chip.key, chip.n])).toEqual([
      ["sent", 1],
      ["given_up", 2],
    ]);
  });

  it("ignores the incident's own statuses and an empty queue is all zeros", () => {
    expect(queueCounters(["closed", "reopened"]).total).toBe(0);
    expect(queueCounters([]).total).toBe(0);
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
