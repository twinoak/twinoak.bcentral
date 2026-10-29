// What the journal screen shows, derived from an incident's entries (P0-07). Pure functions
// over arrays, so the screen recomputes them on every reload and tests feed them the
// contract walkthrough. Nothing here is stored: status, open items and "last heard from" are
// read off the entries every time (contract: status is derived, never stored).

import { isLater, statusOf } from "./status.ts";
import type { JournalEntry, RegisterEntry, Status } from "./types.ts";

// Oldest first: the order the timeline reads in (newest at the bottom). The same ordering
// status.ts uses to pick the latest status change: timestamp, then deviceSeq, then id.
export function compareEntries(a: JournalEntry, b: JournalEntry): number {
  if (a.id === b.id) {
    return 0;
  }
  return isLater(a, b) ? 1 : -1;
}

export function sortedOldestFirst(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort(compareEntries);
}

// One top-level row of the timeline. status_change and correction entries that refer to an
// entry in the same list are not rows of their own: they are the row's children, shown
// indented under it. A status_change that refers to the incident (closed / reopened), or
// anything whose referent is not in the list, is a top-level row.
export interface TimelineRow {
  entry: JournalEntry;
  // The derived status of a message_out; null for every other type.
  status: Status | null;
  // The status changes and corrections referring to this entry, oldest first.
  children: JournalEntry[];
}

export function nestsUnderParent(
  entry: JournalEntry,
  byId: ReadonlyMap<string, JournalEntry>,
): boolean {
  return (
    (entry.type === "status_change" || entry.type === "correction") &&
    entry.refersTo !== undefined &&
    byId.has(entry.refersTo)
  );
}

export function entriesById(entries: readonly JournalEntry[]): Map<string, JournalEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function buildTimeline(entries: readonly JournalEntry[]): TimelineRow[] {
  const byId = entriesById(entries);
  const children = new Map<string, JournalEntry[]>();
  const rows: TimelineRow[] = [];
  for (const entry of sortedOldestFirst(entries)) {
    if (nestsUnderParent(entry, byId)) {
      const parentId = entry.refersTo as string;
      const siblings = children.get(parentId) ?? [];
      siblings.push(entry);
      children.set(parentId, siblings);
      continue;
    }
    rows.push({
      entry,
      status: entry.type === "message_out" ? statusOf(entries, entry.id) : null,
      children: [],
    });
  }
  for (const row of rows) {
    row.children = children.get(row.entry.id) ?? [];
  }
  return rows;
}

// A message_out the staff still owes attention: not yet roger (pending / sent / delivered),
// or given up, which the panel flags rather than hides. roger is final and closes the item
// (brainstorm §5: "Roger closes the item in the staff's queue").
export const OPEN_STATUSES: readonly Status[] = ["pending", "sent", "delivered"];

export interface OpenItem {
  message: JournalEntry;
  status: Status;
  givenUp: boolean;
}

// Open items per register entry (counterpartyId), each group oldest first. Entries without a
// counterparty cannot occur for a message_out (the schema requires it) and are skipped.
export function openItems(entries: readonly JournalEntry[]): Map<string, OpenItem[]> {
  const groups = new Map<string, OpenItem[]>();
  for (const entry of sortedOldestFirst(entries)) {
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

// The register panel's order: the quiet ones on top. Never heard from first, then the oldest
// contact first; ties broken by id so the order is stable between reloads.
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
