// The "New record" tab (P3-01): everything the operator writes into the journal by hand — a
// note, an incoming message, an outgoing message — the two message kinds on a non-radio
// transport (phone, courier, verbal). One function routes the form's input to the entry it
// is: a note (manual.ts), a message_in as typed (manual.ts), or a message_out with the
// recipient's next #n (outgoing.ts), stored exactly as the compose form stored a non-mesh
// message before: the per-recipient counter is shared across transports
// (contract/text-protocol.md, "Non-mesh transports"), the status is set by the operator from
// the row afterwards. Nothing here goes near the radio: mesh is refused on both message
// kinds (a mesh message_in comes from the inbox with a dedupe key, a mesh message_out from
// the MeshCore tab).

import type { JournalStore } from "./journalStore.ts";
import { ManualEntryError, NON_MESH_TRANSPORTS, appendMessageIn, appendNote } from "./manual.ts";
import { composeMessage } from "./outgoing.ts";
import type { JournalEntry, Transport } from "./types.ts";

export type RecordType = "note" | "message_in" | "message_out";

// The Type select's options, in its order.
export const RECORD_TYPES: readonly RecordType[] = ["note", "message_in", "message_out"];

export interface RecordInput {
  incidentId: string;
  operator: string;
  type: RecordType;
  // The other end of a message: "From" on an incoming one, "To" on an outgoing one. Not
  // read for a note.
  counterpartyId?: string;
  // phone, courier or verbal; not read for a note.
  transport?: Transport;
  text: string;
  // The message_in an outgoing record answers (Reply from the row, P1-02); not read for the
  // other kinds.
  refersTo?: string;
}

export async function recordByHand(store: JournalStore, input: RecordInput): Promise<JournalEntry> {
  if (input.type === "note") {
    return await appendNote(store, {
      incidentId: input.incidentId,
      operator: input.operator,
      text: input.text,
    });
  }
  if (input.counterpartyId === undefined || input.counterpartyId === "") {
    throw new ManualEntryError(`a ${input.type} record needs a counterparty`);
  }
  if (input.transport === undefined || !NON_MESH_TRANSPORTS.includes(input.transport)) {
    throw new ManualEntryError(
      `a ${input.type} record goes by phone, courier or verbal; ${input.transport} is the radio's`,
    );
  }
  if (input.type === "message_in") {
    return await appendMessageIn(store, {
      incidentId: input.incidentId,
      operator: input.operator,
      counterpartyId: input.counterpartyId,
      transport: input.transport,
      text: input.text,
    });
  }
  if ((await store.getRegisterEntry(input.counterpartyId)) === undefined) {
    throw new ManualEntryError(`register entry ${input.counterpartyId} does not exist`);
  }
  const { message } = await composeMessage(store, {
    incidentId: input.incidentId,
    operator: input.operator,
    counterpartyId: input.counterpartyId,
    transport: input.transport,
    body: input.text,
    refersTo: input.refersTo,
  });
  return message;
}
