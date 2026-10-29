// The handover screen's four lists (P1-08) against contract/examples/walkthrough.json plus a
// few extra entries: open orders, given up, unanswered incoming and quiet radios, each
// oldest first; and that they are derived live (a new roger removes an order, a reply removes
// an incoming message, a message from a quiet radio removes it).

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  buildHandover,
  givenUpOrders,
  messageViews,
  openOrders,
  quietRadios,
  unansweredIncoming,
} from "./handoverView.ts";
import { buildTimeline, lastHeardFrom } from "./journalView.ts";
import type { JournalEntry, RegisterEntry } from "./types.ts";

const walkthrough = loadWalkthrough();
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const PETER = "01JB8ZK3QX9V2M4N6P8R0T2W70";
const RADIO3 = "01JB8ZK3QX9V2M4N6P8R0T2W71";

const W = {
  order1: "01JB8ZK3QX9V2M4N6P8R0T2W51",
  rogerIn: "01JB8ZK3QX9V2M4N6P8R0T2W55",
  freeTextIn: "01JB8ZK3QX9V2M4N6P8R0T2W57",
  courier2: "01JB8ZK3QX9V2M4N6P8R0T2W59",
};

const MINUTE_MS = 60_000;

function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T4${n.toString(32).toUpperCase().padStart(3, "0")}`;
}

let seq = 200;

function stamp(
  timestamp: string,
): Pick<
  JournalEntry,
  "id" | "incidentId" | "deviceId" | "deviceSeq" | "timestamp" | "clockTrust" | "operator"
> {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp,
    clockTrust: "manual",
    operator: "Thomas",
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
  return {
    ...stamp(options.at),
    type: "message_out",
    transport: options.transport ?? "mesh",
    counterpartyId: options.counterpartyId,
    seqNo: options.seqNo,
    batchId: options.batchId,
    refersTo: options.refersTo,
    text: `#${options.seqNo} ${options.body}`,
  };
}

function statusChange(options: {
  refersTo: string;
  to: JournalEntry["newStatus"];
  at: string;
  text?: string;
}): JournalEntry {
  return {
    ...stamp(options.at),
    type: "status_change",
    refersTo: options.refersTo,
    newStatus: options.to,
    text: options.text,
  };
}

function messageIn(options: {
  counterpartyId: string;
  text: string;
  at: string;
  transport?: JournalEntry["transport"];
}): JournalEntry {
  return {
    ...stamp(options.at),
    type: "message_in",
    transport: options.transport ?? "phone",
    counterpartyId: options.counterpartyId,
    text: options.text,
  };
}

// The walkthrough plus: #3 to Hans still pending; #1 to Peter sent and given up; #2 to Peter
// delivered; a message from Peter nobody has answered.
const toPeter1 = messageOut({
  counterpartyId: PETER,
  seqNo: 1,
  body: "Meld status",
  at: "2026-10-28T19:20:00Z",
});
const toPeter2 = messageOut({
  counterpartyId: PETER,
  seqNo: 2,
  body: "Kør til nr 4",
  at: "2026-10-28T19:25:00Z",
});
const fromPeter = messageIn({
  counterpartyId: PETER,
  text: "er fremme ved nr 4",
  at: "2026-10-28T19:30:00Z",
});
const toHans3 = messageOut({
  counterpartyId: HANS,
  seqNo: 3,
  body: "Bliv hvor du er",
  at: "2026-10-28T19:50:00Z",
});
const extras: JournalEntry[] = [
  toPeter1,
  statusChange({ refersTo: toPeter1.id, to: "sent", at: "2026-10-28T19:20:05Z" }),
  statusChange({
    refersTo: toPeter1.id,
    to: "given_up",
    at: "2026-10-28T19:21:00Z",
    text: "no ack after 3 attempts",
  }),
  toPeter2,
  statusChange({ refersTo: toPeter2.id, to: "sent", at: "2026-10-28T19:25:04Z" }),
  statusChange({ refersTo: toPeter2.id, to: "delivered", at: "2026-10-28T19:26:00Z" }),
  fromPeter,
  toHans3,
];
// Shuffled: the lists do not depend on the order the entries were read in.
const entries: JournalEntry[] = [
  ...extras.slice(4),
  ...walkthrough.entries,
  ...extras.slice(0, 4),
].reverse();

const register: RegisterEntry[] = [
  ...walkthrough.register,
  {
    id: PETER,
    publicKey: "a".repeat(64),
    label: "Peter",
    origin: "issued",
    createdAt: "2026-10-28T18:00:00Z",
    createdOnDevice: DEVICE,
  },
  {
    id: RADIO3,
    publicKey: "b".repeat(64),
    label: "radio #3",
    origin: "adhoc",
    createdAt: "2026-10-28T18:00:00Z",
    createdOnDevice: DEVICE,
  },
];

describe("the handover lists over the walkthrough plus extras", () => {
  const lists = buildHandover(entries);

  it("open orders: not yet roger, given up apart, oldest first — courier #2, Peter #2, Hans #3", () => {
    expect(lists.open.map((view) => view.entry.id)).toEqual([W.courier2, toPeter2.id, toHans3.id]);
    expect(lists.open.map((view) => view.status)).toEqual(["delivered", "delivered", "pending"]);
    // #1 to Hans has its roger and is not open; #1 to Peter is given up and not here.
    expect(lists.open.some((view) => view.entry.id === W.order1)).toBe(false);
    expect(lists.open.some((view) => view.entry.id === toPeter1.id)).toBe(false);
    // Each item carries the strip the journal shows.
    expect(lists.open[0]?.strip.map((item) => item.kind)).toEqual(["sent", "delivered"]);
    expect(lists.open[2]?.strip.map((item) => item.kind)).toEqual(["pending"]);
  });

  it("given up: the one that needs a decision, with its strip", () => {
    expect(lists.givenUp.map((view) => view.entry.id)).toEqual([toPeter1.id]);
    expect(lists.givenUp[0]?.strip.map((item) => item.kind)).toEqual(["sent", "given_up"]);
  });

  it("unanswered incoming: no reply and no roger match, oldest first — the free text, then Peter's; R1 is not listed", () => {
    expect(lists.unanswered.map((entry) => entry.id)).toEqual([W.freeTextIn, fromPeter.id]);
    expect(lists.unanswered.some((entry) => entry.id === W.rogerIn)).toBe(false);
  });

  it("a new roger removes the order live, and nothing else moves", () => {
    const roger = statusChange({
      refersTo: toPeter2.id,
      to: "roger",
      at: "2026-10-28T19:55:00Z",
      text: "Peter rang",
    });
    const after = buildHandover([...entries, roger]);
    expect(after.open.map((view) => view.entry.id)).toEqual([W.courier2, toHans3.id]);
    expect(after.givenUp.map((view) => view.entry.id)).toEqual(
      lists.givenUp.map((view) => view.entry.id),
    );
    expect(after.unanswered.map((entry) => entry.id)).toEqual(
      lists.unanswered.map((entry) => entry.id),
    );
  });

  it("a reply removes the incoming item live; the reply itself is a new open order", () => {
    const reply = messageOut({
      counterpartyId: PETER,
      seqNo: 3,
      body: "Bliv der",
      at: "2026-10-28T19:56:00Z",
      refersTo: fromPeter.id,
    });
    const after = buildHandover([...entries, reply]);
    expect(after.unanswered.map((entry) => entry.id)).toEqual([W.freeTextIn]);
    expect(after.open.map((view) => view.entry.id)).toEqual([
      W.courier2,
      toPeter2.id,
      toHans3.id,
      reply.id,
    ]);
  });

  it("a retry moves a given-up order back among the open; a manual roger closes it", () => {
    const retried = statusChange({ refersTo: toPeter1.id, to: "sent", at: "2026-10-28T20:00:00Z" });
    const after = buildHandover([...entries, retried]);
    expect(after.givenUp).toEqual([]);
    expect(after.open.map((view) => view.entry.id)).toEqual([
      W.courier2,
      toPeter1.id,
      toPeter2.id,
      toHans3.id,
    ]);

    const closed = statusChange({
      refersTo: toPeter1.id,
      to: "roger",
      at: "2026-10-28T20:00:00Z",
      text: "sent by courier as #3",
    });
    const afterClose = buildHandover([...entries, closed]);
    expect(afterClose.givenUp).toEqual([]);
    expect(afterClose.open.map((view) => view.entry.id)).toEqual([
      W.courier2,
      toPeter2.id,
      toHans3.id,
    ]);
  });

  it("a manual roger's reason is not an entry id and matches no incoming message", () => {
    const closed = statusChange({
      refersTo: toPeter1.id,
      to: "roger",
      at: "2026-10-28T20:00:00Z",
      text: "Peter kom forbi",
    });
    expect(unansweredIncoming([...entries, closed]).map((entry) => entry.id)).toEqual([
      W.freeTextIn,
      fromPeter.id,
    ]);
  });

  it("a batch is opened up: one item per recipient, each with its own status", () => {
    const BATCH = "01JB8ZK3QX9V2M4N6P8R0T2X10";
    const a = messageOut({
      counterpartyId: HANS,
      seqNo: 4,
      body: "Meld status",
      at: "2026-10-28T20:10:00Z",
      batchId: BATCH,
    });
    const b = messageOut({
      counterpartyId: PETER,
      seqNo: 3,
      body: "Meld status",
      at: "2026-10-28T20:10:01Z",
      batchId: BATCH,
    });
    const c = messageOut({
      counterpartyId: RADIO3,
      seqNo: 1,
      body: "Meld status",
      at: "2026-10-28T20:10:02Z",
      batchId: BATCH,
    });
    const chain = [
      statusChange({ refersTo: a.id, to: "sent", at: "2026-10-28T20:10:05Z" }),
      statusChange({ refersTo: a.id, to: "delivered", at: "2026-10-28T20:10:09Z" }),
      statusChange({ refersTo: a.id, to: "roger", at: "2026-10-28T20:11:00Z", text: id(999) }),
      statusChange({ refersTo: b.id, to: "sent", at: "2026-10-28T20:10:15Z" }),
      statusChange({
        refersTo: b.id,
        to: "given_up",
        at: "2026-10-28T20:11:30Z",
        text: "no ack after 3 attempts",
      }),
    ];
    const views = messageViews(buildTimeline([...entries, a, b, c, ...chain]));
    // The walkthrough's #1 and courier #2, the three extras, the three of the batch.
    expect(views).toHaveLength(8);
    expect(views.filter((view) => view.entry.batchId === BATCH)).toHaveLength(3);
    expect(openOrders(views).map((view) => view.entry.id)).toEqual([
      W.courier2,
      toPeter2.id,
      toHans3.id,
      c.id,
    ]);
    expect(givenUpOrders(views).map((view) => view.entry.id)).toEqual([toPeter1.id, b.id]);
  });

  it("the walkthrough alone: courier #2 open, nothing given up, the free text unanswered", () => {
    const alone = buildHandover(walkthrough.entries);
    expect(alone.open.map((view) => view.entry.id)).toEqual([W.courier2]);
    expect(alone.givenUp).toEqual([]);
    expect(alone.unanswered.map((entry) => entry.id)).toEqual([W.freeTextIn]);
  });

  it("an empty incident has empty lists", () => {
    expect(buildHandover([])).toEqual({ open: [], givenUp: [], unanswered: [] });
  });
});

describe("quiet radios", () => {
  const heard = lastHeardFrom(entries);
  const NOW = Date.parse("2026-10-28T20:00:00Z");

  it("lists the radios not heard from within the blind time, never heard first, then the quietest", () => {
    // Hans was heard 19:05, Peter 19:30, radio #3 never; at 20:00 with 15 min all three.
    const quiet = quietRadios(register, heard, { nowMs: NOW, blindAfterMs: 15 * MINUTE_MS });
    expect(quiet.map((row) => row.entry.label)).toEqual(["radio #3", "Hans", "Peter"]);
    expect(quiet[0]?.at).toBeNull();
    expect(quiet[1]?.at).toBe("2026-10-28T19:05:12Z");
  });

  it("a radio heard within the blind time is not quiet", () => {
    const quiet = quietRadios(register, heard, { nowMs: NOW, blindAfterMs: 40 * MINUTE_MS });
    expect(quiet.map((row) => row.entry.label)).toEqual(["radio #3", "Hans"]);
    const earlier = quietRadios(register, heard, {
      nowMs: Date.parse("2026-10-28T19:35:00Z"),
      blindAfterMs: 15 * MINUTE_MS,
    });
    expect(earlier.map((row) => row.entry.label)).toEqual(["radio #3", "Hans"]);
  });

  it("silence of exactly the blind time is not yet quiet; one more millisecond is", () => {
    const at = Date.parse("2026-10-28T19:30:00Z");
    const exact = quietRadios(register, heard, {
      nowMs: at + 15 * MINUTE_MS,
      blindAfterMs: 15 * MINUTE_MS,
    });
    expect(exact.map((row) => row.entry.label)).toEqual(["radio #3", "Hans"]);
    const over = quietRadios(register, heard, {
      nowMs: at + 15 * MINUTE_MS + 1,
      blindAfterMs: 15 * MINUTE_MS,
    });
    expect(over.map((row) => row.entry.label)).toEqual(["radio #3", "Hans", "Peter"]);
  });

  it("a message from a quiet radio removes it live", () => {
    const late = messageIn({
      counterpartyId: RADIO3,
      text: "alt vel",
      at: "2026-10-28T19:58:00Z",
      transport: "verbal",
    });
    const quiet = quietRadios(register, lastHeardFrom([...entries, late]), {
      nowMs: NOW,
      blindAfterMs: 15 * MINUTE_MS,
    });
    expect(quiet.map((row) => row.entry.label)).toEqual(["Hans", "Peter"]);
  });

  it("an empty register is no quiet radios", () => {
    expect(quietRadios([], heard, { nowMs: NOW, blindAfterMs: 15 * MINUTE_MS })).toEqual([]);
  });
});
