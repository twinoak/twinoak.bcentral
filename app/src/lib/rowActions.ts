// Which actions an open row offers (P3-04), as one pure rule per row kind. The buttons are
// exactly these, in this order, on the action line of the open row (components/Timeline.svelte):
//
//   message_out over the radio   Retry (given up) or Send (never sent, nobody sending it), Mark, Correct
//   message_out by hand          Correct (P3-07: a phone, courier or verbal message has no
//                                status to mark and nothing to retry; its follow-up is a point)
//   message_in                   Reply, Correct
//   note                         Correct
//   a send-to-all row            Retry all given up (when any can be retried)
//
// The incident's own status rows and an orphan correction offer nothing and do not open.
//
// Every row that opens also offers one point action (P3-05, pointAction below), first on the
// action line: Open point while the entry has no point, Close point while its point is open,
// Reopen point while its point is closed. A send-to-all row's point is its first message's.

import type { PointState } from "../store/journalView.ts";
import type { EntryType, Status, Transport } from "../store/types.ts";

export type RowAction = "retry" | "send" | "mark" | "correct" | "reply" | "retryAll";

export type PointAction = "openPoint" | "closePoint" | "reopenPoint";

// The one point action of a row from the state of its point: none → Open point, open → Close
// point, closed → Reopen point. Also what `P` on a focused row does.
export function pointAction(state: PointState | undefined): PointAction {
  if (state === undefined) {
    return "openPoint";
  }
  return state === "open" ? "closePoint" : "reopenPoint";
}

export interface MessageActionInput {
  transport: Transport | undefined;
  // The chain's status of a radio message; null for a message by phone, courier or verbal,
  // which has none (store/status.ts).
  status: Status | null;
  // The page's rule for Retry / Send: a mesh message nobody is sending, given up or never
  // sent (JournalPage.svelte canRetry).
  canRetry: boolean;
  // The outbox or the queue holds the message right now.
  inflight: boolean;
}

export function messageActions(input: MessageActionInput): RowAction[] {
  const actions: RowAction[] = [];
  if (input.canRetry) {
    actions.push(input.status === "given_up" ? "retry" : "send");
  }
  // Mark: a manual roger or given-up with a reason on a radio message (store/outgoing.ts
  // MANUAL_STATUSES), until the message is confirmed and while nothing is sending it. A
  // message without a chain (status null) has nothing to mark.
  if (
    input.transport === "mesh" &&
    input.status !== null &&
    input.status !== "roger" &&
    !input.inflight
  ) {
    actions.push("mark");
  }
  actions.push("correct");
  return actions;
}

export function entryActions(type: EntryType): RowAction[] {
  switch (type) {
    case "message_in":
      return ["reply", "correct"];
    case "note":
      return ["correct"];
    default:
      return [];
  }
}

// `retryable` is the number of the batch's given-up recipients the page's rule lets the
// operator retry.
export function batchActions(retryable: number): RowAction[] {
  return retryable > 0 ? ["retryAll"] : [];
}
