// Where a radio message is on its way out (P3-08), as one pure rule over what the outbox and
// the send queue hold. Two facts, never one:
//
//   transmitting  the outbox's active send for the message has handed the radio the payload
//                 and awaits the ack (phases sending and awaiting_ack): the attempt is on the
//                 air and cannot be taken back. Mark and Retry are hidden; nothing else is.
//   waiting       the message is on its way but nothing is on the air: waiting in the send
//                 queue (also while the queue is paused for lack of a radio), handed to the
//                 outbox but not yet transmitting (queued there, or preparing). It can be
//                 marked by hand, which takes it out of the queue; there is nothing to retry.
//   null          nobody holds it.
//
// The status column shows the same words for both (the outbox's phase, or "waiting for its
// turn"); the pages build those from the same inputs.

import { isTransmitting, type ActiveSend } from "../radio/outbox.svelte.ts";

export type SendState = "transmitting" | "waiting" | null;

export interface SendStateInput {
  // outbox.active()
  active: ActiveSend | null;
  // outbox.queued()
  outboxQueued: readonly string[];
  // sendQueue.waiting()
  queueWaiting: readonly string[];
  // sendQueue.sending()
  queueSending: string | null;
}

export function sendStateOf(messageId: string, input: SendStateInput): SendState {
  if (isTransmitting(input.active, messageId)) {
    return "transmitting";
  }
  if (
    input.active?.messageId === messageId ||
    input.outboxQueued.includes(messageId) ||
    input.queueWaiting.includes(messageId) ||
    input.queueSending === messageId
  ) {
    return "waiting";
  }
  return null;
}
