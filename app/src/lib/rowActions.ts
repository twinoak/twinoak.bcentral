// Which actions an open row offers (P3-04), as one pure rule per row kind. The buttons are
// exactly these, in this order, on the action line of the open row (components/Timeline.svelte):
//
//   message_out over the radio   Retry (given up) or Send (never sent, nobody sending it), Mark, Correct
//   message_out by hand          Mark, Correct
//   message_in                   Reply, Correct
//   note                         Correct
//   a send-to-all row            Retry all given up (when any can be retried)
//
// The incident's own status rows and an orphan correction offer nothing and do not open.

import type { EntryType, Status, Transport } from "../store/types.ts";

export type RowAction = "retry" | "send" | "mark" | "correct" | "reply" | "retryAll";

export interface MessageActionInput {
  transport: Transport | undefined;
  status: Status;
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
  // Mark: a manual status with a reason, on any transport, until the message is confirmed
  // and while nothing is sending it (store/outgoing.ts manualStatusesFor says which).
  if (input.status !== "roger" && input.transport !== undefined && !input.inflight) {
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
