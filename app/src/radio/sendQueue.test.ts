import { describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { openTestStore } from "../test-support/testStore.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import {
  EPOCH,
  deliveredReply,
  scriptedCompanion,
  sentOnlyReply,
  type SentText,
} from "../test-support/companionFrames.ts";
import { composeBatch, composeMessage } from "../store/outgoing.ts";
import type { JournalStore } from "../store/journalStore.ts";
import type { JournalEntry, RegisterEntry } from "../store/types.ts";
import { createOutbox, type Outbox } from "./outbox.svelte.ts";
import { createRadioStore, type RadioStore } from "./radioStore.svelte.ts";
import { SendQueueError, createSendQueue, type Batch } from "./sendQueue.svelte.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const GAP_MS = 40;
const ACK_WINDOW_MS = 25;
const DRAIN_TIMEOUT = { timeout: 15_000, interval: 5 };

setLanguage("en");

// 25 distinct keys: "10" * 32, "11" * 32, ...
function keyOf(index: number): string {
  return (index + 0x10).toString(16).padStart(2, "0").repeat(32);
}

interface SetUpOptions {
  recipients?: number;
  onSendText?: (sent: SentText, index: number) => Uint8Array[];
  gapMs?: number;
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
  const register: RegisterEntry[] = [];
  for (let i = 0; i < (options.recipients ?? 25); i++) {
    register.push(
      await store.createRegisterEntry({
        publicKey: keyOf(i),
        label: `radio #${i + 1}`,
        origin: "adhoc",
      }),
    );
  }
  const log: string[] = [];
  const gapMs = options.gapMs ?? GAP_MS;

  function makeOutbox(): Outbox {
    return createOutbox({
      store: async () => store,
      link: () => radio.link(),
      onPush: radio.onPush,
      now: () => Date.now(),
      maxAttempts: () => options.maxAttempts ?? 1,
      operator: () => "Thomas",
      ackWindow: () => ACK_WINDOW_MS,
      responseTimeoutMs: 200,
      log: (line) => log.push(`outbox: ${line}`),
    });
  }

  function makeQueue(outbox: Outbox) {
    return createSendQueue({
      store: async () => store,
      outbox,
      now: () => Date.now(),
      gapMs: () => gapMs,
      radioState: () => radio.state(),
      onConnected: radio.onConnected,
      log: (line) => log.push(`queue: ${line}`),
    });
  }

  const outbox = makeOutbox();
  const queue = makeQueue(outbox);

  async function batch(
    body = "Meld status",
    ids = register.map((entry) => entry.id),
  ): Promise<JournalEntry[]> {
    const composed = await composeBatch(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyIds: ids,
      body,
    });
    return composed.map((c) => c.message);
  }

  return {
    store,
    radio,
    transport,
    companion,
    outbox,
    queue,
    register,
    log,
    batch,
    makeOutbox,
    makeQueue,
  };
}

async function messageOuts(store: JournalStore): Promise<JournalEntry[]> {
  return (await store.allEntries()).filter((entry) => entry.type === "message_out");
}

async function statuses(store: JournalStore, messages: readonly JournalEntry[]): Promise<string[]> {
  const result: string[] = [];
  for (const message of messages) {
    result.push(await store.statusOf(message.id));
  }
  return result;
}

async function untilIdle(queue: { phase(): string }): Promise<void> {
  await vi.waitFor(() => expect(queue.phase()).toBe("idle"), DRAIN_TIMEOUT);
}

async function realWait(ms: number): Promise<void> {
  const start = Date.now();
  await vi.waitFor(() => expect(Date.now() - start).toBeGreaterThanOrEqual(ms), {
    timeout: ms + 1000,
    interval: 2,
  });
}

async function connectedRadio(radio: RadioStore): Promise<void> {
  await radio.connect("usb");
  expect(radio.state()).toBe("connected");
}

describe("send queue (send to all, P0-08)", () => {
  it("25 recipients: every message_out exists before the first transmission, transmissions keep the gap, each receipt lands on its own recipient", async () => {
    const sendTimes: number[] = [];
    const { store, radio, companion, queue, register, batch } = await setUp({
      onSendText: (sent, index) => {
        sendTimes.push(Date.now());
        // Recipient 8 (index 7) never acks.
        return index === 7 ? sentOnlyReply(sent, index) : deliveredReply(sent, index);
      },
    });
    await connectedRadio(radio);

    const messages = await batch();
    expect(messages).toHaveLength(25);
    expect(messages.map((m) => m.seqNo)).toEqual(new Array<number>(25).fill(1));
    // All stored, none transmitted, before the queue sees them.
    expect(await messageOuts(store)).toHaveLength(25);
    expect(await statuses(store, messages)).toEqual(new Array<string>(25).fill("pending"));
    expect(companion.sends).toHaveLength(0);

    const [created] = queue.enqueue(messages) as [Batch];
    expect(created.items.map((item) => item.counterpartyId)).toEqual(
      register.map((entry) => entry.id),
    );
    expect(created.restored).toBe(false);
    // The batch is the messages' own batchId, not an id of the queue's (P1-01).
    expect(created.id).toBe(messages[0]?.batchId);
    expect(queue.batches()).toEqual([created]);
    expect(queue.waiting().length + (queue.sending() === null ? 0 : 1)).toBe(25);

    await untilIdle(queue);

    expect(companion.sends).toHaveLength(25);
    expect(companion.sends.map((s) => s.keyPrefix)).toEqual(
      register.map((entry) => entry.publicKey.slice(0, 12)),
    );
    expect(companion.sends.every((s) => s.text === "#1 Meld status")).toBe(true);
    const expected = messages.map((_, i) => (i === 7 ? "given_up" : "delivered"));
    expect(await statuses(store, messages)).toEqual(expected);
    for (let i = 1; i < sendTimes.length; i++) {
      expect((sendTimes[i] ?? 0) - (sendTimes[i - 1] ?? 0)).toBeGreaterThanOrEqual(GAP_MS);
    }
    expect(await messageOuts(store)).toHaveLength(25);
    expect(queue.waiting()).toEqual([]);
    expect(queue.sending()).toBeNull();
    expect(queue.errors().size).toBe(0);
    await radio.disconnect();
  });

  it("counts down to the next transmission during the gap", async () => {
    const { radio, queue, batch } = await setUp({ recipients: 2, gapMs: 400 });
    await connectedRadio(radio);
    const messages = await batch();
    queue.enqueue(messages);

    await vi.waitFor(() => expect(queue.phase()).toBe("gap"), DRAIN_TIMEOUT);
    const at = queue.nextTransmissionAt();
    expect(at).not.toBeNull();
    const first = queue.countdownMs();
    expect(first).not.toBeNull();
    expect(first ?? 0).toBeGreaterThan(0);
    expect(first ?? 0).toBeLessThanOrEqual(400);
    // The second message waits for the gap: its earliest start is the countdown itself
    // (read a moment later, so at most a few ms less).
    const earliest = queue.earliestStartMs(messages[1]?.id ?? "") ?? 0;
    expect(earliest).toBeGreaterThan(0);
    expect(earliest).toBeLessThanOrEqual(first ?? 0);
    expect((first ?? 0) - earliest).toBeLessThan(20);
    expect(queue.drainEstimateMs()).toBe(queue.earliestStartMs(messages[1]?.id ?? ""));

    await realWait(50);
    const second = queue.countdownMs();
    expect(second).not.toBeNull();
    expect(second ?? 0).toBeLessThan(first ?? 0);
    expect(queue.nextTransmissionAt()).toBe(at);

    await untilIdle(queue);
    expect(queue.countdownMs()).toBeNull();
    expect(queue.nextTransmissionAt()).toBeNull();
    expect(queue.drainEstimateMs()).toBe(0);
    await radio.disconnect();
  });

  it("reload mid-queue: the remaining pending ones are queued again, none is sent twice", async () => {
    const { store, radio, companion, queue, register, batch, makeOutbox, makeQueue } = await setUp({
      gapMs: 20,
    });
    await connectedRadio(radio);
    const messages = await batch();
    queue.enqueue(messages);

    await vi.waitFor(() => expect(companion.sends.length).toBeGreaterThanOrEqual(5), DRAIN_TIMEOUT);
    // The tab closes: the loop ends, what was waiting is forgotten (it is still pending in
    // the store), the message in flight finishes.
    queue.stop();
    await untilIdle(queue);
    const sentBeforeReload = companion.sends.length;
    expect(sentBeforeReload).toBeGreaterThanOrEqual(5);
    expect(sentBeforeReload).toBeLessThan(25);
    expect(queue.waiting()).toEqual([]);
    expect(() => queue.enqueue(messages.slice(0, 1))).toThrow(SendQueueError);

    // A fresh app: a new outbox and queue over the same store.
    const restoredQueue = makeQueue(makeOutbox());
    const [restored] = await restoredQueue.requeuePending(INCIDENT);
    expect(restored).toBeDefined();
    expect(restored?.restored).toBe(true);
    // Under the batch's own id, so the grouping survived the reload.
    expect(restored?.id).toBe(messages[0]?.batchId);
    expect(restoredQueue.batches()).toHaveLength(1);
    expect(restored?.items).toHaveLength(25 - sentBeforeReload);
    // In the original order: the first pending one is the first not yet sent.
    expect(restored?.items.map((item) => item.counterpartyId)).toEqual(
      register.slice(sentBeforeReload).map((entry) => entry.id),
    );
    await untilIdle(restoredQueue);

    expect(companion.sends).toHaveLength(25);
    expect(new Set(companion.sends.map((s) => s.keyPrefix)).size).toBe(25);
    expect(await statuses(store, messages)).toEqual(new Array<string>(25).fill("delivered"));
    // One message_out per recipient per batch, #1 for every one of them.
    const outs = await messageOuts(store);
    expect(outs).toHaveLength(25);
    expect(outs.every((entry) => entry.seqNo === 1)).toBe(true);
    expect(new Set(outs.map((entry) => entry.counterpartyId)).size).toBe(25);
    // Nothing left to restore.
    expect(await restoredQueue.requeuePending(INCIDENT)).toEqual([]);
    restoredQueue.stop();
    await radio.disconnect();
  });

  it("after a reload, pending messages of two batches and a single send come back as three batches by batchId", async () => {
    const { store, queue, register, batch } = await setUp({ recipients: 4, gapMs: 1000 });
    const first = await batch("first", [register[0]?.id ?? "", register[1]?.id ?? ""]);
    const second = await batch("second", [register[2]?.id ?? "", register[3]?.id ?? ""]);
    const single = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: register[0]?.id ?? "",
      transport: "mesh",
      body: "alone",
    });
    expect(single.message.batchId).toBeUndefined();

    const restored = await queue.requeuePending(INCIDENT);
    expect(restored.map((b) => b.id)).toEqual([
      first[0]?.batchId,
      second[0]?.batchId,
      single.message.id,
    ]);
    expect(restored.map((b) => b.items.map((item) => item.messageId))).toEqual([
      first.map((m) => m.id),
      second.map((m) => m.id),
      [single.message.id],
    ]);
    expect(restored.every((b) => b.restored)).toBe(true);
    // Newest batch first on the screen; the waiting order is the storage order.
    expect(queue.batches().map((b) => b.id)).toEqual([...restored.map((b) => b.id)].reverse());
    expect(queue.waiting()).toEqual([...first, ...second, single.message].map((m) => m.id));
    queue.stop();
  });

  it("requeuePending never mixes a drill and a real incident: each gets its own pending messages only (P1-05)", async () => {
    const { store, queue, register } = await setUp({ recipients: 2, gapMs: 1000 });
    const real = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const drill = await store.createIncident({ name: "Øvelse", createdBy: "Thomas", drill: true });
    const ids = register.map((entry) => entry.id);
    const realBatch = (
      await composeBatch(store, {
        incidentId: real.id,
        operator: "Thomas",
        counterpartyIds: ids,
        body: "rigtig",
      })
    ).map((c) => c.message);
    const drillBatch = (
      await composeBatch(store, {
        incidentId: drill.id,
        operator: "Thomas",
        counterpartyIds: ids,
        body: "øvelse",
      })
    ).map((c) => c.message);
    expect(realBatch.map((m) => m.text)).toEqual(["#1 rigtig", "#1 rigtig"]);
    expect(drillBatch.map((m) => m.text)).toEqual(["ØVELSE #2 øvelse", "ØVELSE #2 øvelse"]);

    // The real incident is current after a reload: only its messages come back.
    const restoredReal = await queue.requeuePending(real.id);
    expect(restoredReal.map((b) => b.id)).toEqual([realBatch[0]?.batchId]);
    expect(restoredReal.flatMap((b) => b.items.map((item) => item.text))).toEqual([
      "#1 rigtig",
      "#1 rigtig",
    ]);
    expect(queue.waiting()).toEqual(realBatch.map((m) => m.id));

    // Then the drill is picked: its own messages, under its own batch, nothing of the real one twice.
    const restoredDrill = await queue.requeuePending(drill.id);
    expect(restoredDrill.map((b) => b.id)).toEqual([drillBatch[0]?.batchId]);
    expect(restoredDrill.flatMap((b) => b.items.map((item) => item.incidentId))).toEqual([
      drill.id,
      drill.id,
    ]);
    expect(restoredDrill.flatMap((b) => b.items.map((item) => item.text))).toEqual([
      "ØVELSE #2 øvelse",
      "ØVELSE #2 øvelse",
    ]);
    expect(queue.waiting()).toEqual([...realBatch, ...drillBatch].map((m) => m.id));
    queue.stop();
  });

  it("requeuePending skips what is not pending, not mesh, or already held", async () => {
    const { store, radio, queue, register, batch } = await setUp({ recipients: 4, gapMs: 1000 });
    const messages = await batch();
    const delivered = messages[0] as JournalEntry;
    await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "status_change",
      refersTo: delivered.id,
      newStatus: "sent",
    });
    await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "status_change",
      refersTo: delivered.id,
      newStatus: "delivered",
    });
    const givenUp = messages[1] as JournalEntry;
    await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "status_change",
      refersTo: givenUp.id,
      newStatus: "given_up",
    });
    await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: register[0]?.id ?? "",
      transport: "courier",
      body: "med bud",
    });
    // Already held (paused: no radio), so not restored a second time; the straggler of the
    // same batch joins its batch instead of making a new one.
    queue.enqueue([messages[2] as JournalEntry]);
    expect(queue.phase()).toBe("paused");

    const [restored] = await queue.requeuePending(INCIDENT);
    expect(restored?.id).toBe(messages[0]?.batchId);
    expect(restored?.items.map((item) => item.messageId)).toEqual([
      messages[2]?.id,
      messages[3]?.id,
    ]);
    expect(queue.batches()).toHaveLength(1);
    expect(queue.waiting()).toEqual([messages[2]?.id, messages[3]?.id]);
    queue.stop();
    await radio.disconnect();
  });

  it("pauses while no radio is connected and goes on when one connects, also after a disconnect mid-batch", async () => {
    const { radio, companion, queue, batch } = await setUp({ recipients: 5, gapMs: 30 });
    const messages = await batch();

    queue.enqueue(messages);
    expect(queue.phase()).toBe("paused");
    expect(queue.waiting()).toHaveLength(5);
    expect(queue.earliestStartMs(messages[0]?.id ?? "")).toBeNull();
    expect(queue.drainEstimateMs()).toBeNull();
    await realWait(60);
    expect(companion.sends).toHaveLength(0);
    expect(queue.phase()).toBe("paused");

    await connectedRadio(radio);
    await vi.waitFor(() => expect(companion.sends.length).toBeGreaterThanOrEqual(2), DRAIN_TIMEOUT);
    await radio.disconnect();
    await vi.waitFor(() => expect(queue.phase()).toBe("paused"), DRAIN_TIMEOUT);
    const sentBeforeDisconnect = companion.sends.length;
    await realWait(100);
    expect(companion.sends).toHaveLength(sentBeforeDisconnect);

    await connectedRadio(radio);
    await untilIdle(queue);
    expect(companion.sends).toHaveLength(5);
    expect(new Set(companion.sends.map((s) => s.keyPrefix)).size).toBe(5);
    expect(queue.errors().size).toBe(0);
    await radio.disconnect();
  });

  it("retries given-up messages from the queue, one or all, without a new message_out", async () => {
    const { store, radio, companion, queue, batch } = await setUp({
      recipients: 4,
      gapMs: 10,
      onSendText: (sent, index) =>
        index === 1 || index === 2 ? sentOnlyReply(sent, index) : deliveredReply(sent, index),
    });
    await connectedRadio(radio);
    const messages = await batch();
    const [created] = queue.enqueue(messages) as [Batch];
    await untilIdle(queue);
    expect(await statuses(store, messages)).toEqual([
      "delivered",
      "given_up",
      "given_up",
      "delivered",
    ]);

    companion.onSendText = deliveredReply;
    const givenUp = [messages[1] as JournalEntry, messages[2] as JournalEntry];
    queue.retry([givenUp[0]?.id ?? ""]);
    await untilIdle(queue);
    expect(await store.statusOf(givenUp[0]?.id ?? "")).toBe("delivered");
    expect(await store.statusOf(givenUp[1]?.id ?? "")).toBe("given_up");

    queue.retry([givenUp[1]?.id ?? ""]);
    await untilIdle(queue);
    expect(await statuses(store, messages)).toEqual([
      "delivered",
      "delivered",
      "delivered",
      "delivered",
    ]);
    expect(companion.sends).toHaveLength(6);
    expect(await messageOuts(store)).toHaveLength(4);
    // The rows stay in their batch; no batch was added by a retry.
    expect(queue.batches()).toEqual([created]);
    await radio.disconnect();
  });

  it("refuses what it cannot queue: not mesh, already queued, unknown to retry", async () => {
    const { store, radio, queue, register, batch } = await setUp({ recipients: 2, gapMs: 1000 });
    const courier = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: register[0]?.id ?? "",
      transport: "courier",
      body: "med bud",
    });
    expect(() => queue.enqueue([courier.message])).toThrow(SendQueueError);
    expect(() => queue.enqueue([])).toThrow(SendQueueError);
    const note = await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "note",
      text: "n",
    });
    expect(() => queue.enqueue([note])).toThrow(SendQueueError);

    const messages = await batch();
    queue.enqueue(messages);
    expect(() => queue.enqueue([messages[0] as JournalEntry])).toThrow(SendQueueError);
    expect(() => queue.retry([messages[1]?.id ?? ""])).toThrow(SendQueueError);
    expect(() => queue.retry([note.id])).toThrow(SendQueueError);
    expect(queue.batches()).toHaveLength(1);
    expect(queue.waiting()).toHaveLength(2);
    queue.stop();
    await radio.disconnect();
  });

  it("a message the outbox refuses is recorded and the queue carries on", async () => {
    const { store, radio, companion, queue, batch } = await setUp({ recipients: 3, gapMs: 60 });
    await connectedRadio(radio);
    const messages = await batch();
    queue.enqueue(messages);
    // The operator records a roger by hand on the second one before its turn.
    await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "status_change",
      refersTo: messages[1]?.id ?? "",
      newStatus: "roger",
      text: "rang",
    });
    await untilIdle(queue);

    expect(companion.sends).toHaveLength(2);
    expect(await statuses(store, messages)).toEqual(["delivered", "roger", "delivered"]);
    expect(queue.errors().get(messages[1]?.id ?? "")).toMatch(/^The message is roger/);
    expect(queue.errors().size).toBe(1);
    await radio.disconnect();
  });
});
