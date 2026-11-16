// The status column's rule (P3-03) over the contract walkthrough and one fixture per state:
// every outgoing message has three slots, sent · delivered · confirmed, each the shape and
// tint the task names, with the tooltip sentence lib/journalText.ts gives it; a batch's
// counts; no time anywhere but in a tooltip.

import { describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { buildTimeline, statusStrip, type StripItem } from "../store/journalView.ts";
import { messageViews } from "../store/handoverView.ts";
import type { JournalEntry, Transport } from "../store/types.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { countSlotText, formatShortTime, slotText, stripText } from "./journalText.ts";
import { countSlots, SLOT_NAMES, statusSlots, type Slot } from "./statusSlots.ts";

setLanguage("en");

// The localised short time, as the tooltip shows it (the test machine's zone and locale).
function clock(timestamp: string): string {
  return formatShortTime(timestamp);
}

const walkthrough = loadWalkthrough();
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";
const MESSAGE = "01JB8ZK3QX9V2M4N6P8R0T3S00";

let seq = 300;

function at(minute: number, second = 0): string {
  return `2026-10-28T20:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`;
}

function change(to: JournalEntry["newStatus"], timestamp: string, text?: string): JournalEntry {
  seq += 1;
  return {
    id: `01JB8ZK3QX9V2M4N6P8R0T3${seq.toString(32).toUpperCase().padStart(3, "0")}`,
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp,
    clockTrust: "manual",
    operator: "Thomas",
    type: "status_change",
    refersTo: MESSAGE,
    newStatus: to,
    text,
  };
}

// A message's slots from its chain, as the screen derives them: statusStrip over the
// status_change entries, then the rule.
function slotsOf(chain: readonly JournalEntry[], transport: Transport = "mesh"): Slot[] {
  return statusSlots(statusStrip(chain), transport);
}

function shapes(slots: readonly Slot[]): string[] {
  return slots.map((slot) => `${slot.shape} ${slot.tint}`);
}

function titles(slots: readonly Slot[], inflight: string | null = null): string[] {
  return slots.map((slot) => slotText(slot, inflight));
}

describe("one slot per state of the chain", () => {
  it("pending: three hollow circles, 'not yet' each; the in-flight words on the sent slot while the outbox holds it", () => {
    const slots = slotsOf([]);
    expect(slots.map((slot) => slot.name)).toEqual([...SLOT_NAMES]);
    expect(shapes(slots)).toEqual(["hollow neutral", "hollow neutral", "hollow neutral"]);
    expect(titles(slots)).toEqual(["Not yet sent", "Not yet delivered", "Not yet confirmed"]);
    expect(titles(slots, "attempt 1/3, sending")[0]).toBe("Not yet sent: attempt 1/3, sending");
    expect(titles(slots, "attempt 1/3, sending")[1]).toBe("Not yet delivered");
  });

  it("sent, the receipt still out: filled, then the clock in the delivered slot with the attempt", () => {
    const slots = slotsOf([change("sent", at(1, 2))]);
    expect(shapes(slots)).toEqual(["filled ok", "clock warn", "hollow neutral"]);
    expect(titles(slots)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      "Not yet delivered: waiting",
      "Not yet confirmed",
    ]);
    const resent = slotsOf([
      change("sent", at(1, 2)),
      change("sent", at(1, 20), "attempt 2/3"),
      change("sent", at(1, 38), "attempt 3/3"),
    ]);
    expect(shapes(resent)).toEqual(["filled ok", "clock warn", "hollow neutral"]);
    expect(resent[1]?.attempt).toBe("attempt 3/3");
    expect(titles(resent)[1]).toBe("Not yet delivered: waiting (attempt 3/3)");
    // While the outbox holds the message its own progress text is the detail.
    expect(titles(resent, "attempt 3/3, waiting for the receipt")[1]).toBe(
      "Not yet delivered: attempt 3/3, waiting for the receipt",
    );
    // The time of the first attempt is the sent time, as on the strip.
    expect(resent[0]?.at).toBe(at(1, 2));
  });

  it("delivered: two filled circles and a hollow one", () => {
    const slots = slotsOf([change("sent", at(1, 2)), change("delivered", at(1, 9))]);
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "hollow neutral"]);
    expect(titles(slots)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      `Delivered ${clock(at(1, 9))}`,
      "Not yet confirmed",
    ]);
  });

  it("confirmed: two filled circles and the check; a roger's incoming id never reaches the tooltip", () => {
    const slots = slotsOf([
      change("sent", at(1, 2)),
      change("delivered", at(1, 9)),
      change("roger", at(4, 40), "01JB8ZK3QX9V2M4N6P8R0T2W55"),
    ]);
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "check ok"]);
    expect(titles(slots)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      `Delivered ${clock(at(1, 9))}`,
      `Confirmed ${clock(at(4, 40))}`,
    ]);
  });

  it("given up at delivered: the cross in the delivered slot with the reason, sent stays filled", () => {
    const slots = slotsOf([
      change("sent", at(1, 2)),
      change("sent", at(1, 20), "attempt 2/3"),
      change("given_up", at(1, 40), "no ack after 3 attempts"),
    ]);
    expect(shapes(slots)).toEqual(["filled ok", "cross danger", "hollow neutral"]);
    expect(titles(slots)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      `Given up ${clock(at(1, 40))} · no ack after 3 attempts`,
      "Not yet confirmed",
    ]);
  });

  it("given up at confirmed: the cross in the confirmed slot, sent and delivered filled", () => {
    const slots = slotsOf([
      change("sent", at(1, 2)),
      change("delivered", at(1, 9)),
      change("given_up", at(30), "Hans svarer ikke"),
    ]);
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "cross danger"]);
    expect(titles(slots)[2]).toBe(`Given up ${clock(at(30))} · Hans svarer ikke`);
  });

  it("given up before anything was sent (no radio): the cross in the sent slot", () => {
    const slots = slotsOf([change("given_up", at(1, 1), "no radio connected")]);
    expect(shapes(slots)).toEqual(["cross danger", "hollow neutral", "hollow neutral"]);
    expect(titles(slots)[0]).toBe(`Given up ${clock(at(1, 1))} · no radio connected`);
  });

  it("a manual retry after given up reads the new run: the cross is gone", () => {
    const slots = slotsOf([
      change("sent", at(1, 2)),
      change("given_up", at(1, 40), "no ack"),
      change("sent", at(5)),
      change("delivered", at(5, 3)),
    ]);
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "hollow neutral"]);
  });

  it("by hand (a non-mesh transport): the same symbols, the tooltip says so with the reason", () => {
    const slots = slotsOf(
      [
        change("sent", at(10), "Peter cyklede 19:10"),
        change("delivered", at(40), "Peter tilbage 19:40, afleveret"),
      ],
      "courier",
    );
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "hollow neutral"]);
    expect(slots.map((slot) => slot.byHand)).toEqual([true, true, true]);
    expect(titles(slots)).toEqual([
      `Sent ${clock(at(10))} · by hand (Peter cyklede 19:10)`,
      `Delivered ${clock(at(40))} · by hand (Peter tilbage 19:40, afleveret)`,
      "Not yet confirmed",
    ]);
    // A manual status with no reason stored (imported data) still says by hand.
    const bare = slotsOf([change("sent", at(10))], "phone");
    expect(titles(bare)[0]).toBe(`Sent ${clock(at(10))} · by hand`);
    // Given up by hand: the reason in the by-hand brackets.
    const givenUp = slotsOf(
      [change("sent", at(10), "ringede"), change("given_up", at(12), "intet svar")],
      "phone",
    );
    expect(titles(givenUp)[1]).toBe(`Given up ${clock(at(12))} · by hand (intet svar)`);
    // On the radio nothing is by hand.
    expect(slotsOf([change("sent", at(10))]).every((slot) => !slot.byHand)).toBe(true);
  });

  it("the five shapes are five, and the tints never tell two shapes apart on their own", () => {
    const all = [
      ...slotsOf([]),
      ...slotsOf([change("sent", at(1))]),
      ...slotsOf([change("sent", at(1)), change("delivered", at(2)), change("roger", at(3))]),
      ...slotsOf([change("given_up", at(1))]),
    ];
    const seen = new Map<string, string>();
    for (const slot of all) {
      const tint = seen.get(slot.shape);
      expect(tint === undefined || tint === slot.tint).toBe(true);
      seen.set(slot.shape, slot.tint);
    }
    expect([...seen.keys()].sort()).toEqual(["check", "clock", "cross", "filled", "hollow"]);
  });
});

describe("the walkthrough and the batch", () => {
  it("renders every outgoing message of the walkthrough with the three slots, in order", () => {
    const views = messageViews(buildTimeline(walkthrough.entries));
    expect(views).toHaveLength(2);
    for (const view of views) {
      const slots = statusSlots(view.strip, view.entry.transport);
      expect(slots.map((slot) => slot.name)).toEqual(["sent", "delivered", "roger"]);
    }
    const slotsFor = (id: string) => {
      const view = views.find((candidate) => candidate.entry.id === id);
      return view === undefined ? [] : statusSlots(view.strip, view.entry.transport);
    };
    const order1 = slotsFor("01JB8ZK3QX9V2M4N6P8R0T2W51");
    const courier2 = slotsFor("01JB8ZK3QX9V2M4N6P8R0T2W59");
    expect(shapes(order1)).toEqual(["filled ok", "filled ok", "check ok"]);
    expect(shapes(courier2)).toEqual(["filled ok", "filled ok", "hollow neutral"]);
    expect(courier2.every((slot) => slot.byHand)).toBe(true);
    expect(order1.every((slot) => !slot.byHand)).toBe(true);
  });

  it("a batch row counts per slot, in the done tint only when every recipient is there", () => {
    const counts = countSlots({
      total: 25,
      pending: 0,
      sent: 25,
      delivered: 23,
      roger: 18,
      givenUp: 1,
    });
    expect(counts).toEqual([
      { name: "sent", n: 25, total: 25, tint: "ok" },
      { name: "delivered", n: 23, total: 25, tint: "neutral" },
      { name: "roger", n: 18, total: 25, tint: "neutral" },
    ]);
    expect(counts.map(countSlotText)).toEqual([
      "25 of 25 sent",
      "23 of 25 delivered",
      "18 of 25 confirmed",
    ]);
    const nothing = countSlots({
      total: 3,
      pending: 3,
      sent: 0,
      delivered: 0,
      roger: 0,
      givenUp: 0,
    });
    expect(nothing.map((slot) => `${slot.n}/${slot.total} ${slot.tint}`)).toEqual([
      "0/3 neutral",
      "0/3 neutral",
      "0/3 neutral",
    ]);
  });

  it("the strip's words keep their times for print", () => {
    const item: StripItem = { kind: "delivered", at: at(1, 9), attempt: null, text: null };
    expect(stripText(item, null)).toBe(`delivered ${clock(at(1, 9))}`);
    expect(clock(at(1, 9))).not.toBe("");
  });
});
