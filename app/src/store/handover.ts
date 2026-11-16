// The writes the handover screen makes (P1-08), above the store: the handover note when the
// operator name changes, the status request to a quiet radio, and the "send by courier"
// decision on a given-up message (recorded from the New record tab since P3-01; since P3-07
// the copy is a plain record with a point on it). Everything is an ordinary entry the
// journal already has (note, message_out, point, status_change); the data model is
// untouched.

import { suggestedTitle } from "../lib/pointTitle.ts";
import type { JournalStore } from "./journalStore.ts";
import { NON_MESH_TRANSPORTS } from "./manual.ts";
import {
  assertRadioRecipient,
  composeMessage,
  recordManualStatus,
  type Composed,
} from "./outgoing.ts";
import { openPoint } from "./points.ts";
import type { JournalEntry, Transport } from "./types.ts";

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
// any message (and the ØVELSE prefix in a drill). The recipient has to be a contact with a
// radio (P3-06: RecipientError otherwise, nothing reserved). Sending it is the outbox's job.
export async function composeStatusRequest(
  store: JournalStore,
  input: StatusRequestInput,
): Promise<Composed> {
  await assertRadioRecipient(store, input.counterpartyId);
  return await composeMessage(store, {
    incidentId: input.incidentId,
    operator: input.operator,
    counterpartyId: input.counterpartyId,
    transport: "mesh",
    body: STATUS_REQUEST_BODY,
  });
}

// --- send by courier -----------------------------------------------------------------------

export interface ResendOptions {
  operator: string;
  // The transport the copy goes by: phone, courier or verbal. "Send by courier" opens the
  // record form with courier chosen (P3-01); the operator may change it before recording.
  transport: Transport;
  // The copy's text, prefilled with the original's body and possibly edited.
  body: string;
  // The reason recorded on the original ("sent via Courier").
  reason: string;
}

export interface CourierHandoff {
  // The copy: a plain message_out on the chosen transport to the same recipient (P3-07: no
  // #n, no status).
  copy: JournalEntry;
  // The point opened on the copy, titled from its text: the follow-up the chain used to be.
  point: JournalEntry;
  // The status_change that closed the original.
  closed: JournalEntry;
}

// The decision "send by courier" on a given-up radio message, recorded from the New record
// tab (P3-01): a plain message_out on a non-radio transport to the same recipient, a point
// opened on it so the follow-up is not lost (P3-07: a courier copy has no status chain to
// watch; "the courier is not back" is a point), and the original closed with roger and the
// reason, which is how an item leaves the staff's queue (text-protocol.md: roger is final;
// P0-07: a roger on a mesh message may be recorded by hand). The copy and its point are
// written first, so a refused close leaves them for the operator to see and the original
// still in the list. The radio is refused: a copy over the mesh is a Retry, not a resend;
// and only a radio message can be given up, so only one can be resent this way.
export async function resendByHand(
  store: JournalStore,
  original: JournalEntry,
  options: ResendOptions,
): Promise<CourierHandoff> {
  if (original.type !== "message_out" || original.counterpartyId === undefined) {
    throw new HandoverError(`entry ${original.id} is not an outgoing message`);
  }
  if (!NON_MESH_TRANSPORTS.includes(options.transport)) {
    throw new HandoverError(
      `a resend by hand goes by phone, courier or verbal, not ${options.transport}`,
    );
  }
  if ((await store.statusOf(original.id)) !== "given_up") {
    throw new HandoverError(`message ${original.id} is not given up`);
  }
  const { message: copy } = await composeMessage(store, {
    incidentId: original.incidentId,
    operator: options.operator,
    counterpartyId: original.counterpartyId,
    transport: options.transport,
    body: options.body,
  });
  const point = await openPoint(store, copy, {
    operator: options.operator,
    title: suggestedTitle(copy.text ?? ""),
  });
  const closed = await recordManualStatus(store, original, "roger", {
    operator: options.operator,
    text: options.reason,
  });
  return { copy, point, closed };
}
