// The journal screen's derivations against contract/examples/walkthrough.json: the phase-0
// walkthrough as a timeline with its nesting and status chips, the open items per register
// entry, and "last heard from". Everything is a pure function of the entries, so "derived
// live" is shown by appending an entry to the array and deriving again.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  buildTimeline,
  compareEntries,
  lastHeardFrom,
  openItems,
  sortedByLastHeard,
  sortedOldestFirst,
} from "./journalView.ts";
import { incidentStateOf } from "./incidents.ts";
import type { JournalEntry, RegisterEntry } from "./types.ts";

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

function statusChange(options: {
  id: string;
  seq: number;
  at: string;
  refersTo: string;
  to: JournalEntry["newStatus"];
  text?: string;
}): JournalEntry {
  return {
    id: options.id,
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: options.seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "status_change",
    refersTo: options.refersTo,
    newStatus: options.to,
    text: options.text,
  };
}

function messageIn(options: {
  id: string;
  seq: number;
  at: string;
  counterpartyId: string;
  text: string;
}): JournalEntry {
  return {
    id: options.id,
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: options.seq,
    timestamp: options.at,
    clockTrust: "manual",
    operator: "Thomas",
    type: "message_in",
    transport: "phone",
    counterpartyId: options.counterpartyId,
    text: options.text,
  };
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
});

describe("timeline of the phase-0 walkthrough", () => {
  const rows = buildTimeline([...walkthrough.entries].reverse());

  it("has one top-level row per message, note and incident status change, in time order", () => {
    expect(rows.map((row) => row.entry.id)).toEqual([
      W.order1,
      W.rogerIn,
      W.freeTextIn,
      W.note,
      W.courier2,
      W.incidentClosed,
    ]);
  });

  it("nests every status change and correction under the entry it refers to, oldest first", () => {
    const byId = new Map(rows.map((row) => [row.entry.id, row]));
    expect(byId.get(W.order1)?.children.map((c) => c.id)).toEqual([
      W.order1Pending,
      W.order1Sent,
      W.order1Delivered,
      W.order1Roger,
    ]);
    expect(byId.get(W.courier2)?.children.map((c) => c.id)).toEqual([
      W.courier2Sent,
      W.courier2Delivered,
    ]);
    expect(byId.get(W.note)?.children.map((c) => c.id)).toEqual([W.noteCorrection]);
    expect(byId.get(W.rogerIn)?.children).toEqual([]);
    expect(byId.get(W.freeTextIn)?.children).toEqual([]);
  });

  it("shows a status chip on outgoing messages only", () => {
    const byId = new Map(rows.map((row) => [row.entry.id, row]));
    expect(byId.get(W.order1)?.status).toBe("roger");
    expect(byId.get(W.courier2)?.status).toBe("delivered");
    expect(byId.get(W.rogerIn)?.status).toBeNull();
    expect(byId.get(W.note)?.status).toBeNull();
    expect(byId.get(W.incidentClosed)?.status).toBeNull();
  });

  it("the status change that closes the incident is a top-level row: it refers to the incident, not to an entry", () => {
    const closed = rows.find((row) => row.entry.id === W.incidentClosed);
    expect(closed?.entry.refersTo).toBe(INCIDENT);
    expect(closed?.children).toEqual([]);
    expect(incidentStateOf(walkthrough.entries, INCIDENT)).toBe("closed");
  });

  it("a correction never changes the original row's text; it shows under it", () => {
    const note = rows.find((row) => row.entry.id === W.note);
    expect(note?.entry.text).toBe("Ringede til forsyningen, kø, ingen svar");
    expect(note?.children[0]?.type).toBe("correction");
    expect(note?.children[0]?.text).toBe("Det var kommunens vagt, ikke forsyningen");
    expect(entry(W.note).text).toBe("Ringede til forsyningen, kø, ingen svar");
  });

  it("a status change whose referent is not in the list stays a top-level row", () => {
    const orphan = statusChange({
      id: "01JB8ZK3QX9V2M4N6P8R0T2X99",
      seq: 99,
      at: "2026-10-28T22:00:00Z",
      refersTo: "01JB8ZK3QX9V2M4N6P8R0T2X00",
      to: "sent",
    });
    const withOrphan = buildTimeline([...walkthrough.entries, orphan]);
    expect(withOrphan.at(-1)?.entry.id).toBe(orphan.id);
  });

  it("a message with no status change is pending", () => {
    const only = [entry(W.courier2)];
    expect(buildTimeline(only)[0]?.status).toBe("pending");
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
      id: "01JB8ZK3QX9V2M4N6P8R0T2X01",
      seq: 14,
      at: "2026-10-28T21:30:00Z",
      refersTo: W.courier2,
      to: "roger",
      text: "Hans rang",
    });
    expect(openItems(walkthrough.entries).get(HANS)).toHaveLength(1);
    expect(openItems([...walkthrough.entries, roger]).get(HANS)).toBeUndefined();
    const timeline = buildTimeline([...walkthrough.entries, roger]);
    expect(timeline.find((row) => row.entry.id === W.courier2)?.status).toBe("roger");
  });

  it("flags a given-up message instead of hiding it, and a retry puts it back among the open", () => {
    const givenUp = statusChange({
      id: "01JB8ZK3QX9V2M4N6P8R0T2X02",
      seq: 14,
      at: "2026-10-28T21:30:00Z",
      refersTo: W.courier2,
      to: "given_up",
      text: "Peter kom tilbage med sedlen",
    });
    const flagged = openItems([...walkthrough.entries, givenUp]).get(HANS) ?? [];
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ status: "given_up", givenUp: true });

    const retried = statusChange({
      id: "01JB8ZK3QX9V2M4N6P8R0T2X03",
      seq: 15,
      at: "2026-10-28T21:35:00Z",
      refersTo: W.courier2,
      to: "sent",
    });
    const open = openItems([...walkthrough.entries, givenUp, retried]).get(HANS) ?? [];
    expect(open[0]).toMatchObject({ status: "sent", givenUp: false });
  });

  it("groups by recipient, oldest first within a group", () => {
    const peter = "01JB8ZK3QX9V2M4N6P8R0T2W70";
    const toPeter: JournalEntry = {
      ...entry(W.courier2),
      id: "01JB8ZK3QX9V2M4N6P8R0T2X04",
      deviceSeq: 14,
      timestamp: "2026-10-28T19:20:00Z",
      counterpartyId: peter,
      seqNo: 1,
      text: "#1 Meld status",
    };
    const groups = openItems([...walkthrough.entries, toPeter]);
    expect([...groups.keys()].sort()).toEqual([HANS, peter].sort());
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

  it("puts the quiet ones on top: never heard first, then the oldest contact", () => {
    const peter = register[1] as RegisterEntry;
    const earlier = messageIn({
      id: "01JB8ZK3QX9V2M4N6P8R0T2X05",
      seq: 14,
      at: "2026-10-28T18:30:00Z",
      counterpartyId: peter.id,
      text: "er på plads",
    });
    const rows = sortedByLastHeard(register, lastHeardFrom([...walkthrough.entries, earlier]));
    expect(rows.map((row) => row.entry.label)).toEqual(["radio #3", "Peter", "Hans"]);
    expect(rows[0]?.at).toBeNull();
    expect(rows[1]?.at).toBe("2026-10-28T18:30:00Z");
  });

  it("moves an entry down as soon as a new message_in arrives", () => {
    const late = messageIn({
      id: "01JB8ZK3QX9V2M4N6P8R0T2X06",
      seq: 14,
      at: "2026-10-28T21:10:00Z",
      counterpartyId: "01JB8ZK3QX9V2M4N6P8R0T2W71",
      text: "alt vel",
    });
    const before = sortedByLastHeard(register, lastHeardFrom(walkthrough.entries));
    expect(before.at(-1)?.entry.label).toBe("Hans");
    const after = sortedByLastHeard(register, lastHeardFrom([...walkthrough.entries, late]));
    expect(after.at(-1)?.entry.label).toBe("radio #3");
    expect(after[0]?.entry.label).toBe("Peter");
  });
});
