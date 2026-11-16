// The screens' send, mark and close over the outbox, the queue and the store (P3-08), on a
// fake link: with the radio disconnected a sent message waits in the paused queue and can be
// marked by hand, which takes it out so a reconnect does not send it; a live transmission
// refuses the mark until its ack is in.

import { describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { openTestStore } from "../test-support/testStore.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import {
  EPOCH,
  FIRST_ACK,
  ackFrame,
  deliveredReply,
  scriptedCompanion,
  sentOnlyReply,
  type SentText,
} from "../test-support/companionFrames.ts";
import type { JournalStore } from "../store/journalStore.ts";
import { ManualStatusError, composeMessage } from "../store/outgoing.ts";
import type { JournalEntry } from "../store/types.ts";
import { OutboxError, createOutbox } from "./outbox.svelte.ts";
import { createRadioStore } from "./radioStore.svelte.ts";
import { createSendActions } from "./sendActions.ts";
import { createSendQueue } from "./sendQueue.svelte.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS_KEY = "10".repeat(32);
const DRAIN_TIMEOUT = { timeout: 15_000, interval: 5 };

setLanguage("en");

interface SetUpOptions {
  onSendText?: (sent: SentText, index: number) => Uint8Array[];
  ackWindowMs?: number;
  maxAttempts?: number;
}

async function setUp(options: SetUpOptions = {}) {
  const transport = new FakeTransport();
  const companion = scriptedCompanion({ time: EPOCH, onSendText: options.onSendText });
  transport.autoReply = companion.reply;
  const radio = createRadioStore({
    now: () => Date.now(),
    blindAfterMs: () => 15 * 60_000,
    createTransport: () => transport,
  });
  const store = await openTestStore();
  const hans = await store.createRegisterEntry({
    publicKey: HANS_KEY,
    label: "Hans",
    origin: "adhoc",
  });
  const log: string[] = [];
  const outbox = createOutbox({
    store: async () => store,
    link: () => radio.link(),
    onPush: radio.onPush,
    now: () => Date.now(),
    maxAttempts: () => options.maxAttempts ?? 1,
    operator: () => "Thomas",
    ackWindow: () => options.ackWindowMs ?? 25,
    responseTimeoutMs: 200,
    log: (line) => log.push(`outbox: ${line}`),
  });
  const queue = createSendQueue({
    store: async () => store,
    outbox,
    now: () => Date.now(),
    gapMs: () => 10,
    radioState: () => radio.state(),
    onConnected: radio.onConnected,
    log: (line) => log.push(`queue: ${line}`),
  });
  const actions = createSendActions({
    store: async () => store,
    outbox,
    sendQueue: queue,
    radioReady: () => radio.state() === "connected" || radio.state() === "blind",
    operator: () => "Anne",
  });

  async function compose(body: string): Promise<JournalEntry> {
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: hans.id,
      transport: "mesh",
      body,
    });
    return message;
  }

  return { store, radio, transport, companion, outbox, queue, actions, hans, log, compose };
}

async function chain(store: JournalStore, message: JournalEntry): Promise<string[]> {
  const entries = await store.entriesReferringTo(message.id);
  return entries
    .sort((a, b) => a.deviceSeq - b.deviceSeq)
    .map((entry) => entry.newStatus ?? entry.type);
}

async function realWait(ms: number): Promise<void> {
  const start = Date.now();
  await vi.waitFor(() => expect(Date.now() - start).toBeGreaterThanOrEqual(ms), {
    timeout: ms + 1000,
    interval: 2,
  });
}

describe("send actions (P3-08)", () => {
  it("radio disconnected: a sent message waits in the paused queue; marking it given up takes it out, stores the status, and a reconnect does not send it", async () => {
    const { store, radio, companion, queue, actions, compose } = await setUp();
    const message = await compose("Kør til Nørregade 4");

    expect(await actions.send(message)).toBe("queued");
    expect(queue.phase()).toBe("paused");
    expect(queue.isWaiting(message.id)).toBe(true);
    expect(queue.batches().map((batch) => batch.id)).toEqual([message.id]);
    // Still pending: the outbox did not give up on it for lack of a radio.
    expect(await store.statusOf(message.id)).toBe("pending");

    const givenUp = await actions.markByHand(message, "given_up", "radioen er i stykker");
    expect(givenUp.newStatus).toBe("given_up");
    expect(givenUp.operator).toBe("Anne");
    expect(givenUp.text).toBe("radioen er i stykker");
    expect(queue.isWaiting(message.id)).toBe(false);
    expect(queue.waiting()).toEqual([]);
    await vi.waitFor(() => expect(queue.phase()).toBe("idle"), DRAIN_TIMEOUT);
    expect(await store.statusOf(message.id)).toBe("given_up");

    await radio.connect("usb");
    expect(radio.state()).toBe("connected");
    await realWait(60);
    expect(companion.sends).toHaveLength(0);
    expect(await chain(store, message)).toEqual(["given_up"]);
    await radio.disconnect();
  });

  it("the same, marking it confirmed (roger) with a reason", async () => {
    const { store, radio, companion, queue, actions, compose } = await setUp();
    const message = await compose("Meld status");
    expect(await actions.send(message)).toBe("queued");
    expect(queue.phase()).toBe("paused");

    const roger = await actions.markByHand(message, "roger", "Hans ringede: modtaget");
    expect(roger.newStatus).toBe("roger");
    expect(queue.waiting()).toEqual([]);
    expect(await store.statusOf(message.id)).toBe("roger");

    await radio.connect("usb");
    await realWait(60);
    expect(companion.sends).toHaveLength(0);
    await radio.disconnect();
  });

  it("a mark without a reason is refused by the store, and the message stays in the queue", async () => {
    const { store, queue, actions, compose } = await setUp();
    const message = await compose("x");
    await actions.send(message);
    await expect(actions.markByHand(message, "given_up", "  ")).rejects.toBeInstanceOf(
      ManualStatusError,
    );
    // The cancel ran before the refusal: the message is out of the queue. The operator sees
    // the error on the row and marks again, or sends again.
    expect(queue.waiting()).toEqual([]);
    expect(await store.statusOf(message.id)).toBe("pending");
  });

  it("radio connected: a send goes through the outbox at once", async () => {
    const { store, radio, companion, queue, actions, compose } = await setUp({
      onSendText: deliveredReply,
    });
    await radio.connect("usb");
    const message = await compose("x");
    expect(await actions.send(message)).toBe("delivered");
    expect(companion.sends).toHaveLength(1);
    expect(queue.batches()).toEqual([]);
    expect(await store.statusOf(message.id)).toBe("delivered");
    await radio.disconnect();
  });

  it("during a live transmission (the ack awaited): the mark is refused and nothing written; after the ack, roger by hand is recorded", async () => {
    const { store, radio, transport, outbox, actions, compose } = await setUp({
      onSendText: sentOnlyReply,
      ackWindowMs: 2000,
    });
    await radio.connect("usb");
    const message = await compose("x");

    const sending = actions.send(message);
    await vi.waitFor(() => expect(outbox.active()?.phase).toBe("awaiting_ack"), { interval: 1 });
    await expect(actions.markByHand(message, "roger", "ringede")).rejects.toBeInstanceOf(
      OutboxError,
    );
    await expect(actions.markByHand(message, "given_up", "opgiv")).rejects.toBeInstanceOf(
      OutboxError,
    );
    expect(await chain(store, message)).toEqual(["sent"]);

    transport.push(ackFrame(FIRST_ACK, 700));
    expect(await sending).toBe("delivered");
    expect(outbox.transmitting(message.id)).toBe(false);
    const roger = await actions.markByHand(message, "roger", "Hans ringede");
    expect(roger.newStatus).toBe("roger");
    expect(await chain(store, message)).toEqual(["sent", "delivered", "roger"]);
    await radio.disconnect();
  });

  it("send by courier on a given-up message retried into the paused queue takes it out first", async () => {
    const { store, radio, companion, queue, actions, compose } = await setUp({
      onSendText: sentOnlyReply,
    });
    await radio.connect("usb");
    const message = await compose("Kør til nr 4");
    expect(await actions.send(message)).toBe("given_up");
    await radio.disconnect();

    // The queue screen's Retry on a given-up message with no radio: it waits, paused.
    queue.enqueue([message]);
    expect(queue.phase()).toBe("paused");
    expect(queue.isWaiting(message.id)).toBe(true);

    const { copy, point, closed } = await actions.resendByHand(message, {
      transport: "courier",
      body: "Kør til nr 4",
    });
    expect(copy.transport).toBe("courier");
    expect(point.refersTo).toBe(copy.id);
    expect(closed.newStatus).toBe("roger");
    expect(closed.text).toBe("sent via Courier");
    expect(queue.waiting()).toEqual([]);
    expect(await store.statusOf(message.id)).toBe("roger");

    await radio.connect("usb");
    await realWait(60);
    expect(companion.sends).toHaveLength(1);
    await radio.disconnect();
  });

  it("cancel: true when the queue or the outbox held the message, false otherwise", async () => {
    const { actions, compose } = await setUp();
    const message = await compose("x");
    expect(actions.cancel(message.id)).toBe(false);
    await actions.send(message);
    expect(actions.cancel(message.id)).toBe(true);
    expect(actions.cancel(message.id)).toBe(false);
  });
});
