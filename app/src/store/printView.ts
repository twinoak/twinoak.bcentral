// What the print view shows (P1-04): the incident's timeline in P1-01's folding (one line per
// message with its strip, a batch as one block, corrections in place), oldest first by
// default because a printed journal reads top-down, and optionally only what is new since
// the last print. Pure functions over the entries, like journalView.ts.

import {
  buildTimeline,
  sortedOldestFirst,
  type MessageView,
  type TimelineRow,
} from "./journalView.ts";
import type { Incident, JournalEntry } from "./types.ts";

export interface PrintOptions {
  // ISO timestamp of the previous print, or null for the whole journal.
  since: string | null;
  oldestFirst: boolean;
}

function latestOf(timestamps: readonly string[]): string {
  let latest = "";
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const timestamp of timestamps) {
    const ms = Date.parse(timestamp);
    if (ms > latestMs) {
      latestMs = ms;
      latest = timestamp;
    }
  }
  return latest;
}

function timestampsOfMessage(view: MessageView): string[] {
  return [
    view.entry.timestamp,
    ...view.history.flatMap((item) => [
      item.entry.timestamp,
      ...item.corrections.map((c) => c.timestamp),
    ]),
    ...view.corrections.map((c) => c.timestamp),
  ];
}

// The newest timestamp among everything the row folds in: the entry, its corrections, a
// message's transitions and their corrections, a batch's recipients. A message sent before
// the last print whose roger came after it is new again: the printed strip has changed.
export function latestTimestampOf(row: TimelineRow): string {
  switch (row.kind) {
    case "entry":
      return latestOf([row.entry.timestamp, ...row.corrections.map((c) => c.timestamp)]);
    case "message":
      return latestOf(timestampsOfMessage(row.message));
    case "batch":
      return latestOf(row.messages.flatMap(timestampsOfMessage));
  }
}

// A row is printed when something in it is at or after `since` ("entries older than the
// stored time" are left out; one stamped exactly at the print time is printed again rather
// than never).
export function isSince(row: TimelineRow, since: string | null): boolean {
  return since === null || Date.parse(latestTimestampOf(row)) >= Date.parse(since);
}

export function printRows(entries: readonly JournalEntry[], options: PrintOptions): TimelineRow[] {
  const rows = buildTimeline(entries).filter((row) => isSince(row, options.since));
  return options.oldestFirst ? rows.reverse() : rows;
}

// The operators who wrote into the incident, in order of first appearance, the one who
// opened it first.
export function operatorsOf(incident: Incident, entries: readonly JournalEntry[]): string[] {
  const names: string[] = [incident.createdBy];
  for (const entry of sortedOldestFirst(entries)) {
    if (!names.includes(entry.operator)) {
      names.push(entry.operator);
    }
  }
  return names;
}
