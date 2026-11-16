// The status column's rule (P3-03) over the contract walkthrough and one fixture per state:
// every radio message has three slots, sent · delivered · confirmed, each the shape and
// tint the task names, with the tooltip sentence lib/journalText.ts gives it; a batch's
// counts; no time anywhere but in a tooltip. A message by phone, courier or verbal has no
// chain and no slots (P3-07).

import { describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { buildTimeline, statusStrip, type StripItem } from "../store/journalView.ts";
import { messageViews } from "../store/handoverView.ts";
import type { JournalEntry } from "../store/types.ts";
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

// A radio message's slots from its chain, as the screen derives them: statusStrip over the
// status_change entries, then the rule.
function slotsOf(chain: readonly JournalEntry[]): Slot[] {
  return statusSlots(statusStrip(chain));
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

  it("a roger or given-up recorded by hand on a radio message: the same symbols, the reason as the slot's text (P3-07: nothing is 'by hand' by transport any more)", () => {
    const roger = slotsOf([
      change("sent", at(10)),
      change("delivered", at(11)),
      change("roger", at(40), "Hans rang: modtaget"),
    ]);
    expect(shapes(roger)).toEqual(["filled ok", "filled ok", "check ok"]);
    expect(roger[2]?.text).toBe("Hans rang: modtaget");
    // The confirmed slot's sentence is the time alone; the reason is in the history.
    expect(titles(roger)[2]).toBe(`Confirmed ${clock(at(40))}`);
    // Given up by hand: the reason after the time, as the radio's detail would be.
    const givenUp = slotsOf([change("sent", at(10)), change("given_up", at(12), "intet svar")]);
    expect(titles(givenUp)[1]).toBe(`Given up ${clock(at(12))} · intet svar`);
    // A slot is its name, shape, tint, time, text and attempt — nothing about who set it.
    expect(Object.keys(givenUp[0] ?? {}).sort()).toEqual([
      "at",
      "attempt",
      "name",
      "shape",
      "text",
      "tint",
    ]);
  });

  it("closed by the staff (P3-09): the dash in the confirmed slot, ink-2, with the time and the note; the radio's slots as they were", () => {
    const withNote = slotsOf([
      change("sent", at(1, 2)),
      change("delivered", at(1, 9)),
      change("closed", at(40), "Ole er kørt, ingen R"),
    ]);
    expect(shapes(withNote)).toEqual(["filled ok", "filled ok", "dash muted"]);
    expect(titles(withNote)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      `Delivered ${clock(at(1, 9))}`,
      `Closed by the staff ${clock(at(40))} · Ole er kørt, ingen R`,
    ]);
    expect(withNote[2]?.at).toBe(at(40));
    // Without a note: the sentence alone (the store writes "" for no note; the strip reads
    // it as none).
    const withoutNote = slotsOf([change("sent", at(1, 2)), change("closed", at(41), "")]);
    expect(shapes(withoutNote)).toEqual(["filled ok", "hollow neutral", "dash muted"]);
    expect(titles(withoutNote)).toEqual([
      `Sent ${clock(at(1, 2))}`,
      "Not yet delivered",
      `Closed by the staff ${clock(at(41))}`,
    ]);
    expect(withoutNote[2]?.text).toBeNull();
    // No clock: the staff stopped waiting, so nothing is waited for.
    expect(withoutNote.some((slot) => slot.shape === "clock")).toBe(false);
    // Closed after given up: the cross stays where the radio left it, the dash after it.
    const afterGivenUp = slotsOf([
      change("sent", at(1, 2)),
      change("given_up", at(1, 40), "no ack after 3 attempts"),
      change("closed", at(42)),
    ]);
    expect(shapes(afterGivenUp)).toEqual(["filled ok", "cross danger", "dash muted"]);
    expect(titles(afterGivenUp)[1]).toBe(`Given up ${clock(at(1, 40))} · no ack after 3 attempts`);
  });

  it("the six shapes are six, and the tints never tell two shapes apart on their own", () => {
    const all = [
      ...slotsOf([]),
      ...slotsOf([change("sent", at(1))]),
      ...slotsOf([change("sent", at(1)), change("delivered", at(2)), change("roger", at(3))]),
      ...slotsOf([change("given_up", at(1))]),
      ...slotsOf([change("sent", at(1)), change("closed", at(2))]),
    ];
    const seen = new Map<string, string>();
    for (const slot of all) {
      const tint = seen.get(slot.shape);
      expect(tint === undefined || tint === slot.tint).toBe(true);
      seen.set(slot.shape, slot.tint);
    }
    expect([...seen.keys()].sort()).toEqual([
      "check",
      "clock",
      "cross",
      "dash",
      "filled",
      "hollow",
    ]);
  });
});

describe("the walkthrough and the batch", () => {
  it("renders the walkthrough's radio message with the three slots; its courier record has no chain and no slots (P3-07)", () => {
    const views = messageViews(buildTimeline(walkthrough.entries));
    expect(views).toHaveLength(2);
    const viewOf = (id: string) => views.find((candidate) => candidate.entry.id === id);
    const order1 = viewOf("01JB8ZK3QX9V2M4N6P8R0T2W51");
    const courier2 = viewOf("01JB8ZK3QX9V2M4N6P8R0T2W59");
    expect(order1?.status).toBe("roger");
    const slots = statusSlots(order1?.strip ?? []);
    expect(slots.map((slot) => slot.name)).toEqual(["sent", "delivered", "roger"]);
    expect(shapes(slots)).toEqual(["filled ok", "filled ok", "check ok"]);
    // The screen renders the column only while the status is not null; the courier record
    // has nothing to render.
    expect(courier2?.entry.transport).toBe("courier");
    expect(courier2?.status).toBeNull();
    expect(courier2?.strip).toEqual([]);
    expect(courier2?.history).toEqual([]);
  });

  it("a batch row counts per slot, in the done tint only when every recipient is there", () => {
    const counts = countSlots({
      total: 25,
      pending: 0,
      sent: 25,
      delivered: 23,
      roger: 18,
      givenUp: 1,
      closed: 2,
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
      closed: 0,
    });
    expect(nothing.map((slot) => `${slot.n}/${slot.total} ${slot.tint}`)).toEqual([
      "0/3 neutral",
      "0/3 neutral",
      "0/3 neutral",
    ]);
  });

  it("the strip's words keep their times for print; a close is 'closed 14.40' (P3-09)", () => {
    const item: StripItem = { kind: "delivered", at: at(1, 9), attempt: null, text: null };
    expect(stripText(item, null)).toBe(`delivered ${clock(at(1, 9))}`);
    expect(clock(at(1, 9))).not.toBe("");
    const closed: StripItem = { kind: "closed", at: at(40), attempt: null, text: "ingen R" };
    expect(stripText(closed, null)).toBe(`closed ${clock(at(40))}`);
  });
});
