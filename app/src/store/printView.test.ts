// The print view (P1-04) over the contract walkthrough and a send-to-all fixture: the same
// folding as the screen, oldest first by default, and "since last print" by what changed.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { buildTimeline } from "./journalView.ts";
import { isSince, latestTimestampOf, operatorsOf, printRows } from "./printView.ts";
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
  it("prints the walkthrough oldest first in the screen's folding: six rows, the message rows with their strips", () => {
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
    expect(courier?.kind === "message" && courier.message.strip.map((s) => s.kind)).toEqual([
      "sent",
      "delivered",
    ]);
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
