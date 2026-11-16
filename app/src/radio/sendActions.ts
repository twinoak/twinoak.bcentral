// What the screens do with a stored radio message (P3-08), over the outbox, the send queue
// and the store together — the one place the journal and the handover page send, mark and
// close from, so every manual status change takes the message out of the queue first:
//
//   send      hands the message to the outbox while a radio is connected; with none, it goes
//             into the send queue as a batch of its own, which is paused until a radio
//             connects (before P3-08 the MeshCore tab refused to send without a radio, and
//             the outbox would have given up on the spot with "no radio connected").
//   markByHand  the operator's roger or given-up with a reason (store/outgoing.ts
//             recordManualStatus): cancels the message in the queue and in the outbox first —
//             refused, and nothing written, while it is transmitting — then writes the status.
//             Marked, the message never goes out: reconnecting the radio does not send it.
//   resendByHand  "send by courier" on a given-up radio message (store/handover.ts): the same
//             cancel first, so a given-up message retried into the queue does not go out
//             after its courier copy closed it.
//   closeByHand  the staff's Close on an unconfirmed radio message with an optional note
//             (store/outgoing.ts closeByHand, P3-09): the same cancel first — a given-up
//             message retried into the paused queue leaves it — and refused while the
//             message is transmitting, like a mark.
//
// A factory, like the outbox and the queue, so tests build one over a fake link and store;
// radio/index.ts builds the app's.

import { t } from "../i18n/index.svelte.ts";
import type { JournalStore } from "../store/journalStore.ts";
import { resendByHand as resendWithStore, type CourierHandoff } from "../store/handover.ts";
import {
  closeByHand as closeWithStore,
  recordManualStatus as recordWithStore,
} from "../store/outgoing.ts";
import type { JournalEntry, Status, Transport } from "../store/types.ts";
import type { Outbox } from "./outbox.svelte.ts";
import type { SendQueue } from "./sendQueue.svelte.ts";

export interface SendActionsDeps {
  store: () => Promise<JournalStore>;
  outbox: Outbox;
  sendQueue: SendQueue;
  // Whether a radio is connected (or blind): the queue's own rule.
  radioReady: () => boolean;
  operator: () => string;
}

export interface SendActions {
  // Resolves with the outbox's result for a direct send; "queued" when the message went into
  // the paused queue instead.
  send(message: JournalEntry): Promise<Status | "queued" | null>;
  // Takes the message out of the send queue and the outbox; true when either held it.
  // Throws OutboxError while it is transmitting.
  cancel(messageId: string): boolean;
  markByHand(message: JournalEntry, newStatus: Status, reason: string): Promise<JournalEntry>;
  resendByHand(
    message: JournalEntry,
    input: { transport: Transport; body: string },
  ): Promise<CourierHandoff>;
  // Close with an optional note (P3-09); the status_change `closed` written.
  closeByHand(message: JournalEntry, note: string): Promise<JournalEntry>;
}

export function createSendActions(deps: SendActionsDeps): SendActions {
  async function send(message: JournalEntry): Promise<Status | "queued" | null> {
    if (deps.radioReady()) {
      return await deps.outbox.send(message.id);
    }
    deps.sendQueue.enqueue([message]);
    return "queued";
  }

  // Both are asked, in this order: the queue lets go of what it holds (and hands a cancel
  // on to the outbox for what it handed over); the outbox lets go of a single send. The
  // outbox throws on a transmitting message before anything else happens.
  function cancel(messageId: string): boolean {
    const fromQueue = deps.sendQueue.cancel(messageId);
    const fromOutbox = deps.outbox.cancel(messageId);
    return fromQueue || fromOutbox;
  }

  async function markByHand(
    message: JournalEntry,
    newStatus: Status,
    reason: string,
  ): Promise<JournalEntry> {
    cancel(message.id);
    const store = await deps.store();
    return await recordWithStore(store, message, newStatus, {
      operator: deps.operator(),
      text: reason,
    });
  }

  async function resendByHand(
    message: JournalEntry,
    input: { transport: Transport; body: string },
  ): Promise<CourierHandoff> {
    cancel(message.id);
    const store = await deps.store();
    return await resendWithStore(store, message, {
      operator: deps.operator(),
      transport: input.transport,
      body: input.body,
      reason: t("handover.givenUp.resentReason", { via: t(`send.transport.${input.transport}`) }),
    });
  }

  async function closeByHand(message: JournalEntry, note: string): Promise<JournalEntry> {
    cancel(message.id);
    const store = await deps.store();
    return await closeWithStore(store, message, { operator: deps.operator(), note });
  }

  return { send, cancel, markByHand, resendByHand, closeByHand };
}
