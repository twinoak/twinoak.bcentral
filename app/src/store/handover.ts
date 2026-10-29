// The writes the handover screen makes (P1-08), above the store: the handover note when the
// operator name changes, the status request to a quiet radio, and the "send by courier"
// decision on a given-up message. Everything is an ordinary entry the journal already has
// (note, message_out, status_change); the data model is untouched.

import { bodyOf } from "./journalView.ts";
import type { JournalStore } from "./journalStore.ts";
import { composeMessage, recordManualStatus, type Composed } from "./outgoing.ts";
import type { JournalEntry } from "./types.ts";

export class HandoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoverError";
  }
}

// --- the handover note ---------------------------------------------------------------------

// The one note a handover writes: "handover: ‹old› → ‹new›", as the task spells it. Not
// through t(): the journal says the same thing whatever the UI language, so a later reader
// (the hub, a human) finds every handover by the same words.
export function handoverNoteText(from: string, to: string): string {
  return `handover: ${from} → ${to}`;
}

export interface HandoverInput {
  incidentId: string;
  // The operator leaving, as the settings had the name.
  from: string;
  // The operator taking over, as typed.
  to: string;
}

// Appends the handover note, stamped with the operator taking over (the one who signs the
// handover in). Returns null and writes nothing when the name did not change; an empty new
// name is refused.
export async function recordHandover(
  store: JournalStore,
  input: HandoverInput,
): Promise<JournalEntry | null> {
  const to = input.to.trim();
  if (to === "") {
    throw new HandoverError("the operator taking over needs a name");
  }
  const from = input.from.trim();
  if (from === to) {
    return null;
  }
  return await store.appendEntry({
    incidentId: input.incidentId,
    operator: to,
    type: "note",
    text: handoverNoteText(from, to),
  });
}

// --- the status request --------------------------------------------------------------------

// The text of a status request as it goes on the air: "#n Meld status". The field reads it
// on Danish phones, so it is the same word in every UI language and never goes through t()
// (like the ØVELSE prefix, outgoing.ts).
export const STATUS_REQUEST_BODY = "Meld status";

export interface StatusRequestInput {
  incidentId: string;
  operator: string;
  counterpartyId: string;
}

// A mesh message_out "#n Meld status" to one radio, with that radio's next #n reserved as for
// any message (and the ØVELSE prefix in a drill). Sending it is the outbox's job.
export async function composeStatusRequest(
  store: JournalStore,
  input: StatusRequestInput,
): Promise<Composed> {
  return await composeMessage(store, {
    incidentId: input.incidentId,
    operator: input.operator,
    counterpartyId: input.counterpartyId,
    transport: "mesh",
    body: STATUS_REQUEST_BODY,
  });
}

// --- send by courier -----------------------------------------------------------------------

export interface CourierHandoffOptions {
  operator: string;
  // The reason recorded on the original ("sent by courier as #n"), built from the copy.
  reason: (copy: JournalEntry) => string;
}

export interface CourierHandoff {
  // The courier message_out: the same body to the same recipient, its own #n, pending.
  copy: JournalEntry;
  // The status_change that closed the original.
  closed: JournalEntry;
}

// The decision "send by courier" on a given-up message: a courier message_out with the same
// body to the same recipient (a new #n, pending until the operator marks it sent / delivered
// / roger by hand), and the original closed with roger and the reason, which is how an item
// leaves the staff's queue (text-protocol.md: roger is final; P0-07: a roger on a mesh
// message may be recorded by hand). The copy is written first, so a refused close leaves a
// copy the operator can see and the original still in the list.
export async function sendByCourier(
  store: JournalStore,
  original: JournalEntry,
  options: CourierHandoffOptions,
): Promise<CourierHandoff> {
  if (original.type !== "message_out" || original.counterpartyId === undefined) {
    throw new HandoverError(`entry ${original.id} is not an outgoing message`);
  }
  if ((await store.statusOf(original.id)) !== "given_up") {
    throw new HandoverError(`message ${original.id} is not given up`);
  }
  const { message: copy } = await composeMessage(store, {
    incidentId: original.incidentId,
    operator: options.operator,
    counterpartyId: original.counterpartyId,
    transport: "courier",
    body: bodyOf(original),
  });
  const closed = await recordManualStatus(store, original, "roger", {
    operator: options.operator,
    text: options.reason(copy),
  });
  return { copy, closed };
}
