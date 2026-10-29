// The inbox (P0-06): everything the companion receives lands in the journal as message_in.
// On PUSH_CODE_MSG_WAITING (and once right after connect, and when an incident is selected)
// drain() loops companionNextMessage() until the companion's queue is empty. For each
// direct message: the 6-byte sender prefix is matched against the companion's contact list
// (refreshed once if it is not there) to get the full public key, the key to a register
// entry (created as "unknown <prefix>" when there is none, one per key), the message_in is
// stored with its dedupe key (a second delivery of the same message stores nothing), and
// then the roger rules run over it (src/store/incoming.ts). Channel messages go to the log
// only; channels are out of the model.
//
// A message_in needs an incident (the schema requires incidentId). While no incident is
// selected nothing is synced: the companion keeps its queue until the app asks, so the
// messages are not lost, only waiting. Selecting an incident drains them.

import { t } from "../i18n/index.svelte.ts";
import { dedupeKey } from "../store/dedupeKey.ts";
import { applyIncoming } from "../store/incoming.ts";
import { DuplicatePublicKeyError, type JournalStore } from "../store/journalStore.ts";
import type { JournalEntry, RegisterEntry } from "../store/types.ts";
import type { PushListener } from "./radioStore.svelte.ts";
import {
  type CompanionContact,
  type CompanionLink,
  type ContactMessage,
  DEFAULT_TIMEOUT_MS,
  type NextMessage,
  PUSH_CODE_MSG_WAITING,
  companionNextMessage,
  describeError,
} from "./serial.ts";

export interface InboxDeps {
  store: () => Promise<JournalStore>;
  link: () => CompanionLink | null;
  onPush: (listener: PushListener) => () => void;
  // The companion's contact list as the radio store holds it, and a way to read it again.
  contacts: () => readonly CompanionContact[];
  refreshContacts: () => Promise<readonly CompanionContact[]>;
  // The incident incoming messages are filed under; null while none is selected.
  incidentId: () => string | null;
  operator: () => string;
  responseTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface DrainResult {
  // message_in entries stored by this drain.
  stored: JournalEntry[];
  // status_change → roger entries written by this drain.
  rogers: JournalEntry[];
  // Messages the companion handed out that were already in the journal (same dedupe key).
  duplicates: number;
  // Direct messages whose sender could not be resolved to a public key, and channel
  // messages; both are logged, neither is stored.
  skipped: number;
  // False when the drain stopped early: no link, no incident, or a companion error.
  completed: boolean;
}

export interface Inbox {
  // Pulls everything waiting on the companion into the journal. Calls overlap safely: a
  // second drain() while one runs makes it go round once more and returns the same promise.
  drain(): Promise<DrainResult>;
  // Bumped after every journal entry the inbox writes; screens reload on it.
  revision(): number;
  // Stops listening for MSG_WAITING.
  stop(): void;
}

function emptyResult(completed: boolean): DrainResult {
  return { stored: [], rogers: [], duplicates: 0, skipped: 0, completed };
}

// Exact, case-sensitive prefix match over the lowercase hex keys. One hit is the sender;
// none or more than one is "unknown" (no guessing).
export function findByKeyPrefix<T extends { publicKey: string }>(
  items: readonly T[],
  prefix: string,
): T | null {
  const hits = items.filter((item) => item.publicKey.startsWith(prefix));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

export function createInbox(deps: InboxDeps): Inbox {
  const responseTimeoutMs = deps.responseTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  let revision = $state(0);
  let running: Promise<DrainResult> | null = null;
  let again = false;

  function log(line: string): void {
    deps.log?.(line);
  }

  const unsubscribe = deps.onPush((frame) => {
    if (frame[0] === PUSH_CODE_MSG_WAITING) {
      void drain();
    }
  });

  // The sender's full public key for a 6-byte prefix: the contact list first, then the list
  // read again (the message may be from a contact added since connect), then the register
  // (an entry typed by hand whose radio the companion has since forgotten). Null when none
  // of them has exactly one key with that prefix.
  async function resolveSender(store: JournalStore, prefix: string): Promise<string | null> {
    const known = findByKeyPrefix(deps.contacts(), prefix);
    if (known !== null) {
      return known.publicKey;
    }
    try {
      const refreshed = findByKeyPrefix(await deps.refreshContacts(), prefix);
      if (refreshed !== null) {
        return refreshed.publicKey;
      }
    } catch (error) {
      log(`contact list refresh failed: ${describeError(error)}`);
    }
    const registered = findByKeyPrefix(await store.allRegisterEntries(), prefix);
    return registered?.publicKey ?? null;
  }

  // The register entry for a public key, created when there is none: origin private, label
  // "unknown <prefix>", for the staff to rename. A lost race with another writer (the same
  // key stored between the lookup and the create) ends in the entry that won.
  async function registerEntryFor(
    store: JournalStore,
    publicKey: string,
    prefix: string,
  ): Promise<RegisterEntry> {
    const existing = await store.registerEntryByPublicKey(publicKey);
    if (existing !== undefined) {
      return existing;
    }
    try {
      const created = await store.createRegisterEntry({
        publicKey,
        label: t("register.unknownLabel", { prefix }),
        origin: "private",
      });
      revision += 1;
      log(`new register entry "${created.label}" for ${publicKey.slice(0, 12)}…`);
      return created;
    } catch (error) {
      if (error instanceof DuplicatePublicKeyError) {
        const winner = await store.getRegisterEntry(error.existingId);
        if (winner !== undefined) {
          return winner;
        }
      }
      throw error;
    }
  }

  async function receive(
    store: JournalStore,
    incidentId: string,
    message: ContactMessage,
    result: DrainResult,
  ): Promise<void> {
    const publicKey = await resolveSender(store, message.pubKeyPrefix);
    if (publicKey === null) {
      result.skipped += 1;
      log(
        `message from unknown prefix ${message.pubKeyPrefix} not in the contact list; dropped: ${JSON.stringify(message.text)}`,
      );
      return;
    }
    const counterparty = await registerEntryFor(store, publicKey, message.pubKeyPrefix);
    const key = await dedupeKey(publicKey, message.senderTimestamp, message.text);
    const existing = await store.entryByDedupeKey(key);
    if (existing !== undefined) {
      result.duplicates += 1;
      log(`duplicate of ${existing.id} from "${counterparty.label}"; not stored again`);
      return;
    }
    const stored = await store.appendEntry({
      incidentId,
      operator: deps.operator(),
      type: "message_in",
      transport: "mesh",
      counterpartyId: counterparty.id,
      text: message.text,
      dedupeKey: key,
    });
    revision += 1;
    result.stored.push(stored);
    log(
      `message_in ${stored.id} from "${counterparty.label}": ${JSON.stringify(message.text)}` +
        (message.snr === null ? "" : ` (SNR ${message.snr} dB)`),
    );

    const roger = await applyIncoming(store, stored);
    if (roger !== null) {
      revision += 1;
      result.rogers.push(roger);
      log(`roger for ${roger.refersTo} from ${stored.id}`);
    }
  }

  async function drainOnce(): Promise<DrainResult> {
    const link = deps.link();
    if (link === null) {
      return emptyResult(false);
    }
    const incidentId = deps.incidentId();
    if (incidentId === null) {
      log("no incident selected; messages stay on the companion until one is");
      return emptyResult(false);
    }
    const result = emptyResult(true);
    const store = await deps.store();
    for (;;) {
      let next: NextMessage;
      try {
        next = await companionNextMessage(link, responseTimeoutMs);
      } catch (error) {
        log(`sync failed: ${describeError(error)}`);
        result.completed = false;
        return result;
      }
      if (next.kind === "empty") {
        return result;
      }
      if (next.kind === "channel") {
        result.skipped += 1;
        log(
          `channel message (${next.frame.length} bytes) ignored; channels are not in the journal`,
        );
        continue;
      }
      try {
        await receive(store, incidentId, next.message, result);
      } catch (error) {
        // The message is already out of the companion's queue; the log is all that is left
        // of it. Stopping here would lose the ones behind it as well, so carry on.
        result.skipped += 1;
        log(
          `storing a message from ${next.message.pubKeyPrefix} failed: ${describeError(error)}; text ${JSON.stringify(next.message.text)}`,
        );
      }
    }
  }

  async function drainLoop(): Promise<DrainResult> {
    let total = emptyResult(true);
    do {
      again = false;
      const pass = await drainOnce();
      total = {
        stored: [...total.stored, ...pass.stored],
        rogers: [...total.rogers, ...pass.rogers],
        duplicates: total.duplicates + pass.duplicates,
        skipped: total.skipped + pass.skipped,
        completed: pass.completed,
      };
    } while (again && total.completed);
    return total;
  }

  async function drain(): Promise<DrainResult> {
    if (running !== null) {
      again = true;
      return await running;
    }
    for (;;) {
      running = drainLoop();
      let result: DrainResult;
      try {
        result = await running;
      } finally {
        running = null;
      }
      // A push that landed between the loop's last check and here asks for one more round.
      if (!again || !result.completed) {
        return result;
      }
    }
  }

  return {
    drain,
    revision: () => revision,
    stop: unsubscribe,
  };
}
