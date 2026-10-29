// The journal screen's derivations against contract/examples/walkthrough.json and a
// send-to-all fixture: the phase-0 walkthrough as a stack of slips, newest on top, with the
// status strip on each outgoing message and its transitions folded into a history (P1-01);
// the batch row with its counters; the open items per register entry; "last heard from".
// Everything is a pure function of the entries, so "derived live" is shown by appending an
// entry to the array and deriving again.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  batchCounters,
  bodyOf,
  buildTimeline,
  compareEntries,
  countNewRows,
  currentRun,
  findRow,
  lastHeardFrom,
  openItems,
  slowestStatus,
  sortedByLastHeard,
  sortedNewestFirst,
  sortedOldestFirst,
  statusStrip,
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
  courier2Sent: "01JB8ZK3QX9V2M4N6P8R0T2W60",
  courier2Delivered: "01JB8ZK3QX9V2M4N6P8R0T2W61",
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
  transport?: JournalEntry["transport"];
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
    transport: options.transport ?? "mesh",
    counterpartyId: options.counterpartyId,
    seqNo: options.seqNo,
    batchId: options.batchId,
    refersTo: options.refersTo,
    text: `#${options.seqNo} ${options.body}`,
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

  it("an outgoing message carries its strip: #1 sent · delivered · roger, courier #2 sent · delivered", () => {
    const order1 = messageRow(rows, W.order1);
    expect(order1.status).toBe("roger");
    expect(strip(order1)).toEqual([
      "sent 2026-10-28T19:00:02Z",
      "delivered 2026-10-28T19:00:09Z",
      "roger 2026-10-28T19:03:40Z",
    ]);
    const courier2 = messageRow(rows, W.courier2);
    expect(courier2.status).toBe("delivered");
    expect(strip(courier2)).toEqual([
      "sent 2026-10-28T19:10:00Z",
      "delivered 2026-10-28T19:40:00Z",
    ]);
  });

  it("the transitions are the row's history, oldest first, with operator and reason; a stored pending is not among them", () => {
    const order1 = messageRow(rows, W.order1);
    expect(order1.history.map((item) => item.entry.id)).toEqual([
      W.order1Sent,
      W.order1Delivered,
      W.order1Roger,
    ]);
    expect(order1.history.every((item) => item.corrections.length === 0)).toBe(true);
    const courier2 = messageRow(rows, W.courier2);
    expect(courier2.history.map((item) => [item.entry.operator, item.entry.text])).toEqual([
      ["Thomas", "Peter cyklede 19:10"],
      ["Thomas", "Peter tilbage 19:40, afleveret"],
    ]);
  });

  it("a correction never changes the original row's text; it shows under it", () => {
    const noteRow = rowFor(rows, W.note);
    expect(noteRow.kind).toBe("entry");
    expect(noteRow.entry.text).toBe("Ringede til forsyningen, kø, ingen svar");
    if (noteRow.kind === "entry") {
      expect(noteRow.corrections.map((c) => c.id)).toEqual([W.noteCorrection]);
      expect(noteRow.corrections[0]?.text).toBe("Det var kommunens vagt, ikke forsyningen");
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

  it("a message with no status change is pending, with a pending strip and no history", () => {
    const only = buildTimeline([entry(W.courier2)]);
    const view = messageRow(only, W.courier2);
    expect(view.status).toBe("pending");
    expect(view.strip).toEqual([{ kind: "pending", at: null, attempt: null }]);
    expect(view.history).toEqual([]);
  });

  it("a correction of a transition shows under that transition in the history", () => {
    const correction: JournalEntry = {
      ...entry(W.noteCorrection),
      id: "01JB8ZK3QX9V2M4N6P8R0T2X07",
      deviceSeq: 14,
      refersTo: W.courier2Sent,
      text: "Det var Anne, ikke Peter",
    };
    const view = messageRow(buildTimeline([...walkthrough.entries, correction]), W.courier2);
    expect(view.history[0]?.corrections.map((c) => c.id)).toEqual([correction.id]);
    expect(view.corrections).toEqual([]);
    expect(findRow(buildTimeline([...walkthrough.entries, correction]), correction.id)?.id).toBe(
      W.courier2,
    );
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
    const second = messageOut({
      counterpartyId: HANS,
      seqNo: 4,
      body: "Peter er der om 10 min",
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
      { kind: "sent", at: at(1, 2), attempt: null },
      { kind: "waiting", at: null, attempt: null },
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
    expect(view.strip).toEqual([{ kind: "pending", at: null, attempt: null }]);
  });

  it("the body is the text without its #n prefix", () => {
    expect(bodyOf(message)).toBe("Meld status");
    expect(bodyOf({ ...message, text: "no prefix" })).toBe("no prefix");
    expect(bodyOf({ ...message, seqNo: undefined })).toBe("#3 Meld status");
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
    });
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
  it("lists pending, sent and delivered messages; flags given up; hides roger", () => {
    const groups = openItems(walkthrough.entries);
    const hans = groups.get(HANS) ?? [];
    // #1 is roger (closed); #2 the courier message is delivered, still open.
    expect(hans.map((item) => item.message.id)).toEqual([W.courier2]);
    expect(hans[0]).toMatchObject({ status: "delivered", givenUp: false });
  });

  it("is derived live: a status_change -> roger removes the item without anything else changing", () => {
    const roger = statusChange({
      refersTo: W.courier2,
      to: "roger",
      at: "2026-10-28T21:30:00Z",
      text: "Hans rang",
    });
    expect(openItems(walkthrough.entries).get(HANS)).toHaveLength(1);
    expect(openItems([...walkthrough.entries, roger]).get(HANS)).toBeUndefined();
    const timeline = buildTimeline([...walkthrough.entries, roger]);
    expect(messageRow(timeline, W.courier2).status).toBe("roger");
  });

  it("flags a given-up message instead of hiding it, and a retry puts it back among the open", () => {
    const givenUp = statusChange({
      refersTo: W.courier2,
      to: "given_up",
      at: "2026-10-28T21:30:00Z",
      text: "Peter kom tilbage med sedlen",
    });
    const flagged = openItems([...walkthrough.entries, givenUp]).get(HANS) ?? [];
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ status: "given_up", givenUp: true });

    const retried = statusChange({ refersTo: W.courier2, to: "sent", at: "2026-10-28T21:35:00Z" });
    const open = openItems([...walkthrough.entries, givenUp, retried]).get(HANS) ?? [];
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
    const groups = openItems([...walkthrough.entries, toPeter, toHansLater]);
    // Hans has the newest open item, so his group comes first; within it the newest first.
    expect([...groups.keys()]).toEqual([HANS, peter]);
    expect(groups.get(HANS)?.map((item) => item.message.id)).toEqual([toHansLater.id, W.courier2]);
    expect(groups.get(peter)?.[0]?.status).toBe("pending");
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
