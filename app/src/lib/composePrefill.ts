// Which of the journal's two compose tabs an action opens, and with what (P3-01). The tabs
// have one job each — "New record" is what the operator writes by hand, "MeshCore" is a
// message over the radio — so an action that composes is routed here, deterministically,
// from the entry it starts from:
//
// - Reply (P1-02) on an incoming mesh message opens MeshCore with the sender as recipient;
//   on an incoming message by phone, courier or verbal it opens New record as an outgoing
//   message on the same transport to the sender. Both carry the incoming entry, so the
//   answer is stored with refersTo = its id.
// - "Send by courier" (P1-08) on a given-up message opens New record as an outgoing courier
//   message to the same recipient with the original's body as the text; recording it closes
//   the original (store/handover.ts). "Send status request" is a radio message and stays on
//   MeshCore; it has no prefill, since it is sent at once.
//
// Pure: nothing here reads a store or a screen.

import { bodyOf } from "../store/journalView.ts";
import type { RecordType } from "../store/record.ts";
import type { JournalEntry, Transport } from "../store/types.ts";

export interface MeshCorePrefill {
  tab: "meshcore";
  counterpartyId: string;
  // The incoming message the next send answers, or null.
  replyTo: JournalEntry | null;
}

export interface RecordPrefill {
  tab: "record";
  type: RecordType;
  transport: Transport;
  counterpartyId: string;
  text: string;
  // The incoming message the outgoing record answers, or null.
  replyTo: JournalEntry | null;
  // The given-up message the outgoing record replaces, closed when it is recorded; or null.
  closes: JournalEntry | null;
}

export type ComposePrefill = MeshCorePrefill | RecordPrefill;

export class PrefillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrefillError";
  }
}

// Reply from the row: the tab follows the incoming message's transport.
export function replyPrefill(entry: JournalEntry): ComposePrefill {
  if (entry.type !== "message_in" || entry.counterpartyId === undefined) {
    throw new PrefillError(`entry ${entry.id} is not an incoming message`);
  }
  if (entry.transport === "mesh") {
    return { tab: "meshcore", counterpartyId: entry.counterpartyId, replyTo: entry };
  }
  return {
    tab: "record",
    type: "message_out",
    transport: entry.transport ?? "phone",
    counterpartyId: entry.counterpartyId,
    text: "",
    replyTo: entry,
    closes: null,
  };
}

// "Send by courier" on a given-up message: the same text to the same recipient, by courier.
export function courierPrefill(original: JournalEntry): RecordPrefill {
  if (original.type !== "message_out" || original.counterpartyId === undefined) {
    throw new PrefillError(`entry ${original.id} is not an outgoing message`);
  }
  return {
    tab: "record",
    type: "message_out",
    transport: "courier",
    counterpartyId: original.counterpartyId,
    text: bodyOf(original),
    replyTo: null,
    closes: original,
  };
}
