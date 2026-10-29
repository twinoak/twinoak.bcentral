// The outbox (P0-05): takes a stored mesh message_out and walks it through the companion:
// CMD_SEND_TXT_MSG -> RESP_CODE_SENT (status sent) -> PUSH_CODE_SEND_CONFIRMED with the
// expected ack (status delivered); no ack within the window -> resend with the same timestamp
// and attempt + 1, up to the configured number of attempts, then given_up. Every step is a
// journal entry; the outbox stores no status of its own.
//
// One send at a time per device: send() queues, and a second call waits until the first has
// reached delivered or given_up. Simple FIFO; the send-to-all queue (P0-08) builds on it.
//
// Pattern after meshguide.dk/lib/remote-cli.js command() / nextTimestamp(), minus the reply
// handling: the sender timestamp is the PC clock plus the companion's clock offset (read
// once per link with CMD_GET_DEVICE_TIME) and never goes backwards within this session.

import { t } from "../i18n/index.svelte.ts";
import type { JournalStore } from "../store/journalStore.ts";
import { appendStatusChange } from "../store/outgoing.ts";
import type { JournalEntry, Status } from "../store/types.ts";
import { deferred, type Deferred } from "./deferred.ts";
import type { PushListener } from "./radioStore.svelte.ts";
import {
  CompanionError,
  type CompanionLink,
  DEFAULT_TIMEOUT_MS,
  PUSH_CODE_SEND_CONFIRMED,
  RESP_CODE_SENT,
  TXT_TYPE_PLAIN,
  companionGetTime,
  describeError,
  parseAck,
  parseSent,
  textMessagePayload,
  type Ack,
} from "./serial.ts";

// The ack window: the companion's own estimate plus a margin, clamped to 5–20 s (task).
export const ACK_MARGIN_MS = 2000;
export const ACK_WINDOW_MIN_MS = 5000;
export const ACK_WINDOW_MAX_MS = 20000;

export function ackWindowMs(estTimeoutMs: number): number {
  return Math.min(ACK_WINDOW_MAX_MS, Math.max(ACK_WINDOW_MIN_MS, estTimeoutMs + ACK_MARGIN_MS));
}

export interface OutboxDeps {
  store: () => Promise<JournalStore>;
  link: () => CompanionLink | null;
  onPush: (listener: PushListener) => () => void;
  // Milliseconds since the epoch; the sender timestamp is derived from it.
  now: () => number;
  // Read per send, so a settings change applies to the next message.
  maxAttempts: () => number;
  operator: () => string;
  // Overridable for tests; the default is ackWindowMs().
  ackWindow?: (estTimeoutMs: number) => number;
  // How long to wait for RESP_CODE_SENT (and the time query) before giving up.
  responseTimeoutMs?: number;
  log?: (line: string) => void;
}

export type SendPhase = "preparing" | "sending" | "awaiting_ack";

export interface ActiveSend {
  messageId: string;
  seqNo: number;
  // 0 for the first transmission, as on the wire.
  attempt: number;
  maxAttempts: number;
  phase: SendPhase;
  // Set once the companion has accepted the message.
  expectedAck: number | null;
  // When the current ack window closes, in deps.now() milliseconds.
  deadlineMs: number | null;
}

export interface Outbox {
  // Transmits a stored mesh message_out (status pending or given_up) and resolves with its
  // final status for this attempt sequence: delivered or given_up. Waits its turn.
  send(messageId: string): Promise<Status>;
  // Message ids waiting for their turn, in order.
  queued(): readonly string[];
  active(): ActiveSend | null;
  // Bumped after every journal entry the outbox writes; screens reload on it.
  revision(): number;
  // The last sender timestamp used, for tests and the log; 0 before the first send.
  lastTimestamp(): number;
}

export class OutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxError";
  }
}

export function createOutbox(deps: OutboxDeps): Outbox {
  const ackWindow = deps.ackWindow ?? ackWindowMs;
  const responseTimeoutMs = deps.responseTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  let queued: string[] = $state.raw([]);
  let active: ActiveSend | null = $state.raw(null);
  let revision = $state(0);

  let locked = false;
  let unlocked: Deferred<void> = deferred<void>();

  // The companion's clock offset, measured once per link; the last timestamp handed out.
  let offsetLink: CompanionLink | null = null;
  let clockOffsetSeconds = 0;
  let lastTimestamp = 0;

  function log(line: string): void {
    deps.log?.(line);
  }

  async function acquire(): Promise<void> {
    while (locked) {
      await unlocked.promise;
    }
    locked = true;
    unlocked = deferred<void>();
  }

  function release(): void {
    locked = false;
    unlocked.resolve();
  }

  async function record(
    store: JournalStore,
    message: JournalEntry,
    newStatus: Status,
    text?: string,
  ): Promise<void> {
    await appendStatusChange(store, message, newStatus, text, deps.operator());
    revision += 1;
    log(`#${message.seqNo} -> ${newStatus}${text === undefined ? "" : ` (${text})`}`);
  }

  // The sender timestamp: PC seconds plus the companion's offset, and at least one more than
  // the last one, so two sends in one second (or a PC clock stepping back) still go forward.
  async function nextTimestamp(link: CompanionLink): Promise<number> {
    if (offsetLink !== link) {
      const companionSeconds = await companionGetTime(link, responseTimeoutMs);
      clockOffsetSeconds = companionSeconds - Math.floor(deps.now() / 1000);
      offsetLink = link;
      log(`companion clock offset ${clockOffsetSeconds} s`);
    }
    const candidate = Math.floor(deps.now() / 1000) + clockOffsetSeconds;
    const timestamp = Math.max(candidate, lastTimestamp + 1);
    lastTimestamp = timestamp;
    return timestamp;
  }

  // Waits until `acks` holds the expected code or the window closes. The window is one real
  // timer; pushes wake the loop through `wake`.
  async function waitForAck(
    acks: Ack[],
    expectedAck: number,
    windowMs: number,
    wake: { current: Deferred<void> | null },
  ): Promise<Ack | null> {
    let expired = false;
    let waiter = deferred<void>();
    const timer = setTimeout(() => {
      expired = true;
      waiter.resolve();
    }, windowMs);
    try {
      for (;;) {
        const hit = acks.find((ack) => ack.ackCode === expectedAck);
        if (hit !== undefined) {
          return hit;
        }
        if (expired) {
          return null;
        }
        waiter = deferred<void>();
        wake.current = waiter;
        await waiter.promise;
      }
    } finally {
      clearTimeout(timer);
      wake.current = null;
    }
  }

  async function transmit(store: JournalStore, message: JournalEntry, recipientKey: string): Promise<Status> {
    const seqNo = message.seqNo ?? 0;
    const maxAttempts = Math.max(1, deps.maxAttempts());
    const link = deps.link();
    if (link === null) {
      await record(store, message, "given_up", t("send.text.noRadio"));
      return "given_up";
    }

    // Collect acks from before the command goes out, so one that arrives in the same tick as
    // RESP_CODE_SENT is not missed.
    const acks: Ack[] = [];
    const wake: { current: Deferred<void> | null } = { current: null };
    const unsubscribe = deps.onPush((frame) => {
      if (frame[0] !== PUSH_CODE_SEND_CONFIRMED) {
        return;
      }
      try {
        acks.push(parseAck(frame));
      } catch (error) {
        log(`bad ack frame: ${describeError(error)}`);
        return;
      }
      wake.current?.resolve();
    });

    try {
      active = { messageId: message.id, seqNo, attempt: 0, maxAttempts, phase: "preparing", expectedAck: null, deadlineMs: null };
      let timestamp: number;
      try {
        timestamp = await nextTimestamp(link);
      } catch (error) {
        await record(store, message, "given_up", t("send.text.sendFailed", { error: describeError(error) }));
        return "given_up";
      }
      const text = message.text ?? "";

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await store.appendEntry({
            incidentId: message.incidentId,
            operator: deps.operator(),
            type: "note",
            refersTo: message.id,
            text: t("send.text.resend", { n: seqNo, attempt: attempt + 1, max: maxAttempts }),
          });
          revision += 1;
        }
        active = { messageId: message.id, seqNo, attempt, maxAttempts, phase: "sending", expectedAck: null, deadlineMs: null };

        const payload = textMessagePayload(recipientKey, text, { txtType: TXT_TYPE_PLAIN, attempt, timestamp });
        let frame: Uint8Array;
        try {
          frame = await link.companionCommand(payload, [RESP_CODE_SENT], responseTimeoutMs);
        } catch (error) {
          const reason =
            error instanceof CompanionError
              ? error.code === null
                ? t("send.text.companionError")
                : t("send.text.companionErrorCode", { code: error.code })
              : t("send.text.sendFailed", { error: describeError(error) });
          await record(store, message, "given_up", reason);
          return "given_up";
        }
        const sent = parseSent(frame);
        log(
          `#${seqNo} attempt ${attempt + 1}/${maxAttempts} timestamp ${timestamp} accepted: ` +
            `ack ${sent.expectedAck.toString(16)}, est ${sent.estTimeoutMs} ms${sent.isFlood ? ", flood" : ""}`,
        );
        if (attempt === 0) {
          await record(store, message, "sent");
        }

        const windowMs = ackWindow(sent.estTimeoutMs);
        active = {
          messageId: message.id,
          seqNo,
          attempt,
          maxAttempts,
          phase: "awaiting_ack",
          expectedAck: sent.expectedAck,
          deadlineMs: deps.now() + windowMs,
        };
        const ack = await waitForAck(acks, sent.expectedAck, windowMs, wake);
        if (ack !== null) {
          await record(store, message, "delivered", t("send.text.roundTrip", { ms: ack.roundTripMs }));
          return "delivered";
        }
        log(`#${seqNo} attempt ${attempt + 1}/${maxAttempts}: no ack within ${windowMs} ms`);
      }

      await record(store, message, "given_up", t("send.text.noAck", { attempts: maxAttempts }));
      return "given_up";
    } finally {
      unsubscribe();
      active = null;
    }
  }

  // Ids handed to send() that have not finished yet; checked before the first await, so a
  // second click on the same message is refused at once.
  const requested = new Set<string>();

  async function assertSendable(store: JournalStore, message: JournalEntry): Promise<void> {
    const status = await store.statusOf(message.id);
    if (status !== "pending" && status !== "given_up") {
      throw new OutboxError(t("send.error.wrongStatus", { status }));
    }
  }

  async function send(messageId: string): Promise<Status> {
    if (requested.has(messageId)) {
      throw new OutboxError(t("send.error.alreadyQueued"));
    }
    requested.add(messageId);
    try {
      const store = await deps.store();
      const message = await store.getEntry(messageId);
      if (message === undefined || message.type !== "message_out") {
        throw new OutboxError(t("send.error.notAMessage"));
      }
      if (message.transport !== "mesh" || message.counterpartyId === undefined) {
        throw new OutboxError(t("send.error.notMesh"));
      }
      await assertSendable(store, message);
      const recipient = await store.getRegisterEntry(message.counterpartyId);
      if (recipient === undefined) {
        throw new OutboxError(t("send.error.noRecipient"));
      }

      queued = [...queued, messageId];
      await acquire();
      queued = queued.filter((id) => id !== messageId);
      try {
        // The status may have moved while this send waited its turn.
        await assertSendable(store, message);
        return await transmit(store, message, recipient.publicKey);
      } finally {
        release();
      }
    } finally {
      requested.delete(messageId);
    }
  }

  return {
    send,
    queued: () => queued,
    active: () => active,
    revision: () => revision,
    lastTimestamp: () => lastTimestamp,
  };
}
