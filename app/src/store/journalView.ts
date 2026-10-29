// What the journal screen shows, derived from an incident's entries (P0-07; reshaped in
// P1-01). Pure functions over arrays, so the screen recomputes them on every reload and
// tests feed them the contract walkthrough. Nothing here is stored: status, open items and
// "last heard from" are read off the entries every time (contract: status is derived, never
// stored).
//
// The journal reads like a stack of message slips, newest on top (P1-01). A message is one
// row that carries its own delivery times as a strip ("sent 14:31 · delivered 14:32 · roger
// 14:35") derived from the status_change entries that refer to it; those entries, and the
// old resend notes, are never rows of their own but the row's history, shown when the row is
// expanded. The messages of one send-to-all (one batchId) fold into one row with counters.
// A correction stays visible under the entry it corrects; a status_change that refers to the
// incident (closed / reopened) is a row, because it is an event of the incident itself.

import { seqNoPrefix } from "./outgoing.ts";
import { isLater, statusOf } from "./status.ts";
import type { JournalEntry, RegisterEntry, Status } from "./types.ts";

// Oldest first: the ordering status.ts uses to pick the latest status change: timestamp,
// then deviceSeq, then id.
export function compareEntries(a: JournalEntry, b: JournalEntry): number {
  if (a.id === b.id) {
    return 0;
  }
  return isLater(a, b) ? 1 : -1;
}

export function sortedOldestFirst(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort(compareEntries);
}

// Newest first: the order every list on the screen reads in (P1-01).
export function sortedNewestFirst(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => compareEntries(b, a));
}

export function entriesById(entries: readonly JournalEntry[]): Map<string, JournalEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

// --- the status strip ----------------------------------------------------------------------

// What one segment of a message's strip says: a status with the time it was reached, or
// "waiting" when the latest status is sent and the receipt is still out, or "pending" when
// nothing has happened yet.
export type StripKind = "pending" | "sent" | "delivered" | "roger" | "given_up" | "waiting";

export interface StripItem {
  kind: StripKind;
  // ISO timestamp of the transition; null for pending and waiting.
  at: string | null;
  // On a waiting item: the text of the latest `sent` ("attempt 2/3"), null on the first
  // attempt. Null on every other item.
  attempt: string | null;
}

// The statuses of a message's chain that the strip shows; pending is implicit (status.ts
// returns it when there is no status_change) and a stored `pending` from an old journal is
// ignored, so a journal with them renders like one without.
const CHAIN: readonly Status[] = ["sent", "delivered", "roger", "given_up"];

function inChain(entry: JournalEntry): boolean {
  return (
    entry.type === "status_change" &&
    entry.newStatus !== undefined &&
    CHAIN.includes(entry.newStatus)
  );
}

// The transitions of the message's current run: from the last `sent` that starts afresh (a
// manual retry after given_up, or a status set by hand after a terminal one) to the end. A
// `sent` right after another `sent` is a resend attempt of the same run, not a new run.
export function currentRun(changes: readonly JournalEntry[]): JournalEntry[] {
  let start = 0;
  for (let i = 1; i < changes.length; i++) {
    if (changes[i]?.newStatus === "sent" && changes[i - 1]?.newStatus !== "sent") {
      start = i;
    }
  }
  return changes.slice(start);
}

// The strip of a message from its chain, oldest first. The first `sent` of the run gives the
// time; later `sent` entries (resends) only move the attempt text shown on "waiting".
export function statusStrip(changes: readonly JournalEntry[]): StripItem[] {
  const run = currentRun(changes.filter(inChain));
  if (run.length === 0) {
    return [{ kind: "pending", at: null, attempt: null }];
  }
  const items: StripItem[] = [];
  let attempt: string | null = null;
  for (const change of run) {
    const kind = change.newStatus as StripKind;
    if (kind === "sent" && items.some((item) => item.kind === "sent")) {
      attempt = change.text ?? attempt;
      continue;
    }
    items.push({ kind, at: change.timestamp, attempt: null });
  }
  if (run[run.length - 1]?.newStatus === "sent") {
    items.push({ kind: "waiting", at: null, attempt });
  }
  return items;
}

// --- rows ----------------------------------------------------------------------------------

// One transition in a message's history: a status_change (never `pending`) or, from journals
// written before P1-01, a resend note; with the corrections that refer to it.
export interface HistoryItem {
  entry: JournalEntry;
  corrections: JournalEntry[];
}

export interface MessageView {
  entry: JournalEntry;
  status: Status;
  strip: StripItem[];
  // Every transition, oldest first, the order the strip reads in.
  history: HistoryItem[];
  // Corrections of the message itself, oldest first.
  corrections: JournalEntry[];
}

export interface BatchCounters {
  total: number;
  // No `sent` yet.
  pending: number;
  // Reached `sent` in the current run (and possibly more).
  sent: number;
  // Reached `delivered` (and possibly roger).
  delivered: number;
  roger: number;
  // Currently given up.
  givenUp: number;
}

// A row of the timeline. `entry` positions the row (time, operator): the entry itself, or
// for a batch its first message. `id` keys the row in the DOM.
export type TimelineRow =
  | {
      kind: "entry";
      id: string;
      // message_in, note, a status_change on the incident, or a correction whose target is
      // not in the list.
      entry: JournalEntry;
      corrections: JournalEntry[];
    }
  | { kind: "message"; id: string; entry: JournalEntry; message: MessageView }
  | {
      kind: "batch";
      id: string;
      entry: JournalEntry;
      batchId: string;
      // The operator's text without the "#n " prefix, the same for every recipient.
      body: string;
      // In the order the messages were stored, which is the transmission order.
      messages: MessageView[];
      counters: BatchCounters;
      // The slowest recipient's state: given_up when any has given up, else the least
      // advanced status along the chain.
      status: Status;
    };

// The "#n " prefix off a message's text (text-protocol.md: the text is exactly "#<n> <text>").
export function bodyOf(message: JournalEntry): string {
  const text = message.text ?? "";
  if (message.seqNo === undefined) {
    return text;
  }
  const prefix = seqNoPrefix(message.seqNo);
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

// Least advanced first; given_up before everything, since it needs a hand.
const RANK: Readonly<Record<Status, number>> = {
  given_up: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  roger: 4,
  closed: 5,
  reopened: 5,
};

export function slowestStatus(messages: readonly MessageView[]): Status {
  let slowest: Status = "roger";
  for (const message of messages) {
    if (RANK[message.status] < RANK[slowest]) {
      slowest = message.status;
    }
  }
  return slowest;
}

export function batchCounters(messages: readonly MessageView[]): BatchCounters {
  const counters: BatchCounters = {
    total: messages.length,
    pending: 0,
    sent: 0,
    delivered: 0,
    roger: 0,
    givenUp: 0,
  };
  for (const message of messages) {
    const reached = new Set(message.strip.map((item) => item.kind));
    if (reached.has("sent")) {
      counters.sent += 1;
    }
    if (reached.has("delivered")) {
      counters.delivered += 1;
    }
    if (reached.has("roger")) {
      counters.roger += 1;
    }
    if (message.status === "given_up") {
      counters.givenUp += 1;
    }
    if (message.status === "pending") {
      counters.pending += 1;
    }
  }
  return counters;
}

export function buildTimeline(entries: readonly JournalEntry[]): TimelineRow[] {
  const byId = entriesById(entries);
  const sorted = sortedOldestFirst(entries);

  // What refers to what, each list oldest first.
  const transitions = new Map<string, JournalEntry[]>();
  const corrections = new Map<string, JournalEntry[]>();
  const plain: JournalEntry[] = [];
  const messages: JournalEntry[] = [];

  function file(map: Map<string, JournalEntry[]>, key: string, entry: JournalEntry): void {
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }

  for (const entry of sorted) {
    const target = entry.refersTo === undefined ? undefined : byId.get(entry.refersTo);
    switch (entry.type) {
      case "message_out":
        messages.push(entry);
        break;
      case "correction":
        if (target !== undefined) {
          file(corrections, target.id, entry);
        } else {
          plain.push(entry);
        }
        break;
      case "status_change":
        if (target?.type === "message_out") {
          if (entry.newStatus !== "pending") {
            file(transitions, target.id, entry);
          }
        } else if (entry.refersTo === entry.incidentId) {
          plain.push(entry);
        }
        // A status change of a message that is not in the list is telemetry of nothing
        // shown here; it stays in the data (export) and is not a row.
        break;
      case "note":
        if (target?.type === "message_out") {
          file(transitions, target.id, entry);
        } else {
          plain.push(entry);
        }
        break;
      default:
        plain.push(entry);
    }
  }

  function view(message: JournalEntry): MessageView {
    const history = (transitions.get(message.id) ?? []).map((entry) => ({
      entry,
      corrections: corrections.get(entry.id) ?? [],
    }));
    return {
      entry: message,
      status: statusOf(entries, message.id),
      strip: statusStrip(history.map((item) => item.entry)),
      history,
      corrections: corrections.get(message.id) ?? [],
    };
  }

  const rows: TimelineRow[] = plain.map((entry) => ({
    kind: "entry",
    id: entry.id,
    entry,
    corrections: corrections.get(entry.id) ?? [],
  }));

  // Messages sharing a batchId become one row; the batch is positioned by its first message.
  const batches = new Map<string, JournalEntry[]>();
  for (const message of messages) {
    if (message.batchId === undefined) {
      rows.push({ kind: "message", id: message.id, entry: message, message: view(message) });
      continue;
    }
    file(batches, message.batchId, message);
  }
  for (const [batchId, group] of batches) {
    const views = group.map(view);
    const first = views[0] as MessageView;
    rows.push({
      kind: "batch",
      id: batchId,
      entry: first.entry,
      batchId,
      body: bodyOf(first.entry),
      messages: views,
      counters: batchCounters(views),
      status: slowestStatus(views),
    });
  }

  return rows.sort((a, b) => compareEntries(b.entry, a.entry));
}

// The row that shows an entry: its own row, the batch it is a recipient of, or the row whose
// history or corrections hold it. Undefined when nothing on the timeline shows it.
export function findRow(rows: readonly TimelineRow[], entryId: string): TimelineRow | undefined {
  for (const row of rows) {
    if (row.id === entryId) {
      return row;
    }
    if (row.kind === "entry" && row.corrections.some((c) => c.id === entryId)) {
      return row;
    }
    const views = row.kind === "message" ? [row.message] : row.kind === "batch" ? row.messages : [];
    for (const view of views) {
      if (
        view.entry.id === entryId ||
        view.corrections.some((c) => c.id === entryId) ||
        view.history.some(
          (item) => item.entry.id === entryId || item.corrections.some((c) => c.id === entryId),
        )
      ) {
        return row;
      }
    }
  }
  return undefined;
}

// How many rows the operator has not seen: the ones not in the set of row ids that were on
// the timeline when they scrolled down from the top.
export function countNewRows(rows: readonly TimelineRow[], seen: ReadonlySet<string>): number {
  return rows.filter((row) => !seen.has(row.id)).length;
}

// --- open items ------------------------------------------------------------------------------

// A message_out the staff still owes attention: not yet roger (pending / sent / delivered),
// or given up, which the panel flags rather than hides. roger is final and closes the item
// (brainstorm §5: "Roger closes the item in the staff's queue").
export const OPEN_STATUSES: readonly Status[] = ["pending", "sent", "delivered"];

export interface OpenItem {
  message: JournalEntry;
  status: Status;
  givenUp: boolean;
}

// Open items per register entry (counterpartyId), newest first within a group, and the groups
// in the order of their newest item, newest first (P1-01). Entries without a counterparty
// cannot occur for a message_out (the schema requires it) and are skipped.
export function openItems(entries: readonly JournalEntry[]): Map<string, OpenItem[]> {
  const groups = new Map<string, OpenItem[]>();
  for (const entry of sortedNewestFirst(entries)) {
    if (entry.type !== "message_out" || entry.counterpartyId === undefined) {
      continue;
    }
    const status = statusOf(entries, entry.id);
    const givenUp = status === "given_up";
    if (!givenUp && !OPEN_STATUSES.includes(status)) {
      continue;
    }
    const items = groups.get(entry.counterpartyId) ?? [];
    items.push({ message: entry, status, givenUp });
    groups.set(entry.counterpartyId, items);
  }
  return groups;
}

// --- last heard from --------------------------------------------------------------------------

// When each register entry was last heard from: the timestamp of its latest message_in, by
// the same ordering as everything else. Entries never heard from are absent from the map.
export function lastHeardFrom(entries: readonly JournalEntry[]): Map<string, string> {
  const latest = new Map<string, JournalEntry>();
  for (const entry of entries) {
    if (entry.type !== "message_in" || entry.counterpartyId === undefined) {
      continue;
    }
    const current = latest.get(entry.counterpartyId);
    if (current === undefined || isLater(entry, current)) {
      latest.set(entry.counterpartyId, entry);
    }
  }
  return new Map([...latest].map(([counterpartyId, entry]) => [counterpartyId, entry.timestamp]));
}

export interface LastHeard {
  entry: RegisterEntry;
  // ISO timestamp of the latest message_in, or null when never heard from.
  at: string | null;
}

// The register panel's order: the quiet ones on top, on purpose (it exists to show who has
// gone quiet; P1-01 left it the one list that is not newest first). Never heard from first,
// then the oldest contact first; ties broken by id so the order is stable between reloads.
export function sortedByLastHeard(
  register: readonly RegisterEntry[],
  heard: ReadonlyMap<string, string>,
): LastHeard[] {
  const rows: LastHeard[] = register.map((entry) => ({ entry, at: heard.get(entry.id) ?? null }));
  return rows.sort((a, b) => {
    if (a.at === null && b.at !== null) {
      return -1;
    }
    if (a.at !== null && b.at === null) {
      return 1;
    }
    if (a.at !== null && b.at !== null) {
      const byTime = Date.parse(a.at) - Date.parse(b.at);
      if (byTime !== 0) {
        return byTime;
      }
    }
    return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
  });
}
