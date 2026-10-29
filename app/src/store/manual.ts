// What the operator types into the journal by hand from the journal screen (P0-07): a note,
// a correction of an entry, and a message that came in on a non-mesh transport (a phone call,
// a courier's note, something said across the room). Outgoing non-mesh messages go through
// outgoing.ts's composeMessage like any other message_out; manual status changes through its
// recordManualStatus.
//
// A non-mesh message_in is stored as typed and nothing is parsed out of it: the roger rules
// in contract/text-protocol.md are for the text of MeshCore direct messages. A roger that
// arrives by phone is recorded as a manual status change on the message it answers.

import type { JournalStore } from "./journalStore.ts";
import type { JournalEntry, Transport } from "./types.ts";

export const NON_MESH_TRANSPORTS: readonly Transport[] = ["phone", "courier", "verbal"];

export class ManualEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualEntryError";
  }
}

// Every manual entry carries text the operator wrote; whitespace-only is nothing.
export function requiredText(text: string, what: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new ManualEntryError(`${what} needs a text`);
  }
  return trimmed;
}

export interface NoteInput {
  incidentId: string;
  operator: string;
  text: string;
}

export async function appendNote(store: JournalStore, input: NoteInput): Promise<JournalEntry> {
  return await store.appendEntry({
    incidentId: input.incidentId,
    operator: input.operator,
    type: "note",
    text: requiredText(input.text, "a note"),
  });
}

export interface CorrectionInput {
  operator: string;
  // What is right. The original entry is never touched (contract: append-only).
  text: string;
}

// A correction of any stored entry, filed under that entry's incident. The target has to be
// in the store: a correction of nothing is refused.
export async function appendCorrection(
  store: JournalStore,
  target: JournalEntry,
  input: CorrectionInput,
): Promise<JournalEntry> {
  const stored = await store.getEntry(target.id);
  if (stored === undefined) {
    throw new ManualEntryError(`entry ${target.id} is not in the journal`);
  }
  return await store.appendEntry({
    incidentId: stored.incidentId,
    operator: input.operator,
    type: "correction",
    refersTo: stored.id,
    text: requiredText(input.text, "a correction"),
  });
}

export interface ManualMessageInInput {
  incidentId: string;
  operator: string;
  counterpartyId: string;
  transport: Transport;
  text: string;
}

// A message from the field that did not come over the radio. Transport mesh is refused:
// mesh messages come from the inbox with a dedupe key, never from a form.
export async function appendMessageIn(
  store: JournalStore,
  input: ManualMessageInInput,
): Promise<JournalEntry> {
  if (!NON_MESH_TRANSPORTS.includes(input.transport)) {
    throw new ManualEntryError(
      `a ${input.transport} message is received by the radio, not typed in`,
    );
  }
  if ((await store.getRegisterEntry(input.counterpartyId)) === undefined) {
    throw new ManualEntryError(`register entry ${input.counterpartyId} does not exist`);
  }
  return await store.appendEntry({
    incidentId: input.incidentId,
    operator: input.operator,
    type: "message_in",
    transport: input.transport,
    counterpartyId: input.counterpartyId,
    text: requiredText(input.text, "an incoming message"),
  });
}
