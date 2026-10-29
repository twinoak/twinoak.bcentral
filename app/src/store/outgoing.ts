// Outgoing messages above the store (P0-05): the "#n <text>" form and the 160-byte rule from
// contract/text-protocol.md, composing a message_out with its reserved #n, and the manual
// status changes the operator records. A message_out is stored alone: pending is what a
// message with no status_change is (status.ts), so none is written (P1-01). The radio side
// (sending, acks, retries) is src/radio/outbox.svelte.ts.

import { mintId, type JournalStore } from "./journalStore.ts";
import type { JournalEntry, Status, Transport } from "./types.ts";

// A MeshCore text message is at most 160 bytes of UTF-8 (text-protocol.md; MAX_TEXT_LEN in
// src/radio/serial.ts is the same number, and outgoing.test.ts checks that they agree).
export const MAX_MESSAGE_BYTES = 160;

const encoder = new TextEncoder();

// Bytes of UTF-8, which is what the limit counts: "æ" is two, "#12 " is four.
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

// "#n " exactly: a decimal integer >= 1 with no leading zeros, then one space.
export function seqNoPrefix(seqNo: number): string {
  if (!Number.isInteger(seqNo) || seqNo < 1) {
    throw new RangeError(`seqNo must be a whole number >= 1, got ${seqNo}`);
  }
  return `#${seqNo} `;
}

export class MessageTooLongError extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super(`message is ${bytes} bytes of UTF-8, max ${MAX_MESSAGE_BYTES}`);
    this.name = "MessageTooLongError";
    this.bytes = bytes;
  }
}

export class EmptyMessageError extends Error {
  constructor() {
    super("message text is empty");
    this.name = "EmptyMessageError";
  }
}

// The text as transmitted and stored: the prefix, then the body with surrounding whitespace
// removed. Throws on an empty body or more than MAX_MESSAGE_BYTES in total; this is the store
// path's refusal of a 161-byte message (the UI disables Send before it gets here).
export function composeText(seqNo: number, body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") {
    throw new EmptyMessageError();
  }
  const text = seqNoPrefix(seqNo) + trimmed;
  const bytes = byteLength(text);
  if (bytes > MAX_MESSAGE_BYTES) {
    throw new MessageTooLongError(bytes);
  }
  return text;
}

// What the compose screen shows while typing: the predicted prefix (the recipient's last #n
// plus one), the byte count of the whole message, and whether it may be sent.
export interface ComposePreview {
  seqNo: number;
  prefix: string;
  bytes: number;
  empty: boolean;
  tooLong: boolean;
}

export function previewText(lastSeqNo: number, body: string): ComposePreview {
  const seqNo = lastSeqNo + 1;
  const prefix = seqNoPrefix(seqNo);
  const trimmed = body.trim();
  const bytes = byteLength(prefix + trimmed);
  return { seqNo, prefix, bytes, empty: trimmed === "", tooLong: bytes > MAX_MESSAGE_BYTES };
}

// The compose screen of "send to all" (P0-08): the byte counter has to hold for every chosen
// recipient, so it is computed for the longest "#n " prefix among them, i.e. the highest
// last #n. A text that fits the longest prefix fits all; composeText still refuses per
// recipient at write time. No recipients chosen: the preview is as for a first message.
export function batchPreview(lastSeqNos: readonly number[], body: string): ComposePreview {
  let highest = 0;
  for (const last of lastSeqNos) {
    if (last > highest) {
      highest = last;
    }
  }
  return previewText(highest, body);
}

export interface ComposeInput {
  incidentId: string;
  operator: string;
  counterpartyId: string;
  transport: Transport;
  // The operator's text, without the prefix.
  body: string;
  // Set by composeBatch on every message of one send-to-all; a single send has none.
  batchId?: string;
}

export interface Composed {
  message: JournalEntry;
}

// Reserves the recipient's next #n and stores the message_out in one transaction, and nothing
// else: its status is pending until the radio or the operator records a status_change. A body
// over the limit throws MessageTooLongError and leaves the counter where it was.
export async function composeMessage(store: JournalStore, input: ComposeInput): Promise<Composed> {
  const message = await store.appendMessageOut(
    {
      incidentId: input.incidentId,
      operator: input.operator,
      transport: input.transport,
      counterpartyId: input.counterpartyId,
      batchId: input.batchId,
    },
    (seqNo) => composeText(seqNo, input.body),
  );
  return { message };
}

export interface BatchComposeInput {
  incidentId: string;
  operator: string;
  // In the order the messages are stored and, later, transmitted. No recipient twice.
  counterpartyIds: readonly string[];
  // The operator's text, without the prefix; the same for everyone.
  body: string;
}

// composeBatch stopped at a recipient: `stored` is what was written before it, each a real
// message_out that stays in the journal (entries are immutable); the caller still has to
// send them. `counterpartyId` is the recipient that failed, `cause` why.
export class BatchComposeError extends Error {
  readonly stored: readonly Composed[];
  readonly counterpartyId: string;
  override readonly cause: unknown;
  constructor(stored: readonly Composed[], counterpartyId: string, cause: unknown) {
    super(
      `batch stopped at recipient ${counterpartyId} after ${stored.length} message(s): ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "BatchComposeError";
    this.stored = stored;
    this.counterpartyId = counterpartyId;
    this.cause = cause;
  }
}

// "Send to all" (text-protocol.md): not a message type, but one message_out per recipient,
// each with that recipient's own next #n, each with its own status. All of them are written
// before any is transmitted (the queue takes them from here), so the journal shows the
// whole batch at once. Every message carries the same batchId, a ULID minted here once per
// batch (journal.schema.json), which is how the journal folds them into one row and the
// queue keeps them together after a reload (P1-01). Mesh only: a batch goes through the
// radio. A repeated recipient is refused before anything is written; a failure in the middle
// throws BatchComposeError carrying the messages already stored.
export async function composeBatch(store: JournalStore, input: BatchComposeInput): Promise<Composed[]> {
  if (new Set(input.counterpartyIds).size !== input.counterpartyIds.length) {
    throw new RangeError("a recipient is chosen twice");
  }
  if (input.counterpartyIds.length === 0) {
    throw new RangeError("no recipients chosen");
  }
  const batchId = mintId();
  const stored: Composed[] = [];
  for (const counterpartyId of input.counterpartyIds) {
    try {
      stored.push(
        await composeMessage(store, {
          incidentId: input.incidentId,
          operator: input.operator,
          counterpartyId,
          transport: "mesh",
          body: input.body,
          batchId,
        }),
      );
    } catch (error) {
      throw new BatchComposeError(stored, counterpartyId, error);
    }
  }
  return stored;
}

// The one way a message's status moves: a status_change referring to it. `text` is the
// reason or detail (an error code, a round-trip time, the resend attempt "attempt 2/3", what
// the courier said); omitted when there is nothing to say.
export async function appendStatusChange(
  store: JournalStore,
  message: JournalEntry,
  newStatus: Status,
  text?: string,
  operator: string = message.operator,
): Promise<JournalEntry> {
  return await store.appendEntry({
    incidentId: message.incidentId,
    operator,
    type: "status_change",
    refersTo: message.id,
    newStatus,
    text,
  });
}

// The statuses the operator may set by hand on a non-mesh message (text-protocol.md: "the
// operator sets sent, delivered and roger by hand"; given_up when the courier came back with
// the note). roger is final, so nothing may be set after it.
export const MANUAL_STATUSES: readonly Status[] = ["sent", "delivered", "roger", "given_up"];

// On a mesh message, sent and delivered come from the radio only. The operator may still
// give up by hand (a message stuck at sent after a reload mid-flight has no other way out)
// and record a roger that reached the staff another way (a phone call). P0-07 reconciliation
// of the P0-05 rule that refused every manual status on mesh.
export const MESH_MANUAL_STATUSES: readonly Status[] = ["roger", "given_up"];

export function manualStatusesFor(transport: Transport): readonly Status[] {
  return transport === "mesh" ? MESH_MANUAL_STATUSES : MANUAL_STATUSES;
}

export class ManualStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualStatusError";
  }
}

// A manual status change always carries the operator's reason in text (P0-07: "with a
// required reason text"); the journal has to say why a human moved the status.
export async function recordManualStatus(
  store: JournalStore,
  message: JournalEntry,
  newStatus: Status,
  options: { operator: string; text: string },
): Promise<JournalEntry> {
  if (message.type !== "message_out") {
    throw new ManualStatusError(`entry ${message.id} is a ${message.type}, not a message_out`);
  }
  if (message.transport === undefined || !manualStatusesFor(message.transport).includes(newStatus)) {
    throw new ManualStatusError(`${newStatus} is not a status the operator sets by hand on a ${message.transport} message`);
  }
  const text = options.text.trim();
  if (text === "") {
    throw new ManualStatusError("a manual status change needs a reason");
  }
  const current = await store.statusOf(message.id);
  if (current === "roger") {
    throw new ManualStatusError("roger is final");
  }
  return await appendStatusChange(store, message, newStatus, text, options.operator);
}
