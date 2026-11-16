// The print view (P1-04) over the contract walkthrough and a send-to-all fixture: the same
// folding as the screen, oldest first by default, and "since last print" by what changed.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { buildTimeline } from "./journalView.ts";
import { isSince, latestTimestampOf, operatorsOf, printPoints, printRows } from "./printView.ts";
import type { Incident, JournalEntry } from "./types.ts";

const walkthrough = loadWalkthrough();
const incident = walkthrough.incidents[0] as Incident;
const INCIDENT = incident.id;
const DEVICE = walkthrough.deviceId;
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";

const W = {
  order1: "01JB8ZK3QX9V2M4N6P8R0T2W51",
  rogerIn: "01JB8ZK3QX9V2M4N6P8R0T2W55",
  freeTextIn: "01JB8ZK3QX9V2M4N6P8R0T2W57",
  note: "01JB8ZK3QX9V2M4N6P8R0T2W58",
  courier2: "01JB8ZK3QX9V2M4N6P8R0T2W59",
  noteCorrection: "01JB8ZK3QX9V2M4N6P8R0T2W62",
  incidentClosed: "01JB8ZK3QX9V2M4N6P8R0T2W63",
};

function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T4${n.toString(32).toUpperCase().padStart(3, "0")}`;
}

let seq = 200;

function entry(
  partial: Partial<JournalEntry> & Pick<JournalEntry, "type" | "timestamp">,
): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    clockTrust: "manual",
    operator: "Thomas",
    ...partial,
  };
}

describe("printRows on the walkthrough", () => {
  it("prints the walkthrough oldest first in the screen's folding: six rows, the radio message with its strip, the courier record with none (P3-07)", () => {
    const rows = printRows(walkthrough.entries, { since: null, oldestFirst: true });
    expect(rows.map((row) => [row.kind, row.id])).toEqual([
      ["message", W.order1],
      ["entry", W.rogerIn],
      ["entry", W.freeTextIn],
      ["entry", W.note],
      ["message", W.courier2],
      ["entry", W.incidentClosed],
    ]);
    const order1 = rows[0];
    expect(order1?.kind === "message" && order1.message.strip.map((s) => s.kind)).toEqual([
      "sent",
      "delivered",
      "roger",
    ]);
    const note = rows[3];
    expect(note?.kind === "entry" && note.corrections.map((c) => c.id)).toEqual([W.noteCorrection]);
    const courier = rows[4];
    expect(courier?.kind === "message" && courier.message.status).toBeNull();
    expect(courier?.kind === "message" && courier.message.strip).toEqual([]);
    expect(courier?.kind === "message" && courier.message.history).toEqual([]);
  });

  it("newest first is the screen's order exactly", () => {
    const rows = printRows(walkthrough.entries, { since: null, oldestFirst: false });
    expect(rows.map((row) => row.id)).toEqual(
      buildTimeline(walkthrough.entries).map((row) => row.id),
    );
  });

  it("since last print leaves out rows older than the stored time", () => {
    const rows = printRows(walkthrough.entries, {
      since: "2026-10-28T19:05:00Z",
      oldestFirst: true,
    });
    expect(rows.map((row) => row.id)).toEqual([W.freeTextIn, W.note, W.courier2, W.incidentClosed]);
  });

  it("a row stamped exactly at the stored time is printed; one a second older is not", () => {
    const at = printRows(walkthrough.entries, { since: "2026-10-28T19:06:00Z", oldestFirst: true });
    expect(at.map((row) => row.id)).toContain(W.note);
    const rogerAt = printRows(walkthrough.entries, {
      since: "2026-10-28T19:03:41Z",
      oldestFirst: true,
    });
    expect(rogerAt.map((row) => row.id)).not.toContain(W.order1);
    expect(rogerAt.map((row) => row.id)).not.toContain(W.rogerIn);
  });

  it("a message sent before the last print whose roger came after it is printed again (its strip changed)", () => {
    // #1 was sent 19:00:02 and acknowledged 19:03:40.
    const rows = printRows(walkthrough.entries, {
      since: "2026-10-28T19:03:00Z",
      oldestFirst: true,
    });
    expect(rows.map((row) => row.id)).toEqual([
      W.order1,
      W.rogerIn,
      W.freeTextIn,
      W.note,
      W.courier2,
      W.incidentClosed,
    ]);
    const order1 = rows[0];
    expect(order1?.kind === "message" && latestTimestampOf(order1)).toBe("2026-10-28T19:03:40Z");
  });

  it("a note corrected after the last print is printed again, with its correction", () => {
    // The note is 19:06:00, its correction 19:41:00.
    const rows = printRows(walkthrough.entries, {
      since: "2026-10-28T19:41:00Z",
      oldestFirst: true,
    });
    expect(rows.map((row) => row.id)).toEqual([W.note, W.incidentClosed]);
  });

  it("nothing new since the close prints nothing", () => {
    expect(
      printRows(walkthrough.entries, { since: "2026-10-28T21:00:01Z", oldestFirst: true }),
    ).toEqual([]);
  });

  it("lists the operators, the one who opened the incident first", () => {
    const entries = [
      ...walkthrough.entries,
      entry({
        type: "note",
        text: "overtaget",
        timestamp: "2026-10-28T19:50:00Z",
        operator: "Lise",
      }),
      entry({ type: "note", text: "igen", timestamp: "2026-10-28T19:51:00Z", operator: "Thomas" }),
    ];
    expect(operatorsOf(incident, entries)).toEqual(["Thomas", "Lise"]);
    expect(operatorsOf({ ...incident, createdBy: "Peter" }, walkthrough.entries)).toEqual([
      "Peter",
      "Thomas",
    ]);
  });
});

describe("printRows on a send-to-all", () => {
  const batchId = id(999);
  const peter = "01JB8ZK3QX9V2M4N6P8R0T2W70";
  const toHans = entry({
    type: "message_out",
    transport: "mesh",
    counterpartyId: HANS,
    seqNo: 3,
    batchId,
    text: "#3 Meld status",
    timestamp: "2026-10-28T20:00:00Z",
  });
  const toPeter = entry({
    type: "message_out",
    transport: "mesh",
    counterpartyId: peter,
    seqNo: 1,
    batchId,
    text: "#1 Meld status",
    timestamp: "2026-10-28T20:00:00Z",
  });
  const hansSent = entry({
    type: "status_change",
    refersTo: toHans.id,
    newStatus: "sent",
    timestamp: "2026-10-28T20:00:05Z",
  });
  const peterSent = entry({
    type: "status_change",
    refersTo: toPeter.id,
    newStatus: "sent",
    timestamp: "2026-10-28T20:00:15Z",
  });
  const peterDelivered = entry({
    type: "status_change",
    refersTo: toPeter.id,
    newStatus: "delivered",
    timestamp: "2026-10-28T20:30:00Z",
  });
  const entries = [...walkthrough.entries, toHans, toPeter, hansSent, peterSent, peterDelivered];

  it("is one block with counters and the recipients in transmission order, positioned by its first message", () => {
    const rows = printRows(entries, { since: null, oldestFirst: true });
    const batch = rows[rows.length - 2];
    expect(batch?.kind).toBe("batch");
    if (batch?.kind !== "batch") {
      return;
    }
    expect(batch.counters).toEqual({
      total: 2,
      pending: 0,
      sent: 2,
      delivered: 1,
      roger: 0,
      givenUp: 0,
    });
    expect(batch.messages.map((view) => view.entry.id)).toEqual([toHans.id, toPeter.id]);
    expect(rows[rows.length - 1]?.id).toBe(W.incidentClosed);
  });

  it("a batch is new again when any recipient's status moved after the last print", () => {
    const before = printRows(entries, { since: "2026-10-28T20:01:00Z", oldestFirst: true });
    expect(before.map((row) => row.id)).toEqual([batchId, W.incidentClosed]);
    const after = printRows(entries, { since: "2026-10-28T20:30:01Z", oldestFirst: true });
    expect(after.map((row) => row.id)).toEqual([W.incidentClosed]);
    const batch = buildTimeline(entries).find((row) => row.id === batchId);
    expect(batch !== undefined && latestTimestampOf(batch)).toBe("2026-10-28T20:30:00Z");
    expect(batch !== undefined && isSince(batch, "2026-10-28T20:30:00Z")).toBe(true);
  });
});

describe("printPoints (P3-05)", () => {
  const point = (refersTo: string, text: string, timestamp: string): JournalEntry =>
    entry({ type: "point", refersTo, text, timestamp });
  const open = point(W.freeTextIn, "Kælder i nr 4: pumpe", "2026-10-28T19:06:30Z");
  const closedPoint = point(W.note, "Ring til forsyningen igen", "2026-10-28T19:07:00Z");
  const closed = entry({
    type: "status_change",
    refersTo: closedPoint.id,
    newStatus: "closed",
    text: "Kommunens vagt ringede",
    timestamp: "2026-10-28T19:45:00Z",
  });
  const entries = [...walkthrough.entries, open, closedPoint, closed];

  // The walkthrough's own point: on the courier record, closed 19:40 (the contract's example
  // of a follow-up on a message by hand, P3-07).
  const COURIER_POINT = "Peter med pumpe til nr 4 — tilbage?";

  it("the whole journal: the open points, then the closed ones newest closed first with their reason and origin", () => {
    const points = printPoints(entries, null);
    expect(points.open.map((view) => view.title)).toEqual(["Kælder i nr 4: pumpe"]);
    expect(points.open[0]?.origin?.id).toBe(W.freeTextIn);
    expect(points.closed.map((view) => view.title)).toEqual([
      "Ring til forsyningen igen",
      COURIER_POINT,
    ]);
    expect(points.closed[0]).toMatchObject({
      reason: "Kommunens vagt ringede",
      closedAt: "2026-10-28T19:45:00Z",
      closedBy: "Thomas",
    });
    expect(points.closed[0]?.origin?.id).toBe(W.note);
    expect(points.closed[1]).toMatchObject({
      reason: "Peter tilbage 19:40, pumpen afleveret",
      closedAt: "2026-10-28T19:40:00Z",
    });
    expect(points.closed[1]?.origin?.id).toBe(W.courier2);
  });

  it("since last print: only the points opened, closed or reopened since", () => {
    const since = printPoints(entries, "2026-10-28T19:30:00Z");
    expect(since.open).toEqual([]);
    expect(since.closed.map((view) => view.title)).toEqual([
      "Ring til forsyningen igen",
      COURIER_POINT,
    ]);
    expect(printPoints(entries, "2026-10-28T19:40:01Z").closed.map((view) => view.title)).toEqual([
      "Ring til forsyningen igen",
    ]);
    expect(printPoints(entries, "2026-10-28T19:45:00Z").closed).toHaveLength(1);
    expect(printPoints(entries, "2026-10-28T19:45:01Z").closed).toEqual([]);
    const both = printPoints(entries, "2026-10-28T19:00:00Z");
    expect(both.open).toHaveLength(1);
    expect(both.closed).toHaveLength(2);
  });

  it("a point is never a row of the printed journal, nor are its status changes", () => {
    const rows = printRows(entries, { since: null, oldestFirst: true });
    expect(rows.some((row) => row.id === open.id || row.id === closedPoint.id)).toBe(false);
    expect(rows.some((row) => row.id === closed.id)).toBe(false);
    expect(rows).toHaveLength(
      printRows(walkthrough.entries, { since: null, oldestFirst: true }).length,
    );
  });
});
