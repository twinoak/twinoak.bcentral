// Outgoing messages above the store (P0-05): the "#n <text>" form and the 160-byte rule from
// contract/text-protocol.md, composing a mesh message_out with its reserved #n, and the
// manual status changes the operator records on one. A message_out is stored alone: pending
// is what a mesh message with no status_change is (status.ts), so none is written (P1-01).
// In a drill incident (P1-05) a radio message's text is "ØVELSE #n <text>"; the prefix is
// part of the stored text, so the journal shows exactly what went on the air.
//
// The number and the status chain are the radio's (P3-07; contract/text-protocol.md,
// "Non-mesh transports have no status chain"): a message_out by phone, courier or verbal is
// a plain record of something that happened — its text as typed, no #n, no prefix, no byte
// limit, no status_change ever referring to it, and nothing to mark by hand. Follow-up on
// one is a point (points.ts). The radio side (sending, acks, retries) is
// src/radio/outbox.svelte.ts.

import { mintId, type JournalStore } from "./journalStore.ts";
import { isDrill } from "./incidents.ts";
import { hasRadio } from "./register.ts";
import { hasStatusChain } from "./status.ts";
import type { JournalEntry, RadioContact, Status, Transport } from "./types.ts";

// A MeshCore text message is at most 160 bytes of UTF-8 (text-protocol.md; MAX_TEXT_LEN in
// src/radio/serial.ts is the same number, and outgoing.test.ts checks that they agree).
export const MAX_MESSAGE_BYTES = 160;

// The on-air prefix of a drill incident's messages (text-protocol.md, Drill mode). Not
// translated and never through t(): the people reading it on their phones are Danish and the
// word must be identical everywhere.
export const DRILL_PREFIX = "ØVELSE ";

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

// Everything in front of the operator's text: "#n " for a real incident, "ØVELSE #n " for a
// drill. The whole of it counts against the byte limit.
export function messagePrefix(seqNo: number, drill: boolean): string {
  return (drill ? DRILL_PREFIX : "") + seqNoPrefix(seqNo);
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

// The text as transmitted and stored: the prefix ("#n ", or "ØVELSE #n " in a drill), then
// the body with surrounding whitespace removed. Throws on an empty body or more than
// MAX_MESSAGE_BYTES in total, the drill prefix included; this is the store path's refusal of
// a 161-byte message (the UI disables Send before it gets here).
export function composeText(seqNo: number, body: string, drill = false): string {
  const trimmed = plainText(body);
  const text = messagePrefix(seqNo, drill) + trimmed;
  const bytes = byteLength(text);
  if (bytes > MAX_MESSAGE_BYTES) {
    throw new MessageTooLongError(bytes);
  }
  return text;
}

// The text of a message by phone, courier or verbal as stored (P3-07): the body with its
// surrounding whitespace removed and nothing else — no number, no drill prefix (the prefix
// is for the phones that read the air, text-protocol.md), no byte limit (the 160 bytes are
// the radio's). Empty is refused like a radio message's.
export function plainText(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") {
    throw new EmptyMessageError();
  }
  return trimmed;
}

// What the compose screen shows while typing: the predicted prefix (the recipient's last #n
// plus one, with ØVELSE in front in a drill), the byte count of the whole message, and
// whether it may be sent.
export interface ComposePreview {
  seqNo: number;
  prefix: string;
  bytes: number;
  empty: boolean;
  tooLong: boolean;
}

export function previewText(lastSeqNo: number, body: string, drill = false): ComposePreview {
  const seqNo = lastSeqNo + 1;
  const prefix = messagePrefix(seqNo, drill);
  const trimmed = body.trim();
  const bytes = byteLength(prefix + trimmed);
  return { seqNo, prefix, bytes, empty: trimmed === "", tooLong: bytes > MAX_MESSAGE_BYTES };
}

// The compose screen of "send to all" (P0-08): the byte counter has to hold for every chosen
// recipient, so it is computed for the longest "#n " prefix among them, i.e. the highest
// last #n. A text that fits the longest prefix fits all; composeText still refuses per
// recipient at write time. No recipients chosen: the preview is as for a first message.
export function batchPreview(
  lastSeqNos: readonly number[],
  body: string,
  drill = false,
): ComposePreview {
  let highest = 0;
  for (const last of lastSeqNos) {
    if (last > highest) {
      highest = last;
    }
  }
  return previewText(highest, body, drill);
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
  // The id of the message_in this message answers (Reply from the row, P1-02); the message
  // is stored with that id as its refersTo. Omitted when the message answers nothing.
  refersTo?: string;
}

export interface Composed {
  message: JournalEntry;
}

// A reply's target has to be a stored message_in: the schema allows any entry id in refersTo,
// but the app only ever writes a message_out's refersTo for an answer to an incoming message.
export class ReplyTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplyTargetError";
  }
}

// What the compose form says it is replying to: the first `max` characters of the incoming
// text, with an ellipsis when it was cut. Counted in code points, so a cut never splits a
// character.
export const REPLY_SNIPPET_LENGTH = 60;

export function replySnippet(text: string, max: number = REPLY_SNIPPET_LENGTH): string {
  const characters = [...text];
  if (characters.length <= max) {
    return text;
  }
  return `${characters.slice(0, max).join("")}…`;
}

// Whether the incident is a drill, read from the store: the prefix follows the incident the
// message is filed under, never a flag the caller passes, so a drill's text cannot be sent
// without it. An incident that is not in the store (imported data, tests) is not a drill.
async function isDrillIncident(store: JournalStore, incidentId: string): Promise<boolean> {
  return isDrill(await store.getIncident(incidentId));
}

// Stores the message_out and nothing else. A reply (refersTo) is checked against the store
// first: its target must be a message_in.
//
// Over the radio: reserves the recipient's next #n and stores the message in one
// transaction; its status is pending until the radio or the operator records a
// status_change. A body over the limit throws MessageTooLongError and leaves the counter
// where it was. In a drill incident the text gets the ØVELSE prefix (P1-05).
//
// By phone, courier or verbal (P3-07): a plain record — the text as typed, no number
// reserved, no prefix, no status; the counter is not touched. The schema refuses a seqNo or
// a batchId on it, so a batch is the radio's only (composeBatch).
export async function composeMessage(store: JournalStore, input: ComposeInput): Promise<Composed> {
  if (input.refersTo !== undefined) {
    const target = await store.getEntry(input.refersTo);
    if (target === undefined) {
      throw new ReplyTargetError(`entry ${input.refersTo} is not in the journal`);
    }
    if (target.type !== "message_in") {
      throw new ReplyTargetError(`entry ${input.refersTo} is a ${target.type}, not a message_in`);
    }
  }
  if (input.transport !== "mesh") {
    const message = await store.appendEntry({
      incidentId: input.incidentId,
      operator: input.operator,
      type: "message_out",
      transport: input.transport,
      counterpartyId: input.counterpartyId,
      batchId: input.batchId,
      refersTo: input.refersTo,
      text: plainText(input.body),
    });
    return { message };
  }
  const drill = await isDrillIncident(store, input.incidentId);
  const message = await store.appendMessageOut(
    {
      incidentId: input.incidentId,
      operator: input.operator,
      transport: "mesh",
      counterpartyId: input.counterpartyId,
      batchId: input.batchId,
      refersTo: input.refersTo,
    },
    (seqNo) => composeText(seqNo, input.body, drill),
  );
  return { message };
}

// The recipient of a radio message has to be a contact with a radio: a public key to send
// to (P3-06). A contact reached by phone, courier or in person is not one, and an id that is
// not in the register is not one either.
export class RecipientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipientError";
  }
}

// The register entry a radio message may go to, or RecipientError: the one check behind the
// MeshCore tab and the handover's status request.
export async function assertRadioRecipient(store: JournalStore, counterpartyId: string): Promise<RadioContact> {
  const entry = await store.getRegisterEntry(counterpartyId);
  if (entry === undefined) {
    throw new RecipientError(`register entry ${counterpartyId} does not exist`);
  }
  if (!hasRadio(entry)) {
    throw new RecipientError(`contact "${entry.label}" (${counterpartyId}) has no radio`);
  }
  return entry;
}

export interface MeshComposeInput {
  incidentId: string;
  operator: string;
  counterpartyId: string;
  body: string;
  refersTo?: string;
}

// The MeshCore tab's path (P3-01): a message over the radio and nothing else. The transport
// is mesh, always; the recipient is checked against the register first, so a contact
// without a radio — never listed by the form, but any id can reach the store — is refused
// before anything is reserved. Sending the stored message is the outbox's job.
export async function composeMeshMessage(store: JournalStore, input: MeshComposeInput): Promise<Composed> {
  await assertRadioRecipient(store, input.counterpartyId);
  return await composeMessage(store, {
    incidentId: input.incidentId,
    operator: input.operator,
    counterpartyId: input.counterpartyId,
    transport: "mesh",
    body: input.body,
    refersTo: input.refersTo,
  });
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

// Thrown by appendStatusChange for a message that has no status chain: a message_out by
// phone, courier or verbal (P3-07; the schema cannot see the referenced entry's transport,
// so this is where the contract's "status_change refers to mesh messages only" is enforced).
export class StatusChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusChainError";
  }
}

// The one way a message's status moves: a status_change referring to it. `text` is the
// reason or detail (an error code, a round-trip time, the resend attempt "attempt 2/3", the
// operator's reason); omitted when there is nothing to say. Refused on a message without a
// chain (status.ts hasStatusChain): nothing is written.
export async function appendStatusChange(
  store: JournalStore,
  message: JournalEntry,
  newStatus: Status,
  text?: string,
  operator: string = message.operator,
): Promise<JournalEntry> {
  if (!hasStatusChain(message)) {
    throw new StatusChainError(
      `entry ${message.id} (${message.type}${message.transport === undefined ? "" : ` by ${message.transport}`}) has no status chain; only a mesh message_out has one`,
    );
  }
  return await store.appendEntry({
    incidentId: message.incidentId,
    operator,
    type: "status_change",
    refersTo: message.id,
    newStatus,
    text,
  });
}

// The statuses the operator may set by hand, on a mesh message: sent and delivered come
// from the radio only, but the operator may give up (a message stuck at sent after a reload
// mid-flight has no other way out) and record a roger that reached the staff another way (a
// phone call). roger is final, so nothing may be set after it. A message by phone, courier
// or verbal has no status to set (P3-07); the Mark action is not offered on it.
export const MANUAL_STATUSES: readonly Status[] = ["roger", "given_up"];

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
  if (!hasStatusChain(message)) {
    throw new ManualStatusError(
      `a ${message.transport} message has no status; the chain is the radio's (P3-07)`,
    );
  }
  if (!MANUAL_STATUSES.includes(newStatus)) {
    throw new ManualStatusError(`${newStatus} is not a status the operator sets by hand`);
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
