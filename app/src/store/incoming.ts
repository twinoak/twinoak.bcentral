// Incoming messages above the store (P0-06): the roger rules of contract/text-protocol.md,
// "Incoming: field → staff", applied to a stored message_in. The three rules, in order, with
// the exact regexes from the contract:
//
//   1. numbered roger  ^[Rr]([1-9][0-9]*)$  → roger for #n if this device sent #n to this
//      counterparty and its derived status is sent or delivered; otherwise nothing.
//   2. bare roger      ^[Rr]$               → roger for the highest-numbered message to this
//      counterparty whose status is sent or delivered; otherwise nothing.
//   3. anything else                        → nothing.
//
// "Nothing" means the message_in stays an ordinary incoming message: no status change, no
// guessing. The message_in itself is always stored first, by the inbox (src/radio/inbox.svelte.ts).

import type { JournalStore } from "./journalStore.ts";
import { appendStatusChange } from "./outgoing.ts";
import type { JournalEntry, Status } from "./types.ts";

export const NUMBERED_ROGER = /^[Rr]([1-9][0-9]*)$/;
export const BARE_ROGER = /^[Rr]$/;

export type RogerRule = { rule: "numbered"; n: number } | { rule: "bare" } | { rule: "plain" };

// Which rule an incoming text falls under. Leading and trailing whitespace is trimmed before
// matching, as the contract says; nothing else is normalised.
export function parseRoger(text: string): RogerRule {
  const trimmed = text.trim();
  const numbered = NUMBERED_ROGER.exec(trimmed);
  if (numbered !== null) {
    return { rule: "numbered", n: Number(numbered[1]) };
  }
  if (BARE_ROGER.test(trimmed)) {
    return { rule: "bare" };
  }
  return { rule: "plain" };
}

// A message is open for a roger when the companion has it (sent) or has its receipt
// (delivered). pending, roger and given_up are not: the contract lists them as "otherwise".
export function isOpenForRoger(status: Status): boolean {
  return status === "sent" || status === "delivered";
}

export interface RogerCandidate {
  message: JournalEntry;
  status: Status;
}

// The pure part: given the rule and this device's outgoing messages to the counterparty
// with their derived status, the message the roger closes, or null. Rule 1 wants the
// message with exactly that #n; rule 2 the highest #n among the open ones.
export function chooseRoger(
  rule: RogerRule,
  candidates: readonly RogerCandidate[],
): JournalEntry | null {
  if (rule.rule === "plain") {
    return null;
  }
  let chosen: RogerCandidate | undefined;
  for (const candidate of candidates) {
    const seqNo = candidate.message.seqNo;
    if (seqNo === undefined || !isOpenForRoger(candidate.status)) {
      continue;
    }
    if (rule.rule === "numbered") {
      if (seqNo === rule.n) {
        return candidate.message;
      }
      continue;
    }
    if (chosen === undefined || seqNo > (chosen.message.seqNo ?? 0)) {
      chosen = candidate;
    }
  }
  return chosen?.message ?? null;
}

export class IncomingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncomingError";
  }
}

// Applies the roger rules to a stored message_in: reads this device's message_out entries to
// the same counterparty, derives their status, chooses per the rules, and appends the
// status_change → roger with the incoming entry's id as its text (the contract's form, see
// contract/examples/walkthrough.json). Returns the status_change, or null when the text is an
// ordinary incoming message. Nothing else is written.
export async function applyIncoming(
  store: JournalStore,
  incoming: JournalEntry,
): Promise<JournalEntry | null> {
  if (incoming.type !== "message_in") {
    throw new IncomingError(`entry ${incoming.id} is a ${incoming.type}, not a message_in`);
  }
  if (incoming.counterpartyId === undefined) {
    throw new IncomingError(`message_in ${incoming.id} has no counterparty`);
  }
  const rule = parseRoger(incoming.text ?? "");
  if (rule.rule === "plain") {
    return null;
  }

  const candidates: RogerCandidate[] = [];
  for (const entry of await store.entriesForCounterparty(incoming.counterpartyId)) {
    if (
      entry.type !== "message_out" ||
      entry.deviceId !== store.deviceId ||
      entry.seqNo === undefined
    ) {
      continue;
    }
    if (rule.rule === "numbered" && entry.seqNo !== rule.n) {
      continue;
    }
    candidates.push({ message: entry, status: await store.statusOf(entry.id) });
  }

  const message = chooseRoger(rule, candidates);
  if (message === null) {
    return null;
  }
  return await appendStatusChange(store, message, "roger", incoming.id, incoming.operator);
}
