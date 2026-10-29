// Outgoing messages above the store (P0-05): the "#n <text>" form and the 160-byte rule from
// contract/text-protocol.md, composing a message_out with its reserved #n and its first
// status_change, and the manual status changes the operator records for non-mesh transports.
// The radio side (sending, acks, retries) is src/radio/outbox.svelte.ts.

import type { JournalStore } from "./journalStore.ts";
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

export interface ComposeInput {
  incidentId: string;
  operator: string;
  counterpartyId: string;
  transport: Transport;
  // The operator's text, without the prefix.
  body: string;
}

export interface Composed {
  message: JournalEntry;
  // The status_change -> pending written for a mesh message, which the radio will take from
  // here; null for the other transports, whose status the operator sets by hand (the derived
  // status of a message with no status_change is pending either way).
  pending: JournalEntry | null;
}

// Reserves the recipient's next #n and stores the message_out in one transaction, then (mesh
// only) the status_change -> pending. A body over the limit throws MessageTooLongError and
// leaves the counter where it was.
export async function composeMessage(store: JournalStore, input: ComposeInput): Promise<Composed> {
  const message = await store.appendMessageOut(
    {
      incidentId: input.incidentId,
      operator: input.operator,
      transport: input.transport,
      counterpartyId: input.counterpartyId,
    },
    (seqNo) => composeText(seqNo, input.body),
  );
  if (input.transport !== "mesh") {
    return { message, pending: null };
  }
  const pending = await appendStatusChange(store, message, "pending");
  return { message, pending };
}

// The one way a message's status moves: a status_change referring to it. `text` is the
// reason or detail (an error code, a round-trip time, what the courier said); omitted when
// there is nothing to say.
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

export class ManualStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualStatusError";
  }
}

export async function recordManualStatus(
  store: JournalStore,
  message: JournalEntry,
  newStatus: Status,
  options: { operator: string; text?: string },
): Promise<JournalEntry> {
  if (message.type !== "message_out") {
    throw new ManualStatusError(`entry ${message.id} is a ${message.type}, not a message_out`);
  }
  if (message.transport === "mesh") {
    throw new ManualStatusError("a mesh message's status comes from the radio, not from a button");
  }
  if (!MANUAL_STATUSES.includes(newStatus)) {
    throw new ManualStatusError(`${newStatus} is not a status the operator sets by hand`);
  }
  const current = await store.statusOf(message.id);
  if (current === "roger") {
    throw new ManualStatusError("roger is final");
  }
  const text = options.text?.trim();
  return await appendStatusChange(store, message, newStatus, text === "" ? undefined : text, options.operator);
}
