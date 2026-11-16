// Which actions an open row offers (P3-04), as one pure rule per row kind. The buttons are
// exactly these, in this order, on the action line of the open row (components/Timeline.svelte):
//
//   message_out over the radio   Close (unconfirmed: sent, delivered or given up, P3-09 — the
//                                routine way out, first), Retry (given up) or Send (never
//                                sent, nobody sending it), Mark, Correct
//                                — while it is transmitting, Correct alone; while it waits in
//                                a queue, Mark and Correct (P3-08: a live transmission is the
//                                one thing that hides Mark and Close; a waiting message has
//                                nothing to retry yet); once confirmed or closed, Correct
//                                alone (both are final)
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
import { isClosable } from "../store/outgoing.ts";
import type { EntryType, Status, Transport } from "../store/types.ts";
import type { SendState } from "./sendState.ts";

export type RowAction = "close" | "retry" | "send" | "mark" | "correct" | "reply" | "retryAll";

// roger and closed are final (text-protocol.md): nothing moves a message after them.
export function isFinal(status: Status | null): boolean {
  return status === "roger" || status === "closed";
}

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
  // The page's status rule for Retry / Send: a mesh message given up or never sent
  // (JournalPage.svelte canRetry).
  canRetry: boolean;
  // Where the message is on its way out (lib/sendState.ts): on the air, waiting in a queue,
  // or held by nobody.
  sendState: SendState;
}

export function messageActions(input: MessageActionInput): RowAction[] {
  const actions: RowAction[] = [];
  const radio = input.transport === "mesh" && input.status !== null;
  // Close (P3-09): the staff stop waiting for a confirmation that is not coming — on an
  // unconfirmed radio message the radio has handed over or given up on (store/outgoing.ts
  // CLOSABLE_STATUSES), not while the radio is transmitting it (P3-08's rule). First: it is
  // the routine action; Mark is for the cases where the staff know.
  if (radio && isClosable(input.status) && input.sendState !== "transmitting") {
    actions.push("close");
  }
  // Retry / Send only while nobody holds the message: a waiting one goes out by itself (or
  // is marked), a transmitting one is on the air; never on a final message, whatever the
  // page's rule says.
  if (input.canRetry && !isFinal(input.status) && input.sendState === null) {
    actions.push(input.status === "given_up" ? "retry" : "send");
  }
  // Mark: a manual roger or given-up with a reason on a radio message (store/outgoing.ts
  // MANUAL_STATUSES), until the message is final, and hidden only while the radio is in the
  // middle of transmitting it (P3-08) — a message waiting in a queue, paused or not, can be
  // marked and leaves the queue. A message without a chain (status null) has nothing to
  // mark.
  if (radio && !isFinal(input.status) && input.sendState !== "transmitting") {
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
