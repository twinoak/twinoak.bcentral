// Derived status of an outgoing message (contract/text-protocol.md, "Status of an outgoing
// message"): the newStatus of the latest status_change that refers to it, latest by timestamp,
// then by deviceSeq; "pending" when there is none. Pure function over entries.

import type { JournalEntry, Status } from "./types.ts";

// Later-than ordering for status_change entries. Timestamps are compared as instants, so
// "…Z" and "…+00:00" spellings of the same moment are equal and fall through to deviceSeq.
// Two entries from different devices can tie on both; the ULID id, unique and time-ordered,
// then decides, so the answer does not depend on the order entries were read in.
function isLater(candidate: JournalEntry, current: JournalEntry): boolean {
  const byTime = Date.parse(candidate.timestamp) - Date.parse(current.timestamp);
  if (byTime !== 0) {
    return byTime > 0;
  }
  if (candidate.deviceSeq !== current.deviceSeq) {
    return candidate.deviceSeq > current.deviceSeq;
  }
  return candidate.id > current.id;
}

export function latestStatusChange(
  entries: readonly JournalEntry[],
  refersTo: string,
): JournalEntry | undefined {
  let latest: JournalEntry | undefined;
  for (const entry of entries) {
    if (entry.type !== "status_change" || entry.refersTo !== refersTo) {
      continue;
    }
    if (latest === undefined || isLater(entry, latest)) {
      latest = entry;
    }
  }
  return latest;
}

export function statusOf(entries: readonly JournalEntry[], messageOutId: string): Status {
  const latest = latestStatusChange(entries, messageOutId);
  if (latest === undefined || latest.newStatus === undefined) {
    return "pending";
  }
  return latest.newStatus;
}
