// The journal screen's derivations against contract/examples/walkthrough.json and a
// send-to-all fixture: the phase-0 walkthrough as a stack of slips, newest on top, with the
// status strip on each radio message and its transitions folded into a history (P1-01), the
// courier record a plain row with none (P3-07); the batch row with its counters; the open
// items per register entry; "last heard from". Everything is a pure function of the entries,
// so "derived live" is shown by appending an entry to the array and deriving again.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  batchCounters,
  bodyOf,
  buildTimeline,
  closedPoints,
  compareEntries,
  correctionsByTarget,
  countNewRows,
  currentRun,
  currentText,
  findRow,
  isDrillText,
  lastHeardFrom,
  lateRogerIds,
  lateRogersOf,
  openItems,
  openPoints,
  pointOf,
  pointsFor,
  slowestStatus,
  sortedByLastHeard,
  sortedNewestFirst,
  sortedOldestFirst,
  splitPrefix,
  statusStrip,
  textVersions,
  type MessageView,
  type TimelineRow,
} from "./journalView.ts";
import { incidentStateOf } from "./incidents.ts";
import type { JournalEntry, RegisterEntry, Status } from "./types.ts";

const walkthrough = loadWalkthrough();
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";

// The walkthrough's entries by their role, so the tests read like the walkthrough.
const W = {
  order1: "01JB8ZK3QX9V2M4N6P8R0T2W51",
  order1Pending: "01JB8ZK3QX9V2M4N6P8R0T2W52",
  order1Sent: "01JB8ZK3QX9V2M4N6P8R0T2W53",
  order1Delivered: "01JB8ZK3QX9V2M4N6P8R0T2W54",
  rogerIn: "01JB8ZK3QX9V2M4N6P8R0T2W55",
  order1Roger: "01JB8ZK3QX9V2M4N6P8R0T2W56",
  freeTextIn: "01JB8ZK3QX9V2M4N6P8R0T2W57",
  note: "01JB8ZK3QX9V2M4N6P8R0T2W58",
  courier2: "01JB8ZK3QX9V2M4N6P8R0T2W59",
  courier2Point: "01JB8ZK3QX9V2M4N6P8R0T2W60",
  courier2PointClosed: "01JB8ZK3QX9V2M4N6P8R0T2W61",
  noteCorrection: "01JB8ZK3QX9V2M4N6P8R0T2W62",
  incidentClosed: "01JB8ZK3QX9V2M4N6P8R0T2W63",
};

function entry(id: string): JournalEntry {
  const found = walkthrough.entries.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no walkthrough entry ${id}`);
  }
  return found;
}

// Fixture ids: 26 characters, unique per n.
function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T3${n.toString(32).toUpperCase().padStart(3, "0")}`;
}

function at(minute: number, second = 0): string {
  const m = String(minute).padStart(2, "0");
  const s = String(second).padStart(2, "0");
  return `2026-10-28T20:${m}:${s}Z`;
}

let seq = 100;

function statusChange(options: {
  refersTo: string;
  to: JournalEntry["newStatus"];
  at: string;
  text?: string;
  operator?: string;
}): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: options.operator ?? "Thomas",
    type: "status_change",
    refersTo: options.refersTo,
    newStatus: options.to,
    text: options.text,
  };
}

function messageOut(options: {
  counterpartyId: string;
  seqNo: number;
  body: string;
  at: string;
  batchId?: string;
  refersTo?: string;
}): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "message_out",
    transport: "mesh",
    counterpartyId: options.counterpartyId,
    seqNo: options.seqNo,
    batchId: options.batchId,
    refersTo: options.refersTo,
    text: `#${options.seqNo} ${options.body}`,
  };
}

// A message by phone, courier or verbal: a plain record, no number, no prefix (P3-07).
function plainOut(options: {
  counterpartyId: string;
  text: string;
  at: string;
  transport: "phone" | "courier" | "verbal";
  refersTo?: string;
}): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "message_out",
    transport: options.transport,
    counterpartyId: options.counterpartyId,
    refersTo: options.refersTo,
    text: options.text,
  };
}

function messageIn(options: { counterpartyId: string; text: string; at: string }): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "message_in",
    transport: "phone",
    counterpartyId: options.counterpartyId,
    text: options.text,
  };
}

function note(options: { text: string; at: string; refersTo?: string }): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "note",
    refersTo: options.refersTo,
    text: options.text,
  };
}

function point(options: { refersTo: string; text: string; at: string }): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "point",
    refersTo: options.refersTo,
    text: options.text,
  };
}

function rowFor(rows: readonly TimelineRow[], entryId: string): TimelineRow {
  const row = rows.find((candidate) => candidate.id === entryId);
  if (row === undefined) {
    throw new Error(`no row ${entryId}`);
  }
  return row;
}

function messageRow(rows: readonly TimelineRow[], entryId: string): MessageView {
  const row = rowFor(rows, entryId);
  if (row.kind !== "message") {
    throw new Error(`row ${entryId} is a ${row.kind}, not a message`);
  }
  return row.message;
}

function strip(view: MessageView): string[] {
  return view.strip.map((item) =>
    [item.kind, item.at ?? "", item.attempt ?? ""].filter((part) => part !== "").join(" "),
  );
}

describe("ordering", () => {
  it("reads oldest first by timestamp, then deviceSeq, then id, whatever order the entries came in", () => {
    const shuffled = [...walkthrough.entries].reverse();
    const sorted = sortedOldestFirst(shuffled);
    expect(sorted.map((e) => e.deviceSeq)).toEqual(walkthrough.entries.map((e) => e.deviceSeq));
    expect(compareEntries(entry(W.order1), entry(W.order1))).toBe(0);
    expect(compareEntries(entry(W.order1), entry(W.order1Pending))).toBeLessThan(0);
    expect(compareEntries(entry(W.incidentClosed), entry(W.note))).toBeGreaterThan(0);
  });

  it("newest first is the same order reversed", () => {
    const newest = sortedNewestFirst(walkthrough.entries);
    expect(newest.map((e) => e.deviceSeq)).toEqual(
      walkthrough.entries.map((e) => e.deviceSeq).reverse(),
    );
  });
});

describe("timeline of the phase-0 walkthrough (P1-01)", () => {
  const rows = buildTimeline([...walkthrough.entries].reverse());

  it("is one row per slip, newest on top: incident close, courier #2, note, free text in, R1 in, #1", () => {
    expect(rows.map((row) => row.id)).toEqual([
      W.incidentClosed,
      W.courier2,
      W.note,
      W.freeTextIn,
      W.rogerIn,
      W.order1,
    ]);
    expect(rows.map((row) => row.kind)).toEqual([
      "entry",
      "message",
      "entry",
      "entry",
      "entry",
      "message",
    ]);
  });

  it("no status change of a message is a row; the incident's close is, since it refers to the incident", () => {
    const statusRows = rows.filter((row) => row.entry.type === "status_change");
    expect(statusRows.map((row) => row.id)).toEqual([W.incidentClosed]);
    expect(statusRows[0]?.entry.refersTo).toBe(INCIDENT);
    expect(incidentStateOf(walkthrough.entries, INCIDENT)).toBe("closed");
    for (const row of rows) {
      if (row.kind === "entry") {
        expect(row.corrections.every((c) => c.type === "correction")).toBe(true);
      }
    }
  });

  it("a radio message carries its strip: #1 sent · delivered · roger; the courier record has no status, no strip (P3-07)", () => {
    const order1 = messageRow(rows, W.order1);
    expect(order1.status).toBe("roger");
    expect(strip(order1)).toEqual([
      "sent 2026-10-28T19:00:02Z",
      "delivered 2026-10-28T19:00:09Z",
      "roger 2026-10-28T19:03:40Z",
    ]);
    const courier2 = messageRow(rows, W.courier2);
    expect(courier2.entry.transport).toBe("courier");
    expect(courier2.entry.seqNo).toBeUndefined();
    expect(courier2.entry.text).toBe("Pumpe på vej til nr 4 med Peter på cykel");
    expect(courier2.status).toBeNull();
    expect(courier2.strip).toEqual([]);
  });

  it("the transitions are the row's history, oldest first, with operator and reason; a stored pending is not among them; a plain record has none", () => {
    const order1 = messageRow(rows, W.order1);
    expect(order1.history.map((item) => item.entry.id)).toEqual([
      W.order1Sent,
      W.order1Delivered,
      W.order1Roger,
    ]);
    expect(order1.history.every((item) => item.corrections.length === 0)).toBe(true);
    const courier2 = messageRow(rows, W.courier2);
    expect(courier2.history).toEqual([]);
    // Its follow-up is the walkthrough's point, which is no row and no history.
    expect(entry(W.courier2Point).type).toBe("point");
    expect(entry(W.courier2PointClosed).refersTo).toBe(W.courier2Point);
  });

  it("a correction never changes the original entry; the row reads the correction's text as its current one (P3-02)", () => {
    const noteRow = rowFor(rows, W.note);
    expect(noteRow.kind).toBe("entry");
    expect(noteRow.entry.text).toBe("Ringede til forsyningen, kø, ingen svar");
    if (noteRow.kind === "entry") {
      expect(noteRow.corrections.map((c) => c.id)).toEqual([W.noteCorrection]);
      expect(currentText(noteRow.entry, noteRow.corrections)).toBe(
        "Det var kommunens vagt, ikke forsyningen",
      );
      expect(textVersions(noteRow.entry, noteRow.corrections).map((v) => v.id)).toEqual([
        W.note,
        W.noteCorrection,
      ]);
    }
    expect(entry(W.note).text).toBe("Ringede til forsyningen, kø, ingen svar");
  });

  it("incoming rows carry nothing: no corrections, no answers yet", () => {
    for (const incoming of [W.rogerIn, W.freeTextIn]) {
      const row = rowFor(rows, incoming);
      expect(row.kind).toBe("entry");
      if (row.kind === "entry") {
        expect(row.corrections).toEqual([]);
        expect(row.answeredBy).toEqual([]);
      }
    }
    expect(messageRow(rows, W.order1).answers).toBeNull();
    expect(messageRow(rows, W.courier2).answers).toBeNull();
  });

  it("an old journal with pending status changes renders identically to one without them", () => {
    const withoutPending = walkthrough.entries.filter((e) => e.newStatus !== "pending");
    expect(withoutPending).toHaveLength(walkthrough.entries.length - 1);
    expect(buildTimeline(walkthrough.entries)).toEqual(buildTimeline(withoutPending));
    expect(openItems(walkthrough.entries)).toEqual(openItems(withoutPending));
  });

  it("a status change whose message is not in the list is not a row", () => {
    const orphan = statusChange({
      refersTo: "01JB8ZK3QX9V2M4N6P8R0T2X00",
      to: "sent",
      at: "2026-10-28T22:00:00Z",
    });
    const withOrphan = buildTimeline([...walkthrough.entries, orphan]);
    expect(withOrphan.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(findRow(withOrphan, orphan.id)).toBeUndefined();
  });

  it("a radio message with no status change is pending, with a pending strip and no history", () => {
    const only = buildTimeline([entry(W.order1)]);
    const view = messageRow(only, W.order1);
    expect(view.status).toBe("pending");
    expect(view.strip).toEqual([{ kind: "pending", at: null, attempt: null, text: null }]);
    expect(view.history).toEqual([]);
  });

  it("a correction of a transition shows under that transition in the history", () => {
    const correction: JournalEntry = {
      ...entry(W.noteCorrection),
      id: "01JB8ZK3QX9V2M4N6P8R0T2X07",
      deviceSeq: 14,
      refersTo: W.order1Sent,
      text: "Sendt til den forkerte radio",
    };
    const view = messageRow(buildTimeline([...walkthrough.entries, correction]), W.order1);
    expect(view.history[0]?.corrections.map((c) => c.id)).toEqual([correction.id]);
    expect(view.corrections).toEqual([]);
    expect(findRow(buildTimeline([...walkthrough.entries, correction]), correction.id)?.id).toBe(
      W.order1,
    );
  });
});

describe("a message by phone, courier or verbal is a plain record (P3-07)", () => {
  const byPhone = plainOut({
    counterpartyId: HANS,
    text: "Ringede: kør til nr 4",
    at: at(1),
    transport: "phone",
  });

  it("is a message row with null status, no strip, no history, and never an open item", () => {
    const rows = buildTimeline([...walkthrough.entries, byPhone]);
    const view = messageRow(rows, byPhone.id);
    expect(view).toMatchObject({ status: null, strip: [], history: [], answers: null });
    expect(bodyOf(byPhone)).toBe("Ringede: kør til nr 4");
    expect(isDrillText(byPhone)).toBe(false);
    expect(openItems([...walkthrough.entries, byPhone]).get(HANS)).toBeUndefined();
    // The walkthrough's courier record likewise: no open item for Hans at all.
    expect(openItems(walkthrough.entries)).toEqual(new Map());
  });

  it("a status change referring to it is not its history and not a row; a note referring to it is a plain row", () => {
    // The store never writes either (appendStatusChange refuses); were one in the data, it
    // is ignored like a stray status change on a point.
    const stray = statusChange({ refersTo: byPhone.id, to: "sent", at: at(2) });
    const resend = note({ text: "ringede igen", at: at(3), refersTo: byPhone.id });
    const rows = buildTimeline([...walkthrough.entries, byPhone, stray, resend]);
    expect(messageRow(rows, byPhone.id)).toMatchObject({ status: null, strip: [], history: [] });
    expect(findRow(rows, stray.id)).toBeUndefined();
    expect(rowFor(rows, resend.id).kind).toBe("entry");
    expect(openItems([...walkthrough.entries, byPhone, stray])).toEqual(new Map());
  });

  it("a reply by phone links to the incoming message like a radio reply", () => {
    const reply = plainOut({
      counterpartyId: HANS,
      text: "Pumpe på vej",
      at: at(5),
      transport: "phone",
      refersTo: W.freeTextIn,
    });
    const rows = buildTimeline([...walkthrough.entries, reply]);
    expect(messageRow(rows, reply.id).answers?.id).toBe(W.freeTextIn);
    const incoming = rowFor(rows, W.freeTextIn);
    expect(incoming.kind === "entry" && incoming.answeredBy.map((e) => e.id)).toEqual([reply.id]);
  });

  it("the walkthrough's point sits on its courier record: the glyph on the row, closed with its reason", () => {
    const views = pointsFor(walkthrough.entries);
    expect(views).toHaveLength(1);
    expect(pointOf(views, W.courier2)).toMatchObject({
      title: "Peter med pumpe til nr 4 — tilbage?",
      state: "closed",
      closedAt: "2026-10-28T19:40:00Z",
      reason: "Peter tilbage 19:40, pumpen afleveret",
    });
    expect(pointOf(views, W.courier2)?.origin?.id).toBe(W.courier2);
  });
});

describe("the current text of a corrected entry (P3-02)", () => {
  const noteEntry = entry(W.note);
  const first = entry(W.noteCorrection);
  // A second correction minted later (a higher ULID) but stamped earlier: a clock set back.
  const second: JournalEntry = {
    ...first,
    id: "01JB8ZK3QX9V2M4N6P8R0T2W99",
    deviceSeq: 14,
    timestamp: "2026-10-28T19:30:00Z",
    text: "Det var kommunens vagt",
  };

  it("is the entry's own text, with no versions, when it was never corrected", () => {
    expect(currentText(noteEntry, [])).toBe("Ringede til forsyningen, kø, ingen svar");
    expect(textVersions(noteEntry, [])).toEqual([]);
    expect(currentText({ ...noteEntry, text: undefined }, [])).toBe("");
  });

  it("picks the latest correction by ULID, not by timestamp or list order", () => {
    expect(currentText(noteEntry, [first, second])).toBe("Det var kommunens vagt");
    expect(currentText(noteEntry, [second, first])).toBe("Det var kommunens vagt");
    expect(textVersions(noteEntry, [second, first]).map((v) => v.id)).toEqual([
      W.note,
      W.noteCorrection,
      second.id,
    ]);
  });

  it("correctionsByTarget files every correction under the entry it refers to", () => {
    const map = correctionsByTarget([...walkthrough.entries, second]);
    expect([...map.keys()]).toEqual([W.note]);
    expect(map.get(W.note)?.map((c) => c.id)).toEqual([W.noteCorrection, second.id]);
    expect(correctionsByTarget([noteEntry])).toEqual(new Map());
  });

  it("splits a message's text into its fixed prefix and the body, on any text", () => {
    const order = entry(W.order1);
    expect(splitPrefix(order, "#1 Meld status")).toEqual({ prefix: "#1 ", body: "Meld status" });
    expect(splitPrefix(order, "ØVELSE #1 Meld status")).toEqual({
      prefix: "ØVELSE #1 ",
      body: "Meld status",
    });
    expect(splitPrefix(order, "#2 Meld status")).toEqual({ prefix: "", body: "#2 Meld status" });
    expect(splitPrefix(noteEntry, "#1 x")).toEqual({ prefix: "", body: "#1 x" });
  });

  it("a timeline built live after a correction reads the new text and keeps the row where it was", () => {
    const corrected = buildTimeline([...walkthrough.entries, second]);
    expect(corrected.map((row) => row.id)).toEqual(
      buildTimeline(walkthrough.entries).map((r) => r.id),
    );
    const noteRow = rowFor(corrected, W.note);
    expect(noteRow.kind === "entry" && currentText(noteRow.entry, noteRow.corrections)).toBe(
      "Det var kommunens vagt",
    );
    expect(findRow(corrected, second.id)?.id).toBe(W.note);
  });

  it("an open item carries the message's corrected text", () => {
    const order = messageOut({
      counterpartyId: HANS,
      seqNo: 2,
      body: "Pumpe til Nørregade 4",
      at: "2026-10-28T19:50:00Z",
    });
    const correction: JournalEntry = {
      ...first,
      id: "01JB8ZK3QX9V2M4N6P8R0T2W97",
      deviceSeq: 15,
      refersTo: order.id,
      text: "#2 Pumpe til Nørregade 4, afleveres til Hans",
    };
    expect(
      openItems([...walkthrough.entries, order])
        .get(HANS)
        ?.map((item) => item.text),
    ).toEqual([order.text]);
    expect(
      openItems([...walkthrough.entries, order, correction])
        .get(HANS)
        ?.map((item) => item.text),
    ).toEqual(["#2 Pumpe til Nørregade 4, afleveres til Hans"]);
  });
});

describe("reply from the row (P1-02): the link both ways", () => {
  // The walkthrough's free-text reply, answered from its row: #3 to Hans with refersTo = it.
  const reply = messageOut({
    counterpartyId: HANS,
    seqNo: 3,
    body: "Pumpe på vej til nr 4",
    at: "2026-10-28T19:07:00Z",
    refersTo: W.freeTextIn,
  });

  it("the reply row says which incoming message it answers; the incoming row says it is answered", () => {
    const rows = buildTimeline([...walkthrough.entries, reply]);
    expect(rows.map((row) => row.id)).toEqual([
      W.incidentClosed,
      W.courier2,
      reply.id,
      W.note,
      W.freeTextIn,
      W.rogerIn,
      W.order1,
    ]);
    const view = messageRow(rows, reply.id);
    expect(view.answers?.id).toBe(W.freeTextIn);
    expect(view.answers?.text).toBe("vedr. #1 alle ok, kælder i nr 4 har vand");
    // The reply is an ordinary message otherwise: pending, no history, its own open item.
    expect(view.status).toBe("pending");
    expect(view.history).toEqual([]);
    const incoming = rowFor(rows, W.freeTextIn);
    if (incoming.kind !== "entry") {
      throw new Error("expected an entry row");
    }
    expect(incoming.answeredBy.map((e) => e.id)).toEqual([reply.id]);
    // Both ends are found by findRow, so each mark can scroll to the other.
    expect(findRow(rows, W.freeTextIn)?.id).toBe(W.freeTextIn);
    expect(findRow(rows, reply.id)?.id).toBe(reply.id);
    // The other incoming row and the other messages are unaffected.
    const r1 = rowFor(rows, W.rogerIn);
    expect(r1.kind === "entry" && r1.answeredBy).toEqual([]);
    expect(messageRow(rows, W.order1).answers).toBeNull();
  });

  it("two answers to one incoming message are both listed, oldest first", () => {
    const second = plainOut({
      counterpartyId: HANS,
      text: "Peter er der om 10 min",
      at: "2026-10-28T19:12:00Z",
      refersTo: W.freeTextIn,
      transport: "courier",
    });
    const rows = buildTimeline([second, ...walkthrough.entries, reply]);
    const incoming = rowFor(rows, W.freeTextIn);
    expect(incoming.kind === "entry" && incoming.answeredBy.map((e) => e.id)).toEqual([
      reply.id,
      second.id,
    ]);
    expect(messageRow(rows, second.id).answers?.id).toBe(W.freeTextIn);
  });

  it("a refersTo that is not a message_in in the list is no link", () => {
    // Refers to a note: not an answer. Refers to an entry outside the list: nothing to show.
    const toNote = messageOut({
      counterpartyId: HANS,
      seqNo: 5,
      body: "x",
      at: at(1),
      refersTo: W.note,
    });
    const toNowhere = messageOut({
      counterpartyId: HANS,
      seqNo: 6,
      body: "y",
      at: at(2),
      refersTo: "01JB8ZK3QX9V2M4N6P8R0T2X00",
    });
    const rows = buildTimeline([...walkthrough.entries, toNote, toNowhere]);
    expect(messageRow(rows, toNote.id).answers).toBeNull();
    expect(messageRow(rows, toNowhere.id).answers).toBeNull();
    const noteRow = rowFor(rows, W.note);
    expect(noteRow.kind === "entry" && noteRow.answeredBy).toEqual([]);
    // The note's correction is still its correction; nothing else moved.
    expect(noteRow.kind === "entry" && noteRow.corrections.map((c) => c.id)).toEqual([
      W.noteCorrection,
    ]);
  });

  it("a reply inside a batch is still a batch recipient; its view carries the link", () => {
    const BATCH = "01JB8ZK3QX9V2M4N6P8R0T2X11";
    const inBatch = messageOut({
      counterpartyId: HANS,
      seqNo: 3,
      body: "Meld status",
      at: at(1),
      batchId: BATCH,
      refersTo: W.freeTextIn,
    });
    const other = messageOut({
      counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2W70",
      seqNo: 1,
      body: "Meld status",
      at: at(1, 1),
      batchId: BATCH,
    });
    const rows = buildTimeline([...walkthrough.entries, inBatch, other]);
    const batch = rowFor(rows, BATCH);
    if (batch.kind !== "batch") {
      throw new Error("expected a batch row");
    }
    expect(batch.messages.map((view) => view.answers?.id ?? null)).toEqual([W.freeTextIn, null]);
    const incoming = rowFor(rows, W.freeTextIn);
    expect(incoming.kind === "entry" && incoming.answeredBy.map((e) => e.id)).toEqual([inBatch.id]);
    expect(findRow(rows, inBatch.id)?.id).toBe(BATCH);
  });
});

describe("the status strip", () => {
  const message = messageOut({ counterpartyId: HANS, seqNo: 3, body: "Meld status", at: at(1) });

  it("shows the latest resend attempt on waiting, and every attempt in the history", () => {
    const chain = [
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 2) }),
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 20), text: "attempt 2/3" }),
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 38), text: "attempt 3/3" }),
    ];
    const view = messageRow(buildTimeline([message, ...chain]), message.id);
    expect(view.status).toBe("sent");
    expect(strip(view)).toEqual([`sent ${at(1, 2)}`, "waiting attempt 3/3"]);
    expect(view.history).toHaveLength(3);
    // After the first attempt alone: waiting, with no attempt text.
    expect(statusStrip(chain.slice(0, 1))).toEqual([
      { kind: "sent", at: at(1, 2), attempt: null, text: null },
      { kind: "waiting", at: null, attempt: null, text: null },
    ]);
    // Every item carries its transition's text, for the status column's tooltips (P3-03).
    expect(statusStrip(chain).map((item) => item.text)).toEqual([null, null]);
    const givenUp = statusStrip([
      ...chain,
      statusChange({ refersTo: message.id, to: "given_up", at: at(2), text: "no ack" }),
    ]);
    expect(givenUp.map((item) => [item.kind, item.text])).toEqual([
      ["sent", null],
      ["given_up", "no ack"],
    ]);
  });

  it("given up after the attempts: sent · given up", () => {
    const chain = [
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 2) }),
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 20), text: "attempt 2/2" }),
      statusChange({ refersTo: message.id, to: "given_up", at: at(1, 40), text: "no ack" }),
    ];
    expect(strip(messageRow(buildTimeline([message, ...chain]), message.id))).toEqual([
      `sent ${at(1, 2)}`,
      `given_up ${at(1, 40)}`,
    ]);
  });

  it("given up with no radio: given up alone", () => {
    const chain = [
      statusChange({ refersTo: message.id, to: "given_up", at: at(1, 1), text: "no radio" }),
    ];
    expect(strip(messageRow(buildTimeline([message, ...chain]), message.id))).toEqual([
      `given_up ${at(1, 1)}`,
    ]);
  });

  it("a manual retry after given up starts the strip afresh; the history keeps everything", () => {
    const chain = [
      statusChange({ refersTo: message.id, to: "sent", at: at(1, 2) }),
      statusChange({ refersTo: message.id, to: "given_up", at: at(1, 40) }),
      statusChange({ refersTo: message.id, to: "sent", at: at(5) }),
      statusChange({ refersTo: message.id, to: "delivered", at: at(5, 3) }),
    ];
    expect(currentRun(chain).map((c) => c.newStatus)).toEqual(["sent", "delivered"]);
    const view = messageRow(buildTimeline([message, ...chain]), message.id);
    expect(strip(view)).toEqual([`sent ${at(5)}`, `delivered ${at(5, 3)}`]);
    expect(view.history).toHaveLength(4);
  });

  it("a resend note from before P1-01 is history, not a row", () => {
    const resend = note({ text: "resend #3, attempt 2/3", at: at(1, 20), refersTo: message.id });
    const plain = note({ text: "Ringede til Hans", at: at(2) });
    const rows = buildTimeline([message, resend, plain]);
    expect(rows.map((row) => row.id)).toEqual([plain.id, message.id]);
    const view = messageRow(rows, message.id);
    expect(view.history.map((item) => item.entry.id)).toEqual([resend.id]);
    // The note is not a status change: the strip ignores it.
    expect(view.strip).toEqual([{ kind: "pending", at: null, attempt: null, text: null }]);
  });

  it("the body is the text without its #n prefix", () => {
    expect(bodyOf(message)).toBe("Meld status");
    expect(bodyOf({ ...message, text: "no prefix" })).toBe("no prefix");
    expect(bodyOf({ ...message, seqNo: undefined })).toBe("#3 Meld status");
  });

  it("a drill's text is read as such: the body is without 'ØVELSE #n ' and the batch row says drill (P1-05)", () => {
    const drilled = { ...message, text: "ØVELSE #3 Meld status" };
    expect(bodyOf(drilled)).toBe("Meld status");
    expect(isDrillText(drilled)).toBe(true);
    expect(isDrillText(message)).toBe(false);
    // The prefix has to be exact: a different number or a word after it is not the prefix.
    expect(isDrillText({ ...message, text: "ØVELSE #4 Meld status" })).toBe(false);
    expect(bodyOf({ ...message, text: "ØVELSE #4 Meld status" })).toBe("ØVELSE #4 Meld status");
    expect(isDrillText({ ...message, text: "ØVELSE: #3 Meld status" })).toBe(false);
    expect(isDrillText({ ...message, seqNo: undefined, text: "ØVELSE #3 Meld status" })).toBe(
      false,
    );

    const BATCH = "01JB8ZK3QX9V2M4N6P8R0T2X11";
    const drillBatch = [HANS, id(950)].map((counterpartyId, i) => {
      const out = messageOut({
        counterpartyId,
        seqNo: 1,
        body: "Meld status",
        at: at(20, i),
        batchId: BATCH,
      });
      return { ...out, text: `ØVELSE ${out.text}` };
    });
    const realBatch = [HANS, id(951)].map((counterpartyId, i) =>
      messageOut({
        counterpartyId,
        seqNo: 2,
        body: "Meld status",
        at: at(21, i),
        batchId: id(960),
      }),
    );
    const rows = buildTimeline([...drillBatch, ...realBatch]);
    const drillRow = rows.find((row) => row.id === BATCH);
    const realRow = rows.find((row) => row.id === id(960));
    expect(drillRow?.kind === "batch" && { body: drillRow.body, drill: drillRow.drill }).toEqual({
      body: "Meld status",
      drill: true,
    });
    expect(realRow?.kind === "batch" && { body: realRow.body, drill: realRow.drill }).toEqual({
      body: "Meld status",
      drill: false,
    });
  });
});

describe("send-to-all as one row (P1-01)", () => {
  const BATCH = "01JB8ZK3QX9V2M4N6P8R0T2X10";
  const recipients = Array.from({ length: 25 }, (_, i) => id(900 + i));
  const messages = recipients.map((counterpartyId, i) =>
    messageOut({ counterpartyId, seqNo: 1, body: "Meld status", at: at(10, i), batchId: BATCH }),
  );
  // 25 sent; 23 delivered of which 18 roger; 1 given up after sent; 1 still waiting.
  const chain: JournalEntry[] = [];
  messages.forEach((message, i) => {
    chain.push(statusChange({ refersTo: message.id, to: "sent", at: at(11, i) }));
    if (i < 23) {
      chain.push(statusChange({ refersTo: message.id, to: "delivered", at: at(12, i) }));
    }
    if (i < 18) {
      chain.push(statusChange({ refersTo: message.id, to: "roger", at: at(13, i) }));
    }
    if (i === 23) {
      chain.push(
        statusChange({ refersTo: message.id, to: "given_up", at: at(14), text: "no ack" }),
      );
    }
  });
  const single = messageOut({ counterpartyId: HANS, seqNo: 7, body: "alene", at: at(20) });
  const entries = [...messages, ...chain, single];

  it("renders the 25 messages as one row with the counters and the slowest state", () => {
    const rows = buildTimeline([...entries].reverse());
    expect(rows.map((row) => row.kind)).toEqual(["message", "batch"]);
    const batch = rows[1];
    if (batch?.kind !== "batch") {
      throw new Error("expected a batch row");
    }
    expect(batch.id).toBe(BATCH);
    expect(batch.entry.id).toBe(messages[0]?.id);
    expect(batch.body).toBe("Meld status");
    expect(batch.counters).toEqual({
      total: 25,
      pending: 0,
      sent: 25,
      delivered: 23,
      roger: 18,
      givenUp: 1,
      closed: 0,
    });
    expect(batch.status).toBe("given_up");
    // Expanding lists every recipient's own row with its own strip, in storage order.
    expect(batch.messages.map((view) => view.entry.counterpartyId)).toEqual(recipients);
    expect(strip(batch.messages[0] as MessageView)).toEqual([
      `sent ${at(11, 0)}`,
      `delivered ${at(12, 0)}`,
      `roger ${at(13, 0)}`,
    ]);
    expect(strip(batch.messages[23] as MessageView)).toEqual([
      `sent ${at(11, 23)}`,
      `given_up ${at(14)}`,
    ]);
    expect(strip(batch.messages[24] as MessageView)).toEqual([`sent ${at(11, 24)}`, "waiting"]);
    // The single send is its own row.
    expect(rows[0]?.id).toBe(single.id);
  });

  it("a late ack updates the counters live", () => {
    const waiting = messages[24] as JournalEntry;
    const ack = statusChange({ refersTo: waiting.id, to: "delivered", at: at(30) });
    const rows = buildTimeline([...entries, ack]);
    const batch = rows.find((row) => row.kind === "batch");
    if (batch?.kind !== "batch") {
      throw new Error("expected a batch row");
    }
    expect(batch.counters.delivered).toBe(24);
    expect(batch.counters.sent).toBe(25);
    expect(batch.status).toBe("given_up");
    expect(strip(batch.messages[24] as MessageView)).toEqual([
      `sent ${at(11, 24)}`,
      `delivered ${at(30)}`,
    ]);
  });

  it("the slowest state is given up when any has given up, else the least advanced status", () => {
    const views = (statuses: Status[]): MessageView[] =>
      statuses.map((status) => ({
        entry: single,
        status,
        strip: [],
        history: [],
        corrections: [],
        answers: null,
        lateRogers: [],
      }));
    expect(slowestStatus(views(["roger", "roger"]))).toBe("roger");
    expect(slowestStatus(views(["roger", "delivered"]))).toBe("delivered");
    expect(slowestStatus(views(["roger", "sent", "delivered"]))).toBe("sent");
    expect(slowestStatus(views(["roger", "pending"]))).toBe("pending");
    expect(slowestStatus(views(["pending", "given_up", "roger"]))).toBe("given_up");
    expect(slowestStatus([])).toBe("roger");
  });

  it("counts what each recipient reached in its current run", () => {
    const fresh = messageOut({ counterpartyId: HANS, seqNo: 8, body: "x", at: at(1) });
    const views = buildTimeline([
      fresh,
      ...messages.slice(0, 2),
      statusChange({
        refersTo: messages[0]?.id ?? "",
        to: "given_up",
        at: at(2),
        text: "no radio",
      }),
    ]);
    const batch = views.find((row) => row.kind === "batch");
    if (batch?.kind !== "batch") {
      throw new Error("expected a batch row");
    }
    // One given up before any sent, one pending.
    expect(batchCounters(batch.messages)).toEqual({
      total: 2,
      pending: 1,
      sent: 0,
      delivered: 0,
      roger: 0,
      givenUp: 1,
      closed: 0,
    });
  });

  it("counts the recipients the staff closed under closed (P3-09); they stay in the batch's row", () => {
    const [first, second] = messages as [JournalEntry, JournalEntry];
    const views = buildTimeline([
      first,
      second,
      statusChange({ refersTo: first.id, to: "sent", at: at(2) }),
      statusChange({ refersTo: first.id, to: "closed", at: at(3), text: "" }),
      statusChange({ refersTo: second.id, to: "sent", at: at(2) }),
      statusChange({ refersTo: second.id, to: "given_up", at: at(3), text: "no ack" }),
    ]);
    const batch = views.find((row) => row.kind === "batch");
    if (batch?.kind !== "batch") {
      throw new Error("expected a batch row");
    }
    expect(batch.counters).toEqual({
      total: 2,
      pending: 0,
      sent: 2,
      delivered: 0,
      roger: 0,
      givenUp: 1,
      closed: 1,
    });
    expect(batch.messages.map((view) => view.status)).toEqual(["closed", "given_up"]);
    expect(batch.status).toBe("given_up");
  });

  it("the batch row is positioned by its first message, newest first among the rows", () => {
    const before = note({ text: "før", at: at(9) });
    const between = note({ text: "midt i", at: at(10, 5) });
    const after = note({ text: "efter", at: at(15) });
    const rows = buildTimeline([...messages, before, between, after]);
    expect(rows.map((row) => row.id)).toEqual([after.id, between.id, BATCH, before.id]);
  });

  it("findRow finds a recipient's message inside its batch", () => {
    const rows = buildTimeline(entries);
    expect(findRow(rows, messages[7]?.id ?? "")?.id).toBe(BATCH);
    expect(findRow(rows, chain[0]?.id ?? "")?.id).toBe(BATCH);
    expect(findRow(rows, single.id)?.id).toBe(single.id);
    expect(findRow(rows, "01JB8ZK3QX9V2M4N6P8R0T2X99")).toBeUndefined();
  });

  it("counts the rows the operator has not seen since scrolling down", () => {
    const rows = buildTimeline(entries);
    const seen = new Set(rows.map((row) => row.id));
    expect(countNewRows(rows, seen)).toBe(0);
    const later = buildTimeline([...entries, note({ text: "ny", at: at(40) })]);
    expect(countNewRows(later, seen)).toBe(1);
    expect(countNewRows(later, new Set())).toBe(3);
  });
});

describe("open items per register entry", () => {
  // The walkthrough plus one radio message to Hans, sent and delivered: the one open item.
  const order2 = messageOut({ counterpartyId: HANS, seqNo: 2, body: "Kør til nr 4", at: at(10) });
  const order2Chain = [
    statusChange({ refersTo: order2.id, to: "sent", at: at(10, 2) }),
    statusChange({
      refersTo: order2.id,
      to: "delivered",
      at: at(10, 9),
      text: "round trip 800 ms",
    }),
  ];
  const withOrder2 = [...walkthrough.entries, order2, ...order2Chain];

  it("lists pending, sent and delivered radio messages; flags given up; hides roger; never a message by hand (P3-07)", () => {
    // The walkthrough alone: #1 is roger (closed) and the courier record has no status.
    expect(openItems(walkthrough.entries)).toEqual(new Map());
    const hans = openItems(withOrder2).get(HANS) ?? [];
    expect(hans.map((item) => item.message.id)).toEqual([order2.id]);
    expect(hans[0]).toMatchObject({ status: "delivered", givenUp: false });
  });

  it("an open item carries the message's strip, the one the timeline shows (P3-03)", () => {
    const item = openItems(withOrder2).get(HANS)?.[0];
    expect(item?.strip).toEqual(messageRow(buildTimeline(withOrder2), order2.id).strip);
    expect(item?.strip.map((entry) => [entry.kind, entry.text])).toEqual([
      ["sent", null],
      ["delivered", "round trip 800 ms"],
    ]);
    const fresh = messageOut({ counterpartyId: HANS, seqNo: 9, body: "x", at: at(50) });
    expect(openItems([...walkthrough.entries, fresh]).get(HANS)?.[0]?.strip).toEqual([
      { kind: "pending", at: null, attempt: null, text: null },
    ]);
  });

  it("is derived live: a status_change -> roger removes the item without anything else changing", () => {
    const roger = statusChange({
      refersTo: order2.id,
      to: "roger",
      at: "2026-10-28T21:30:00Z",
      text: "Hans rang",
    });
    expect(openItems(withOrder2).get(HANS)).toHaveLength(1);
    expect(openItems([...withOrder2, roger]).get(HANS)).toBeUndefined();
    const timeline = buildTimeline([...withOrder2, roger]);
    expect(messageRow(timeline, order2.id).status).toBe("roger");
  });

  it("flags a given-up message instead of hiding it, and a retry puts it back among the open", () => {
    const givenUp = statusChange({
      refersTo: order2.id,
      to: "given_up",
      at: "2026-10-28T21:30:00Z",
      text: "no ack after 3 attempts",
    });
    const flagged = openItems([...withOrder2, givenUp]).get(HANS) ?? [];
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ status: "given_up", givenUp: true });

    const retried = statusChange({ refersTo: order2.id, to: "sent", at: "2026-10-28T21:35:00Z" });
    const open = openItems([...withOrder2, givenUp, retried]).get(HANS) ?? [];
    expect(open[0]).toMatchObject({ status: "sent", givenUp: false });
  });

  it("groups by recipient, newest first within a group, the groups by their newest item (P1-01)", () => {
    const peter = "01JB8ZK3QX9V2M4N6P8R0T2W70";
    const toPeter = messageOut({
      counterpartyId: peter,
      seqNo: 1,
      body: "Meld status",
      at: "2026-10-28T19:20:00Z",
    });
    const toHansLater = messageOut({
      counterpartyId: HANS,
      seqNo: 3,
      body: "Nyt",
      at: "2026-10-28T19:50:00Z",
    });
    const groups = openItems([...withOrder2, toPeter, toHansLater]);
    // Hans has the newest open item (#2 at 20:10), so his group comes first; within it the
    // newest first.
    expect([...groups.keys()]).toEqual([HANS, peter]);
    expect(groups.get(HANS)?.map((item) => item.message.id)).toEqual([order2.id, toHansLater.id]);
    expect(groups.get(peter)?.[0]?.status).toBe("pending");
  });
});

describe("a radio message the staff closed (P3-09)", () => {
  // #2 to Hans, sent and delivered, no R; the staff close it at 20:40 with a note.
  const order2 = messageOut({ counterpartyId: HANS, seqNo: 2, body: "Kør til nr 4", at: at(10) });
  const chain = [
    statusChange({ refersTo: order2.id, to: "sent", at: at(10, 2) }),
    statusChange({ refersTo: order2.id, to: "delivered", at: at(10, 9) }),
  ];
  const closed = statusChange({
    refersTo: order2.id,
    to: "closed",
    at: at(40),
    text: "Hans er kørt, ingen R",
    operator: "Anne",
  });
  const entries = [...walkthrough.entries, order2, ...chain, closed];

  it("has status closed, the close as the last strip item with its note, the close in its history", () => {
    const view = messageRow(buildTimeline(entries), order2.id);
    expect(view.status).toBe("closed");
    expect(strip(view)).toEqual([
      `sent ${at(10, 2)}`,
      `delivered ${at(10, 9)}`,
      `closed ${at(40)}`,
    ]);
    expect(view.strip.at(-1)).toMatchObject({ kind: "closed", text: "Hans er kørt, ingen R" });
    expect(view.history.map((item) => item.entry.newStatus)).toEqual([
      "sent",
      "delivered",
      "closed",
    ]);
    expect(view.history.at(-1)?.entry.operator).toBe("Anne");
    expect(view.lateRogers).toEqual([]);
  });

  it("a close without a note stores an empty text, which the strip reads as none", () => {
    const bare = statusChange({ refersTo: order2.id, to: "closed", at: at(40), text: "" });
    const view = messageRow(
      buildTimeline([...walkthrough.entries, order2, ...chain, bare]),
      order2.id,
    );
    expect(view.status).toBe("closed");
    expect(view.strip.at(-1)).toEqual({ kind: "closed", at: at(40), attempt: null, text: null });
  });

  it("leaves the open items: closed is final, like roger; derived live", () => {
    expect(openItems([...walkthrough.entries, order2, ...chain]).get(HANS)).toHaveLength(1);
    expect(openItems(entries).get(HANS)).toBeUndefined();
    expect(openItems(entries)).toEqual(new Map());
  });

  it("a late Rn for it is an ordinary incoming row, listed on the closed message as a late roger by the exact match", () => {
    const lateR2 = messageIn({ counterpartyId: HANS, text: "R2", at: at(45) });
    const rows = buildTimeline([...entries, lateR2]);
    // Its own row, like any incoming message; no status change refers to it.
    expect(rowFor(rows, lateR2.id).kind).toBe("entry");
    const view = messageRow(rows, order2.id);
    expect(view.status).toBe("closed");
    expect(view.lateRogers.map((entry) => entry.id)).toEqual([lateR2.id]);
    expect(findRow(rows, lateR2.id)?.id).toBe(lateR2.id);
    expect(lateRogerIds([...entries, lateR2])).toEqual(new Set([lateR2.id]));
  });

  it("the match is exact: the right number, the same counterparty, after the close — a bare R, another number, a text with R2 in it, an earlier R2 or another radio's R2 are not late rogers", () => {
    const peter = "01JB8ZK3QX9V2M4N6P8R0T2W70";
    const candidates = [
      messageIn({ counterpartyId: HANS, text: " r2 \n", at: at(45) }),
      messageIn({ counterpartyId: HANS, text: "R", at: at(46) }),
      messageIn({ counterpartyId: HANS, text: "R3", at: at(47) }),
      messageIn({ counterpartyId: HANS, text: "R2 tak", at: at(48) }),
      messageIn({ counterpartyId: HANS, text: "R2", at: at(39) }),
      messageIn({ counterpartyId: peter, text: "R2", at: at(49) }),
    ];
    const incoming = [...walkthrough.entries, ...candidates].filter((e) => e.type === "message_in");
    const late = lateRogersOf(order2, [...chain, closed], incoming);
    expect(late.map((entry) => entry.text)).toEqual([" r2 \n"]);
    // Not closed: nothing is a late roger, whatever came in.
    expect(lateRogersOf(order2, chain, incoming)).toEqual([]);
    // Two late R2s, oldest first.
    const again = messageIn({ counterpartyId: HANS, text: "R2", at: at(50) });
    expect(
      lateRogersOf(order2, [...chain, closed], [...incoming, again]).map((entry) => entry.text),
    ).toEqual([" r2 \n", "R2"]);
  });

  it("a closed message is never a row of the open or the given-up lists, and a stray status change after the close does not reopen it", () => {
    // The store refuses anything after closed (closeByHand, recordManualStatus); were a
    // later `sent` in the data, status.ts reads the latest, as always — this is not a
    // rule about reopening, just the derivation.
    const view = messageRow(buildTimeline(entries), order2.id);
    expect(view.status).toBe("closed");
    expect(slowestStatus([view])).toBe("closed");
  });
});

describe("points (P3-05)", () => {
  // The walkthrough — which carries one point of its own, on the courier record, closed
  // 19:40 (P3-07) — plus two points: one on the free-text reply, open; one on the note,
  // closed with a reason.
  const COURIER_POINT = "Peter med pumpe til nr 4 — tilbage?";
  const onReply = point({
    refersTo: W.freeTextIn,
    text: "Kælder i nr 4: pumpe",
    at: "2026-10-28T19:06:30Z",
  });
  const onNote = point({
    refersTo: W.note,
    text: "Ring til forsyningen igen",
    at: "2026-10-28T19:07:00Z",
  });
  const closed = statusChange({
    refersTo: onNote.id,
    to: "closed",
    at: "2026-10-28T19:45:00Z",
    text: "Kommunens vagt ringede",
    operator: "Anne",
  });
  const entries = [...walkthrough.entries, onNote, closed, onReply];

  it("pointsFor: every point oldest first with its origin, state, times and reason", () => {
    const views = pointsFor([...entries].reverse());
    expect(views.map((view) => view.point.id)).toEqual([onReply.id, onNote.id, W.courier2Point]);
    expect(views[2]).toMatchObject({
      title: COURIER_POINT,
      state: "closed",
      openedAt: "2026-10-28T19:10:00Z",
      closedAt: "2026-10-28T19:40:00Z",
      closedBy: "Thomas",
      reason: "Peter tilbage 19:40, pumpen afleveret",
      changedAt: "2026-10-28T19:40:00Z",
    });
    expect(views[2]?.origin?.id).toBe(W.courier2);
    expect(views[0]).toMatchObject({
      title: "Kælder i nr 4: pumpe",
      state: "open",
      openedAt: "2026-10-28T19:06:30Z",
      closedAt: null,
      closedBy: null,
      reason: null,
      changedAt: "2026-10-28T19:06:30Z",
    });
    expect(views[0]?.origin?.id).toBe(W.freeTextIn);
    expect(views[1]).toMatchObject({
      title: "Ring til forsyningen igen",
      state: "closed",
      openedAt: "2026-10-28T19:07:00Z",
      closedAt: "2026-10-28T19:45:00Z",
      closedBy: "Anne",
      reason: "Kommunens vagt ringede",
      changedAt: "2026-10-28T19:45:00Z",
    });
    expect(views[1]?.origin?.id).toBe(W.note);
  });

  it("pointOf finds the point of an origin entry; an entry without one has none", () => {
    const views = pointsFor(entries);
    expect(pointOf(views, W.note)?.point.id).toBe(onNote.id);
    expect(pointOf(views, W.freeTextIn)?.point.id).toBe(onReply.id);
    expect(pointOf(views, W.courier2)?.point.id).toBe(W.courier2Point);
    expect(pointOf(views, W.order1)).toBeUndefined();
    expect(pointOf(views, onNote.id)).toBeUndefined();
  });

  it("open points oldest first, closed points newest closed first", () => {
    const another = point({ refersTo: W.order1, text: "Følg op på #1", at: at(5) });
    const anotherClosed = statusChange({
      refersTo: another.id,
      to: "closed",
      at: at(20),
      text: "Hans meldte ok",
    });
    const views = pointsFor([...entries, another, anotherClosed]);
    expect(openPoints(views).map((view) => view.title)).toEqual(["Kælder i nr 4: pumpe"]);
    expect(closedPoints(views).map((view) => view.title)).toEqual([
      "Følg op på #1",
      "Ring til forsyningen igen",
      COURIER_POINT,
    ]);
  });

  it("is derived live: reopened makes the point open again from the reopening's time; a later close wins", () => {
    const reopened = statusChange({
      refersTo: onNote.id,
      to: "reopened",
      at: "2026-10-28T19:50:00Z",
      operator: "Bo",
    });
    const views = pointsFor([...entries, reopened]);
    expect(pointOf(views, W.note)).toMatchObject({
      state: "open",
      openedAt: "2026-10-28T19:50:00Z",
      closedAt: null,
      reason: null,
      changedAt: "2026-10-28T19:50:00Z",
    });
    const closedAgain = statusChange({
      refersTo: onNote.id,
      to: "closed",
      at: "2026-10-28T19:55:00Z",
      text: "ok nu",
    });
    expect(pointOf(pointsFor([...entries, reopened, closedAgain]), W.note)).toMatchObject({
      state: "closed",
      reason: "ok nu",
      closedAt: "2026-10-28T19:55:00Z",
    });
    // A status change of another kind referring to a point is not read.
    const stray = statusChange({ refersTo: onReply.id, to: "sent", at: at(30) });
    expect(pointOf(pointsFor([...entries, stray]), W.freeTextIn)?.state).toBe("open");
  });

  it("a corrected title reads its correction", () => {
    const correction: JournalEntry = {
      ...note({ text: "Ring til kommunens vagt igen", at: at(40) }),
      type: "correction",
      refersTo: onNote.id,
    };
    expect(pointOf(pointsFor([...entries, correction]), W.note)?.title).toBe(
      "Ring til kommunens vagt igen",
    );
  });

  it("a point and its status changes are never rows of the timeline, and nothing else moves", () => {
    const rows = buildTimeline(entries);
    expect(rows.map((row) => row.id)).toEqual(
      buildTimeline(walkthrough.entries).map((row) => row.id),
    );
    expect(findRow(rows, onNote.id)).toBeUndefined();
    expect(findRow(rows, closed.id)).toBeUndefined();
    expect(findRow(rows, W.note)?.id).toBe(W.note);
    // A point's origin keeps its own corrections and nothing of the point.
    const noteRow = rowFor(rows, W.note);
    expect(noteRow.kind === "entry" && noteRow.corrections.map((c) => c.id)).toEqual([
      W.noteCorrection,
    ]);
    expect(openItems(entries)).toEqual(openItems(walkthrough.entries));
  });

  it("the walkthrough's one point is the courier record's, closed; an empty journal has none", () => {
    expect(pointsFor(walkthrough.entries).map((view) => [view.title, view.state])).toEqual([
      [COURIER_POINT, "closed"],
    ]);
    expect(openPoints(pointsFor(walkthrough.entries))).toEqual([]);
    expect(pointsFor([])).toEqual([]);
    expect(pointsFor(walkthrough.entries.filter((e) => e.id !== W.courier2Point))).toEqual([]);
  });
});

describe("last heard from", () => {
  const register: RegisterEntry[] = [
    ...walkthrough.register,
    {
      id: "01JB8ZK3QX9V2M4N6P8R0T2W70",
      publicKey: "a".repeat(64),
      label: "Peter",
      origin: "issued",
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: DEVICE,
    },
    {
      id: "01JB8ZK3QX9V2M4N6P8R0T2W71",
      publicKey: "b".repeat(64),
      label: "radio #3",
      origin: "adhoc",
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: DEVICE,
    },
  ];

  it("is the latest message_in per register entry; outgoing messages do not count", () => {
    const heard = lastHeardFrom(walkthrough.entries);
    expect(heard.get(HANS)).toBe(entry(W.freeTextIn).timestamp);
    expect(heard.size).toBe(1);
  });

  it("puts the quiet ones on top (deliberately not newest first): never heard first, then the oldest contact", () => {
    const peter = register[1] as RegisterEntry;
    const earlier = messageIn({
      counterpartyId: peter.id,
      text: "er på plads",
      at: "2026-10-28T18:30:00Z",
    });
    const rows = sortedByLastHeard(register, lastHeardFrom([...walkthrough.entries, earlier]));
    expect(rows.map((row) => row.entry.label)).toEqual(["radio #3", "Peter", "Hans"]);
    expect(rows[0]?.at).toBeNull();
    expect(rows[1]?.at).toBe("2026-10-28T18:30:00Z");
  });

  it("moves an entry down as soon as a new message_in arrives", () => {
    const late = messageIn({
      counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2W71",
      text: "alt vel",
      at: "2026-10-28T21:10:00Z",
    });
    const before = sortedByLastHeard(register, lastHeardFrom(walkthrough.entries));
    expect(before.at(-1)?.entry.label).toBe("Hans");
    const after = sortedByLastHeard(register, lastHeardFrom([...walkthrough.entries, late]));
    expect(after.at(-1)?.entry.label).toBe("radio #3");
    expect(after[0]?.entry.label).toBe("Peter");
  });
});
