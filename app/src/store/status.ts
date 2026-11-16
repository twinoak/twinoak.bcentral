// Derived status of an outgoing message (contract/text-protocol.md, "Status of an outgoing
// message"): the newStatus of the latest status_change that refers to it, latest by timestamp,
// then by deviceSeq; "pending" when there is none. Only a mesh message has a status chain
// (P3-07; the contract since 2026-11-16): a message by phone, courier or verbal is a plain
// record and its status is null — not pending, nothing. Pure functions over entries.

import type { JournalEntry, Status } from "./types.ts";

// Whether an entry is a message_out the status chain applies to: one that went over the
// radio. The one definition every screen and store path narrows on; a message_out on any
// other transport has no chain, and neither has anything that is not a message_out.
export function hasStatusChain(entry: JournalEntry): boolean {
  return entry.type === "message_out" && entry.transport === "mesh";
}

// Later-than ordering for status_change entries. Timestamps are compared as instants, so
// "…Z" and "…+00:00" spellings of the same moment are equal and fall through to deviceSeq.
// Two entries from different devices can tie on both; the ULID id, unique and time-ordered,
// then decides, so the answer does not depend on the order entries were read in.
export function isLater(candidate: JournalEntry, current: JournalEntry): boolean {
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

// The status of a message: the chain's latest status for a mesh message_out (pending when
// nothing refers to it yet), null for a message on any other transport, which has no chain
// (and null for anything that is not a message_out). `entries` are the entries to read the
// chain from — the incident's, or just those referring to the message.
export function statusOf(entries: readonly JournalEntry[], message: JournalEntry): Status | null {
  if (!hasStatusChain(message)) {
    return null;
  }
  const latest = latestStatusChange(entries, message.id);
  if (latest === undefined || latest.newStatus === undefined) {
    return "pending";
  }
  return latest.newStatus;
}
