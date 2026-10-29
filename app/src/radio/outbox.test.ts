import { describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { openTestStore } from "../test-support/testStore.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import {
  EPOCH,
  EST_TIMEOUT_MS,
  FIRST_ACK,
  HANS_KEY,
  PETER_KEY,
  ackFrame,
  deliveredReply,
  errFrame,
  scriptedCompanion,
  sentFrame,
  sentOnlyReply,
  type SentText,
} from "../test-support/companionFrames.ts";
import { composeMessage } from "../store/outgoing.ts";
import type { JournalStore } from "../store/journalStore.ts";
import type { JournalEntry } from "../store/types.ts";
import { createRadioStore } from "./radioStore.svelte.ts";
import {
  ACK_WINDOW_MAX_MS,
  ACK_WINDOW_MIN_MS,
  OutboxError,
  ackWindowMs,
  createOutbox,
  type ActiveSend,
} from "./outbox.svelte.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const COMPANION_AHEAD_S = 100;
const SHORT_WINDOW_MS = 25;

setLanguage("en");

interface SetUpOptions {
  onSendText?: (sent: SentText, index: number) => Uint8Array[];
  maxAttempts?: number;
  ackWindowMs?: number;
}

async function setUp(options: SetUpOptions = {}) {
  let nowMs = EPOCH * 1000;
  let maxAttempts = options.maxAttempts ?? 3;
  const windowMs = options.ackWindowMs ?? SHORT_WINDOW_MS;
  const transport = new FakeTransport();
  // The companion's clock is ahead of the PC, so the offset is visible in the timestamps.
  const companion = scriptedCompanion({ time: EPOCH + COMPANION_AHEAD_S, onSendText: options.onSendText });
  transport.autoReply = companion.reply;
  const radio = createRadioStore({
    now: () => nowMs,
    blindAfterMs: () => 15 * 60_000,
    createTransport: () => transport,
  });
  const store = await openTestStore();
  const hans = await store.createRegisterEntry({ publicKey: HANS_KEY, label: "Hans", origin: "adhoc" });
  const peter = await store.createRegisterEntry({ publicKey: PETER_KEY, label: "Peter", origin: "adhoc" });
  const log: string[] = [];
  const outbox = createOutbox({
    store: async () => store,
    link: () => radio.link(),
    onPush: radio.onPush,
    now: () => nowMs,
    maxAttempts: () => maxAttempts,
    operator: () => "Thomas",
    ackWindow: () => windowMs,
    responseTimeoutMs: 200,
    log: (line) => log.push(line),
  });

  async function compose(body: string, counterpartyId = hans.id) {
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId,
      transport: "mesh",
      body,
    });
    return message;
  }

  return {
    store,
    radio,
    transport,
    companion,
    outbox,
    hans,
    peter,
    log,
    compose,
    advance(ms: number) {
      nowMs += ms;
    },
    setMaxAttempts(n: number) {
      maxAttempts = n;
    },
    nowSeconds: () => Math.floor(nowMs / 1000),
  };
}

// Everything referring to the message, oldest first: the status chain, with a resend's
// attempt text in brackets ("sent (attempt 2/3)"); anything that is not a status change is
// named by its type (there should be none since P1-01).
async function chain(store: JournalStore, message: JournalEntry): Promise<string[]> {
  const entries = await store.entriesReferringTo(message.id);
  return entries
    .sort((a, b) => a.deviceSeq - b.deviceSeq)
    .map((entry) => {
      if (entry.type !== "status_change") {
        return `${entry.type}: ${entry.text ?? ""}`;
      }
      const attempt = entry.newStatus === "sent" && entry.text !== undefined ? ` (${entry.text})` : "";
      return `${entry.newStatus ?? ""}${attempt}`;
    });
}

describe("ackWindowMs", () => {
  it("is the companion's estimate plus the margin, clamped to 5–20 s", () => {
    expect(ackWindowMs(0)).toBe(ACK_WINDOW_MIN_MS);
    expect(ackWindowMs(1500)).toBe(5000);
    expect(ackWindowMs(3000)).toBe(5000);
    expect(ackWindowMs(10000)).toBe(12000);
    expect(ackWindowMs(18000)).toBe(20000);
    expect(ackWindowMs(60000)).toBe(ACK_WINDOW_MAX_MS);
  });
});

describe("outbox", () => {
  it("send -> sent -> ack -> delivered, with the payload as the protocol says", async () => {
    const { store, radio, companion, outbox, compose, nowSeconds } = await setUp();
    await radio.connect("usb");
    const message = await compose("Meld status for Nørregade");

    const result = await outbox.send(message.id);

    expect(result).toBe("delivered");
    expect(await store.statusOf(message.id)).toBe("delivered");
    expect(await chain(store, message)).toEqual(["sent", "delivered"]);
    const delivered = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "delivered");
    expect(delivered?.text).toBe("round trip 800 ms");
    expect(delivered?.operator).toBe("Thomas");

    expect(companion.sends).toHaveLength(1);
    const sent = companion.sends[0];
    expect(sent?.txtType).toBe(0);
    expect(sent?.attempt).toBe(0);
    expect(sent?.keyPrefix).toBe(HANS_KEY.slice(0, 12));
    expect(sent?.text).toBe("#1 Meld status for Nørregade");
    expect(sent?.timestamp).toBe(nowSeconds() + COMPANION_AHEAD_S);
    expect(outbox.lastTimestamp()).toBe(sent?.timestamp);
    expect(outbox.active()).toBeNull();
    expect(outbox.queued()).toEqual([]);
    expect(outbox.revision()).toBe(2);
    await radio.disconnect();
  });

  it("no ack three times -> given_up; same timestamp, attempts 0, 1, 2; a `sent` with the attempt per resend", async () => {
    const { store, radio, companion, outbox, compose } = await setUp({ onSendText: sentOnlyReply });
    await radio.connect("usb");
    const message = await compose("Kør til Nørregade 4");

    const result = await outbox.send(message.id);

    expect(result).toBe("given_up");
    expect(await store.statusOf(message.id)).toBe("given_up");
    expect(companion.sends.map((s) => s.attempt)).toEqual([0, 1, 2]);
    const timestamps = new Set(companion.sends.map((s) => s.timestamp));
    expect(timestamps.size).toBe(1);
    expect(companion.sends.every((s) => s.text === "#1 Kør til Nørregade 4")).toBe(true);
    expect(await chain(store, message)).toEqual([
      "sent",
      "sent (attempt 2/3)",
      "sent (attempt 3/3)",
      "given_up",
    ]);
    const givenUp = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "given_up");
    expect(givenUp?.text).toBe("no ack after 3 attempts");
    // Still one message_out: resends are not new messages; and no note (P1-01).
    const all = await store.allEntries();
    expect(all.filter((e) => e.type === "message_out")).toHaveLength(1);
    expect(all.filter((e) => e.type === "note")).toHaveLength(0);
    expect(await store.statusOf(message.id)).toBe("given_up");
    await radio.disconnect();
  });

  it("RESP_CODE_ERR -> given_up at once, with the error code in the text", async () => {
    const { store, radio, companion, outbox, compose } = await setUp({ onSendText: () => [errFrame(6)] });
    await radio.connect("usb");
    const message = await compose("x");

    expect(await outbox.send(message.id)).toBe("given_up");
    expect(await chain(store, message)).toEqual(["given_up"]);
    const givenUp = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "given_up");
    expect(givenUp?.text).toBe("companion error 6");
    expect(companion.sends).toHaveLength(1);
    await radio.disconnect();
  });

  it("no answer to the command at all -> given_up with the failure", async () => {
    const { store, radio, outbox, compose } = await setUp({ onSendText: () => [] });
    await radio.connect("usb");
    const message = await compose("x");

    expect(await outbox.send(message.id)).toBe("given_up");
    const givenUp = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "given_up");
    expect(givenUp?.text).toMatch(/^send failed: no 0x06 within 200 ms$/);
    await radio.disconnect();
  });

  it("ignores an ack for another message and takes the matching one later", async () => {
    const { store, radio, transport, outbox, compose } = await setUp({
      onSendText: (sent, index) => [sentFrame(false, FIRST_ACK + index, EST_TIMEOUT_MS), ackFrame(0xdead, 50)],
    });
    await radio.connect("usb");
    const message = await compose("x");

    setTimeout(() => transport.push(ackFrame(FIRST_ACK, 1234)), 5);
    expect(await outbox.send(message.id)).toBe("delivered");
    const delivered = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "delivered");
    expect(delivered?.text).toBe("round trip 1234 ms");
    await radio.disconnect();
  });

  it("the attempt count comes from the setting", async () => {
    const { store, radio, companion, outbox, compose, setMaxAttempts } = await setUp({ onSendText: sentOnlyReply });
    await radio.connect("usb");
    setMaxAttempts(2);
    const message = await compose("x");

    expect(await outbox.send(message.id)).toBe("given_up");
    expect(companion.sends.map((s) => s.attempt)).toEqual([0, 1]);
    expect(await chain(store, message)).toEqual(["sent", "sent (attempt 2/2)", "given_up"]);

    setMaxAttempts(1);
    const second = await compose("y");
    expect(await outbox.send(second.id)).toBe("given_up");
    expect(await chain(store, second)).toEqual(["sent", "given_up"]);
    await radio.disconnect();
  });

  it("manual retry from given_up: same seqNo and message_out, fresh timestamp, attempts from 0", async () => {
    const { store, radio, companion, outbox, compose, advance } = await setUp({ onSendText: sentOnlyReply, maxAttempts: 1 });
    await radio.connect("usb");
    const message = await compose("Kør til nr 4");
    expect(await outbox.send(message.id)).toBe("given_up");
    const first = companion.sends[0]?.timestamp ?? 0;

    advance(30_000);
    companion.onSendText = deliveredReply;
    expect(await outbox.send(message.id)).toBe("delivered");

    expect(companion.sends).toHaveLength(2);
    expect(companion.sends.map((s) => s.attempt)).toEqual([0, 0]);
    expect(companion.sends[1]?.timestamp).toBe(first + 30);
    expect(companion.sends[1]?.text).toBe("#1 Kør til nr 4");
    expect((await store.allEntries()).filter((e) => e.type === "message_out")).toHaveLength(1);
    expect(await chain(store, message)).toEqual(["sent", "given_up", "sent", "delivered"]);
    await radio.disconnect();
  });

  it("one send at a time: the second waits for the first's terminal state", async () => {
    const { store, radio, companion, outbox, compose, hans, peter } = await setUp({
      onSendText: (sent, index) => (index < 2 ? sentOnlyReply(sent, index) : deliveredReply(sent, index)),
      maxAttempts: 2,
      ackWindowMs: 150,
    });
    await radio.connect("usb");
    const toHans = await compose("til Hans", hans.id);
    const toPeter = await compose("til Peter", peter.id);

    const first = outbox.send(toHans.id);
    await vi.waitFor(() => expect(outbox.active()?.messageId).toBe(toHans.id), { interval: 1 });
    const second = outbox.send(toPeter.id);
    await vi.waitFor(() => expect(outbox.queued()).toEqual([toPeter.id]), { interval: 1 });
    expect(outbox.active()?.messageId).toBe(toHans.id);
    expect(await first).toBe("given_up");
    expect(await second).toBe("delivered");

    expect(companion.sends.map((s) => [s.text, s.attempt])).toEqual([
      ["#1 til Hans", 0],
      ["#1 til Hans", 1],
      ["#1 til Peter", 0],
    ]);
    expect(companion.sends[2]?.keyPrefix).toBe(PETER_KEY.slice(0, 12));
    expect(await store.statusOf(toHans.id)).toBe("given_up");
    expect(await store.statusOf(toPeter.id)).toBe("delivered");
    expect(outbox.queued()).toEqual([]);
    await radio.disconnect();
  });

  it("timestamps never go backwards: same second and a PC clock stepping back", async () => {
    const { radio, companion, outbox, compose, advance, nowSeconds } = await setUp();
    await radio.connect("usb");
    const a = await compose("a");
    const b = await compose("b");
    const c = await compose("c");

    await outbox.send(a.id);
    await outbox.send(b.id);
    advance(-10_000);
    await outbox.send(c.id);

    const stamps = companion.sends.map((s) => s.timestamp);
    expect(stamps[0]).toBe(nowSeconds() + 10 + COMPANION_AHEAD_S);
    expect(stamps[1]).toBe((stamps[0] ?? 0) + 1);
    expect(stamps[2]).toBe((stamps[1] ?? 0) + 1);
    // The clock offset was read once, from CMD_GET_DEVICE_TIME, on the first send.
    expect(outbox.lastTimestamp()).toBe(stamps[2]);
    await radio.disconnect();
  });

  it("no radio -> given_up saying so", async () => {
    const { store, outbox, compose } = await setUp();
    const message = await compose("x");
    expect(await outbox.send(message.id)).toBe("given_up");
    const givenUp = (await store.entriesReferringTo(message.id)).find((e) => e.newStatus === "given_up");
    expect(givenUp?.text).toBe("no radio connected");
  });

  it("refuses what it cannot send: unknown id, non-mesh, wrong status, already queued", async () => {
    const { store, radio, outbox, compose, hans } = await setUp({ onSendText: sentOnlyReply, maxAttempts: 1 });
    await radio.connect("usb");

    await expect(outbox.send("01JB8ZK3QX9V2M4N6P8R0T2W99")).rejects.toBeInstanceOf(OutboxError);

    const courier = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: hans.id,
      transport: "courier",
      body: "med bud",
    });
    await expect(outbox.send(courier.message.id)).rejects.toBeInstanceOf(OutboxError);

    const note = await store.appendEntry({ incidentId: INCIDENT, operator: "Thomas", type: "note", text: "n" });
    await expect(outbox.send(note.id)).rejects.toBeInstanceOf(OutboxError);

    const message = await compose("x");
    const sending = outbox.send(message.id);
    await expect(outbox.send(message.id)).rejects.toBeInstanceOf(OutboxError);
    await sending;

    // Now sent (no ack, one attempt) -> given_up: may be retried. Delivered may not.
    expect(await store.statusOf(message.id)).toBe("given_up");
    await store.appendEntry({
      incidentId: INCIDENT,
      operator: "Thomas",
      type: "status_change",
      refersTo: message.id,
      newStatus: "delivered",
    });
    await expect(outbox.send(message.id)).rejects.toBeInstanceOf(OutboxError);
    await radio.disconnect();
  });

  it("exposes what is in flight while waiting for the ack", async () => {
    const { radio, outbox, compose } = await setUp({ onSendText: sentOnlyReply, maxAttempts: 1, ackWindowMs: 300 });
    await radio.connect("usb");
    const message = await compose("x");

    const sending = outbox.send(message.id);
    const seen: { active: ActiveSend | null } = { active: null };
    await vi.waitFor(
      () => {
        const active = outbox.active();
        if (active?.phase === "awaiting_ack") {
          seen.active = active;
        }
        expect(seen.active).not.toBeNull();
      },
      { interval: 1, timeout: 2000 },
    );
    const inFlight = seen.active;
    expect(inFlight?.messageId).toBe(message.id);
    expect(inFlight?.seqNo).toBe(1);
    expect(inFlight?.attempt).toBe(0);
    expect(inFlight?.maxAttempts).toBe(1);
    expect(inFlight?.expectedAck).toBe(FIRST_ACK);
    expect(inFlight?.deadlineMs).toBe(EPOCH * 1000 + 300);
    await sending;
    expect(outbox.active()).toBeNull();
    await radio.disconnect();
  });
});
