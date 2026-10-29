// The send-to-all queue (P0-08): the messages of a batch, one message_out per recipient,
// handed to P0-05's one-at-a-time outbox in order with a minimum gap between transmissions
// (settings; the mesh tolerates a handful of messages a minute). The queue stores nothing:
// a batch is the in-memory list of message ids sharing one batchId (the field composeBatch
// stamps on every message of a send-to-all, P1-01), every status is derived from the journal,
// and after a reload the pending messages are found in the store and queued again under their
// own batchId (requeuePending), so the grouping survives the reload.
//
// While the radio is disconnected the queue pauses instead of letting the outbox give up on
// every recipient in turn (FOLLOWUPS.md fix-next for P0-08); it goes on when a radio has
// connected.
//
// The loop is one plain async function: take the head of the queue, wait out the gap, wait
// for a radio, hand the message to the outbox, await its terminal status, repeat.

import { t } from "../i18n/index.svelte.ts";
import type { JournalStore } from "../store/journalStore.ts";
import { sortedOldestFirst } from "../store/journalView.ts";
import { statusOf } from "../store/status.ts";
import type { JournalEntry } from "../store/types.ts";
import { deferred, type Deferred } from "./deferred.ts";
import type { Outbox } from "./outbox.svelte.ts";
import type { RadioState } from "./radioStore.svelte.ts";
import { describeError } from "./serial.ts";

export interface SendQueueDeps {
  store: () => Promise<JournalStore>;
  outbox: Outbox;
  // Milliseconds since the epoch; the gap and the countdown are measured on it.
  now: () => number;
  // Read before every gap, so a settings change applies to the next transmission.
  gapMs: () => number;
  radioState: () => RadioState;
  // Fires after a successful connect; the paused queue goes on at it.
  onConnected: (listener: () => void) => () => void;
  log?: (line: string) => void;
}

// idle     nothing waiting, nothing in flight
// paused   messages waiting, no radio connected
// gap      waiting for the minimum gap since the last transmission ended
// sending  a message has been handed to the outbox and has not come back yet
export type QueuePhase = "idle" | "paused" | "gap" | "sending";

export interface QueueItem {
  messageId: string;
  incidentId: string;
  counterpartyId: string;
  seqNo: number;
  text: string;
}

export interface Batch {
  // The messages' batchId; a single message without one is a batch of its own, keyed by
  // the message id.
  id: string;
  // When the queue first saw the batch (this session's clock, for the screen's title).
  createdAtMs: number;
  // True for a batch made of pending messages found in the store after a reload.
  restored: boolean;
  // In transmission order.
  items: QueueItem[];
}

export interface SendQueue {
  // Queues stored mesh message_out entries in the given order and starts sending. Messages
  // sharing a batchId form one batch (a batch already known to this session is extended);
  // one without a batchId is a batch of its own. Returns the batches created or extended.
  // Refuses a message that is not a mesh message_out or is already queued.
  enqueue(messages: readonly JournalEntry[], options?: { restored?: boolean }): readonly Batch[];
  // Queues messages of earlier batches again (the given-up ones, from the queue screen).
  retry(messageIds: readonly string[]): void;
  // Finds the incident's mesh message_out entries whose derived status is pending and that
  // nobody holds, and queues them as restored batches by their batchId; empty when there
  // are none.
  requeuePending(incidentId: string): Promise<readonly Batch[]>;
  // Newest batch first.
  batches(): readonly Batch[];
  // Message ids not yet handed to the outbox, in order.
  waiting(): readonly string[];
  isWaiting(messageId: string): boolean;
  // The message handed to the outbox and not yet back, or null.
  sending(): string | null;
  phase(): QueuePhase;
  // When the gap ends, in deps.now() milliseconds; null outside the gap.
  nextTransmissionAt(): number | null;
  countdownMs(): number | null;
  // The least time until a waiting message can be handed to the outbox, counting the gaps
  // alone (transmissions and receipt waits come on top); null when it is not waiting, or
  // while the queue is paused with no radio.
  earliestStartMs(messageId: string): number | null;
  // The least time until the last waiting message is handed over; 0 when nothing waits.
  drainEstimateMs(): number | null;
  // What the outbox refused, by message id; cleared when the message is queued again.
  errors(): ReadonlyMap<string, string>;
  // Bumped on every change to the queue's membership or phase; screens reload on it.
  revision(): number;
  // Ends the loop and forgets what was waiting (the messages stay pending in the store).
  stop(): void;
}

export class SendQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendQueueError";
  }
}

export function createSendQueue(deps: SendQueueDeps): SendQueue {
  let batches: Batch[] = $state.raw([]);
  let waiting: string[] = $state.raw([]);
  let sending: string | null = $state(null);
  let phase: QueuePhase = $state("idle");
  let nextTransmissionAt: number | null = $state(null);
  let errors: Map<string, string> = $state.raw(new Map());
  let revision = $state(0);

  let running = false;
  let stopped = false;
  // When the last transmission ended (the outbox resolved); the gap counts from here.
  let lastFinishedAt: number | null = null;
  // Resolved by whatever the loop is waiting for: the gap timer, a connect, stop().
  let wake: Deferred<void> | null = null;

  function log(line: string): void {
    deps.log?.(line);
  }

  function touch(): void {
    revision += 1;
  }

  function radioReady(): boolean {
    const state = deps.radioState();
    return state === "connected" || state === "blind";
  }

  const unsubscribe = deps.onConnected(() => {
    wake?.resolve();
  });

  // Returns when deps.now() has reached `untilMs` or the queue was stopped. A timer that
  // fires early goes round once more, so the gap holds by the queue's own clock.
  async function sleepUntil(untilMs: number): Promise<void> {
    for (;;) {
      const remaining = untilMs - deps.now();
      if (remaining <= 0 || stopped) {
        return;
      }
      const waiter = deferred<void>();
      wake = waiter;
      const timer = setTimeout(() => waiter.resolve(), remaining);
      await waiter.promise;
      clearTimeout(timer);
      if (wake === waiter) {
        wake = null;
      }
    }
  }

  // The only way out of paused is a connect that succeeds, which fires onConnected; a
  // connect that fails leaves the radio disconnected and the queue waiting.
  async function waitForRadio(): Promise<void> {
    while (!radioReady() && !stopped) {
      if (phase !== "paused") {
        phase = "paused";
        touch();
        log("paused: no radio connected");
      }
      const waiter = deferred<void>();
      wake = waiter;
      await waiter.promise;
      if (wake === waiter) {
        wake = null;
      }
    }
  }

  async function run(): Promise<void> {
    running = true;
    try {
      for (;;) {
        const messageId = waiting[0];
        if (messageId === undefined || stopped) {
          return;
        }
        // Awaits only when there is something to wait for, so the phase a caller sees right
        // after enqueue() is already the loop's (gap, paused or sending), never idle.
        if (lastFinishedAt !== null) {
          const until = lastFinishedAt + deps.gapMs();
          nextTransmissionAt = until;
          phase = "gap";
          touch();
          await sleepUntil(until);
          nextTransmissionAt = null;
        }
        if (stopped) {
          return;
        }
        if (!radioReady()) {
          await waitForRadio();
        }
        if (stopped) {
          return;
        }

        waiting = waiting.filter((id) => id !== messageId);
        sending = messageId;
        phase = "sending";
        touch();
        try {
          const result = await deps.outbox.send(messageId);
          log(`${messageId} -> ${result}`);
        } catch (error) {
          const reason = describeError(error);
          errors = new Map(errors).set(messageId, reason);
          log(`${messageId} refused by the outbox: ${reason}`);
        }
        sending = null;
        lastFinishedAt = deps.now();
        touch();
      }
    } finally {
      running = false;
      sending = null;
      nextTransmissionAt = null;
      phase = "idle";
      touch();
    }
  }

  function start(): void {
    if (!running) {
      void run();
    }
  }

  function held(messageId: string): boolean {
    return (
      waiting.includes(messageId) ||
      sending === messageId ||
      deps.outbox.queued().includes(messageId) ||
      deps.outbox.active()?.messageId === messageId
    );
  }

  function forget(messageIds: readonly string[]): void {
    if (messageIds.some((id) => errors.has(id))) {
      const next = new Map(errors);
      for (const id of messageIds) {
        next.delete(id);
      }
      errors = next;
    }
  }

  function enqueue(
    messages: readonly JournalEntry[],
    options: { restored?: boolean } = {},
  ): readonly Batch[] {
    if (stopped) {
      throw new SendQueueError(t("queue.error.stopped"));
    }
    if (messages.length === 0) {
      throw new SendQueueError(t("queue.error.noRecipients"));
    }
    // Items by batch id, in the order the batches first appear; items in message order.
    const grouped = new Map<string, QueueItem[]>();
    for (const message of messages) {
      if (
        message.type !== "message_out" ||
        message.transport !== "mesh" ||
        message.counterpartyId === undefined ||
        message.seqNo === undefined
      ) {
        throw new SendQueueError(t("send.error.notMesh"));
      }
      if (
        held(message.id) ||
        [...grouped.values()].flat().some((item) => item.messageId === message.id)
      ) {
        throw new SendQueueError(t("send.error.alreadyQueued"));
      }
      const batchId = message.batchId ?? message.id;
      const items = grouped.get(batchId) ?? [];
      items.push({
        messageId: message.id,
        incidentId: message.incidentId,
        counterpartyId: message.counterpartyId,
        seqNo: message.seqNo,
        text: message.text ?? "",
      });
      grouped.set(batchId, items);
    }

    const touched: Batch[] = [];
    let next = batches;
    for (const [id, items] of grouped) {
      const existing = next.find((batch) => batch.id === id);
      if (existing !== undefined) {
        const extended: Batch = { ...existing, items: [...existing.items, ...items] };
        next = next.map((batch) => (batch === existing ? extended : batch));
        touched.push(extended);
        continue;
      }
      const batch: Batch = {
        id,
        createdAtMs: deps.now(),
        restored: options.restored ?? false,
        items,
      };
      next = [batch, ...next];
      touched.push(batch);
    }
    batches = next;

    const ids = messages.map((message) => message.id);
    forget(ids);
    waiting = [...waiting, ...ids];
    touch();
    for (const batch of touched) {
      log(
        `batch ${batch.id}: ${batch.items.length} message(s) queued${batch.restored ? " (restored)" : ""}`,
      );
    }
    start();
    return touched;
  }

  function retry(messageIds: readonly string[]): void {
    if (stopped) {
      throw new SendQueueError(t("queue.error.stopped"));
    }
    const known = new Set(batches.flatMap((batch) => batch.items.map((item) => item.messageId)));
    for (const id of messageIds) {
      if (!known.has(id)) {
        throw new SendQueueError(t("queue.error.notInQueue"));
      }
      if (held(id)) {
        throw new SendQueueError(t("send.error.alreadyQueued"));
      }
    }
    if (messageIds.length === 0) {
      return;
    }
    forget(messageIds);
    waiting = [...waiting, ...messageIds];
    touch();
    log(`retry: ${messageIds.length} message(s) queued again`);
    start();
  }

  // Only the given incident's own messages, read by incident: a drill's pending messages are
  // never queued again while a real incident is current, nor a real incident's while a drill
  // is (P1-05), because nothing outside `incidentId` is looked at.
  async function requeuePending(incidentId: string): Promise<readonly Batch[]> {
    const store = await deps.store();
    const entries = await store.entriesForIncident(incidentId);
    const pending = sortedOldestFirst(entries).filter(
      (entry) =>
        entry.type === "message_out" &&
        entry.transport === "mesh" &&
        !held(entry.id) &&
        statusOf(entries, entry.id) === "pending",
    );
    if (pending.length === 0) {
      return [];
    }
    return enqueue(pending, { restored: true });
  }

  function countdownMs(): number | null {
    return nextTransmissionAt === null ? null : Math.max(0, nextTransmissionAt - deps.now());
  }

  function earliestStartMs(messageId: string): number | null {
    const position = waiting.indexOf(messageId);
    if (position < 0 || phase === "paused") {
      return null;
    }
    const gap = deps.gapMs();
    if (phase === "gap") {
      return (countdownMs() ?? 0) + position * gap;
    }
    if (phase === "sending") {
      return (position + 1) * gap;
    }
    return position * gap;
  }

  function drainEstimateMs(): number | null {
    const last = waiting[waiting.length - 1];
    return last === undefined ? 0 : earliestStartMs(last);
  }

  function stop(): void {
    stopped = true;
    waiting = [];
    unsubscribe();
    wake?.resolve();
    touch();
  }

  return {
    enqueue,
    retry,
    requeuePending,
    batches: () => batches,
    waiting: () => waiting,
    isWaiting: (messageId) => waiting.includes(messageId),
    sending: () => sending,
    phase: () => phase,
    nextTransmissionAt: () => nextTransmissionAt,
    countdownMs,
    earliestStartMs,
    drainEstimateMs,
    errors: () => errors,
    revision: () => revision,
    stop,
  };
}
