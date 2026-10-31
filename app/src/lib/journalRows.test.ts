// The row list's rules (P2-03): every status and strip state has a chip look, the batch
// counters become chips in chain order with zeros left out, a message row knows its
// direction. Acceptance line 1 ("the strip states show their chip variants; the batch row
// shows counters") rests on these, since there is no component test harness.

import { describe, expect, it } from "vitest";
import type { BatchCounters } from "../store/journalView.ts";
import {
  chipClass,
  counterChips,
  DIRECTION_GLYPH,
  directionOf,
  statusChip,
  stripChip,
} from "./journalRows.ts";

describe("status and strip chips", () => {
  it("map every status of the chain to the pair docs/design.md names", () => {
    expect(statusChip("sent")).toEqual({ tint: "neutral", dot: "filled" });
    expect(statusChip("delivered")).toEqual({ tint: "ok", dot: "outline" });
    expect(statusChip("roger")).toEqual({ tint: "ok", dot: "filled" });
    expect(statusChip("given_up")).toEqual({ tint: "danger", dot: "filled" });
    expect(statusChip("pending")).toEqual({ tint: "warn", dot: "filled" });
  });

  it("the incident's own states are grey", () => {
    expect(statusChip("closed").tint).toBe("neutral");
    expect(statusChip("reopened").tint).toBe("neutral");
  });

  it("delivered and roger are told apart by the dot, not the colour alone", () => {
    expect(statusChip("delivered").tint).toBe(statusChip("roger").tint);
    expect(statusChip("delivered").dot).not.toBe(statusChip("roger").dot);
  });

  it("waiting is warn with an outline dot; every other strip state is its status's chip", () => {
    expect(stripChip("waiting")).toEqual({ tint: "warn", dot: "outline" });
    for (const kind of ["pending", "sent", "delivered", "roger", "given_up"] as const) {
      expect(stripChip(kind)).toEqual(statusChip(kind));
    }
  });

  it("chipClass is the variant class, empty for neutral", () => {
    expect(chipClass("neutral")).toBe("");
    expect(chipClass("ok")).toBe("chip-ok");
    expect(chipClass("warn")).toBe("chip-warn");
    expect(chipClass("danger")).toBe("chip-danger");
  });
});

describe("batch counters as chips", () => {
  const counters: BatchCounters = {
    total: 25,
    pending: 0,
    sent: 25,
    delivered: 23,
    roger: 18,
    givenUp: 1,
  };

  it("one chip per non-zero counter, in chain order, each with its status's look", () => {
    expect(counterChips(counters)).toEqual([
      { key: "sent", n: 25, look: statusChip("sent") },
      { key: "delivered", n: 23, look: statusChip("delivered") },
      { key: "roger", n: 18, look: statusChip("roger") },
      { key: "given_up", n: 1, look: statusChip("given_up") },
    ]);
  });

  it("a batch nobody has sent yet is one pending chip", () => {
    expect(
      counterChips({ total: 3, pending: 3, sent: 0, delivered: 0, roger: 0, givenUp: 0 }),
    ).toEqual([{ key: "pending", n: 3, look: statusChip("pending") }]);
  });
});

describe("direction", () => {
  it("is out for a message_out, in for a message_in, none for the rest", () => {
    expect(directionOf({ type: "message_out" })).toBe("out");
    expect(directionOf({ type: "message_in" })).toBe("in");
    expect(directionOf({ type: "note" })).toBeNull();
    expect(directionOf({ type: "status_change" })).toBeNull();
    expect(directionOf({ type: "correction" })).toBeNull();
  });

  it("has a glyph for each direction", () => {
    expect(DIRECTION_GLYPH.out).not.toBe(DIRECTION_GLYPH.in);
    expect(DIRECTION_GLYPH.out.length).toBe(1);
  });
});
