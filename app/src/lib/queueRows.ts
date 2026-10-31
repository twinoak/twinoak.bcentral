// What the send-to-all queue's card says (P2-04): the counts in the title as the same counter
// chips the journal's batch row carries (lib/journalRows.ts), and the state chip of a row.
// Pure, so the screen and a test share the rule; every number is a derived status read off
// the journal (contract: status is never stored).

import type { BatchCounters } from "../store/journalView.ts";
import type { Status } from "../store/types.ts";
import { statusChip, type ChipLook } from "./journalRows.ts";

// Every queued message counted once, by its derived status, in the batch counters' shape so
// counterChips() renders them. The incident's own statuses (closed, reopened) cannot occur on
// a message and are not counted.
export function queueCounters(statuses: Iterable<Status>): BatchCounters {
  const counters: BatchCounters = {
    total: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    roger: 0,
    givenUp: 0,
  };
  for (const status of statuses) {
    switch (status) {
      case "pending":
        counters.pending += 1;
        break;
      case "sent":
        counters.sent += 1;
        break;
      case "delivered":
        counters.delivered += 1;
        break;
      case "roger":
        counters.roger += 1;
        break;
      case "given_up":
        counters.givenUp += 1;
        break;
      default:
        continue;
    }
    counters.total += 1;
  }
  return counters;
}

// The state chip of a queue row: the message's status as the journal shows it, or — while
// the queue or the outbox holds the message (null) — warn with an outline dot, like a
// strip's waiting segment: something is happening and the next state may follow.
export function queueRowChip(status: Status | null): ChipLook {
  return status === null ? { tint: "warn", dot: "outline" } : statusChip(status);
}
