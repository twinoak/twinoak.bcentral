// The open-row rule (P3-04): a click opens, a second click closes, opening row B closes row A,
// Esc closes, a click that ends a text selection does not toggle; a batch holds its
// recipients, which open inside it. Over the contract walkthrough plus a three-recipient
// send-to-all.

import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineRow } from "../store/journalView.ts";
import type { JournalEntry } from "../store/types.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  clickToggles,
  CLOSED,
  closeOne,
  isOpen,
  openRowId,
  revealRow,
  toggleRow,
  type OpenState,
  type RowPlace,
} from "./rowOpen.ts";

const walkthrough = loadWalkthrough();
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
// The walkthrough's rows.
const ORDER = "01JB8ZK3QX9V2M4N6P8R0T2W51";
const ORDER_SENT = "01JB8ZK3QX9V2M4N6P8R0T2W53";
const ROGER = "01JB8ZK3QX9V2M4N6P8R0T2W55";
const NOTE = "01JB8ZK3QX9V2M4N6P8R0T2W58";
const CORRECTION = "01JB8ZK3QX9V2M4N6P8R0T2W62";
const BATCH = "01JB8ZK3QX9V2M4N6P8R0T3B00";

let seq = 400;
function id(n: number): string {
  return `01JB8ZK3QX9V2M4N6P8R0T3${n.toString(32).toUpperCase().padStart(3, "0")}`;
}

function entry(fields: Partial<JournalEntry> & Pick<JournalEntry, "type">): JournalEntry {
  seq += 1;
  return {
    id: id(seq),
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: seq,
    timestamp: `2026-10-28T21:${String(seq - 400).padStart(2, "0")}:00Z`,
    clockTrust: "manual",
    operator: "Thomas",
    ...fields,
  };
}

// Three recipients: the first sent and given up, the second delivered, the third pending.
const recipients = [HANS, id(1), id(2)].map((counterpartyId, i) =>
  entry({
    type: "message_out",
    transport: "mesh",
    counterpartyId,
    seqNo: 10 + i,
    text: `#${10 + i} Meld status`,
    batchId: BATCH,
  }),
);
const first = recipients[0] as JournalEntry;
const second = recipients[1] as JournalEntry;
const firstSent = entry({ type: "status_change", refersTo: first.id, newStatus: "sent" });
const firstGivenUp = entry({
  type: "status_change",
  refersTo: first.id,
  newStatus: "given_up",
  text: "no ack after 3 attempts",
});
const secondSent = entry({ type: "status_change", refersTo: second.id, newStatus: "sent" });
const secondDelivered = entry({
  type: "status_change",
  refersTo: second.id,
  newStatus: "delivered",
});

const rows = buildTimeline([
  ...walkthrough.entries,
  ...recipients,
  firstSent,
  firstGivenUp,
  secondSent,
  secondDelivered,
]);

function rowOf(entryId: string): TimelineRow {
  const row = rows.find((candidate) => candidate.id === entryId);
  if (row === undefined) {
    throw new Error(`no row ${entryId}`);
  }
  return row;
}

// Where each row sits, as the timeline derives it.
function placeOf(entryId: string): RowPlace {
  for (const row of rows) {
    if (row.id === entryId) {
      return { batch: row.kind === "batch", parent: null };
    }
    if (row.kind === "batch" && row.messages.some((view) => view.entry.id === entryId)) {
      return { batch: false, parent: row.id };
    }
  }
  throw new Error(`no row ${entryId}`);
}

function click(state: OpenState, entryId: string): OpenState {
  return toggleRow(state, entryId, placeOf(entryId));
}

function open(state: OpenState, entryId: string): boolean {
  return isOpen(state, entryId, placeOf(entryId));
}

describe("one row open at a time", () => {
  it("a click opens the row, a second click closes it", () => {
    const opened = click(CLOSED, ORDER);
    expect(open(opened, ORDER)).toBe(true);
    expect(opened).toEqual({ row: ORDER, batch: null });
    const closed = click(opened, ORDER);
    expect(open(closed, ORDER)).toBe(false);
    expect(closed).toEqual(CLOSED);
  });

  it("opening row B closes row A", () => {
    const a = click(CLOSED, ORDER);
    const b = click(a, NOTE);
    expect(open(b, ORDER)).toBe(false);
    expect(open(b, NOTE)).toBe(true);
    // And the walkthrough's rows are what the rule was fed: an order, a roger, a note.
    expect(rowOf(ORDER).kind).toBe("message");
    expect(rowOf(NOTE).kind).toBe("entry");
  });

  it("Esc closes the open row; Esc with nothing open is nothing", () => {
    const opened = click(CLOSED, ROGER);
    expect(openRowId(opened)).toBe(ROGER);
    expect(closeOne(opened)).toEqual(CLOSED);
    expect(closeOne(CLOSED)).toEqual(CLOSED);
    expect(openRowId(CLOSED)).toBeNull();
  });

  it("nothing is open at the start", () => {
    for (const row of rows) {
      expect(open(CLOSED, row.id)).toBe(false);
    }
  });
});

describe("a send-to-all row holds its recipients", () => {
  it("opening the batch shows its recipients and closes any other row", () => {
    const state = click(click(CLOSED, NOTE), BATCH);
    expect(state).toEqual({ row: null, batch: BATCH });
    expect(open(state, BATCH)).toBe(true);
    expect(open(state, NOTE)).toBe(false);
    expect(rowOf(BATCH).kind).toBe("batch");
  });

  it("a recipient opens inside the open batch, and another recipient replaces it", () => {
    const batch = click(CLOSED, BATCH);
    const withFirst = click(batch, first.id);
    expect(withFirst).toEqual({ row: first.id, batch: BATCH });
    expect(open(withFirst, BATCH)).toBe(true);
    expect(open(withFirst, first.id)).toBe(true);
    const withSecond = click(withFirst, second.id);
    expect(open(withSecond, first.id)).toBe(false);
    expect(open(withSecond, second.id)).toBe(true);
    expect(open(withSecond, BATCH)).toBe(true);
  });

  it("Esc closes the recipient first and the batch second; the batch's own line closes both", () => {
    const state = click(click(CLOSED, BATCH), first.id);
    const afterOne = closeOne(state);
    expect(afterOne).toEqual({ row: null, batch: BATCH });
    expect(openRowId(state)).toBe(first.id);
    expect(openRowId(afterOne)).toBe(BATCH);
    expect(closeOne(afterOne)).toEqual(CLOSED);
    expect(click(state, BATCH)).toEqual(CLOSED);
  });

  it("opening a plain row while a recipient is open closes the batch and the recipient", () => {
    const state = click(click(click(CLOSED, BATCH), first.id), ORDER);
    expect(state).toEqual({ row: ORDER, batch: null });
  });
});

describe("a jump to an entry opens the row that shows it", () => {
  it("a message, by its own id or by one of its transitions", () => {
    expect(revealRow(rowOf(ORDER), ORDER)).toEqual({ row: ORDER, batch: null });
    expect(revealRow(rowOf(ORDER), ORDER_SENT)).toEqual({ row: ORDER, batch: null });
  });

  it("a corrected note, by the correction's id", () => {
    expect(revealRow(rowOf(NOTE), CORRECTION)).toEqual({ row: NOTE, batch: null });
  });

  it("a batch, on the recipient that holds the entry, or on its recipients alone", () => {
    const batch = rowOf(BATCH);
    expect(revealRow(batch, second.id)).toEqual({ row: second.id, batch: BATCH });
    expect(revealRow(batch, firstGivenUp.id)).toEqual({ row: first.id, batch: BATCH });
    expect(revealRow(batch, BATCH)).toEqual({ row: null, batch: BATCH });
  });
});

describe("what a click on the line does", () => {
  const row = { contains: (node: unknown) => node === "inside" };
  const onText = { closest: () => null };
  const onButton = { closest: (selector: string) => (selector.includes("button") ? {} : null) };
  const collapsed = { isCollapsed: true, anchorNode: "inside", focusNode: "inside" };

  it("a click on the text toggles", () => {
    expect(clickToggles(onText, collapsed, row)).toBe(true);
    expect(clickToggles(onText, null, row)).toBe(true);
    expect(clickToggles(null, null, row)).toBe(true);
  });

  it("a click on a link or a button inside the line is the control's own", () => {
    expect(clickToggles(onButton, collapsed, row)).toBe(false);
  });

  it("a click that ends a text selection inside the row does not toggle", () => {
    const selecting = { isCollapsed: false, anchorNode: "inside", focusNode: "inside" };
    expect(clickToggles(onText, selecting, row)).toBe(false);
    const endsInside = { isCollapsed: false, anchorNode: "elsewhere", focusNode: "inside" };
    expect(clickToggles(onText, endsInside, row)).toBe(false);
  });

  it("a selection elsewhere on the page does not stop the row", () => {
    const elsewhere = { isCollapsed: false, anchorNode: "elsewhere", focusNode: "elsewhere" };
    expect(clickToggles(onText, elsewhere, row)).toBe(true);
  });
});
