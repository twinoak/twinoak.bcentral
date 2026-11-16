// Where a radio message is on its way out (P3-08): transmitting, waiting, or held by nobody,
// from what the outbox and the send queue hold.

import { describe, expect, it } from "vitest";
import type { ActiveSend } from "../radio/outbox.svelte.ts";
import { sendStateOf, type SendStateInput } from "./sendState.ts";

const A = "01JB8ZK3QX9V2M4N6P8R0T2W4A";
const B = "01JB8ZK3QX9V2M4N6P8R0T2W4B";

function active(messageId: string, phase: ActiveSend["phase"]): ActiveSend {
  return {
    messageId,
    seqNo: 1,
    attempt: 0,
    maxAttempts: 3,
    phase,
    expectedAck: null,
    deadlineMs: null,
  };
}

const NOBODY: SendStateInput = {
  active: null,
  outboxQueued: [],
  queueWaiting: [],
  queueSending: null,
};

describe("sendStateOf", () => {
  it("is null when neither the outbox nor the queue holds the message", () => {
    expect(sendStateOf(A, NOBODY)).toBeNull();
    expect(
      sendStateOf(A, { ...NOBODY, active: active(B, "awaiting_ack"), queueWaiting: [B] }),
    ).toBeNull();
  });

  it("is transmitting while the outbox's active send is sending or awaiting the ack", () => {
    expect(sendStateOf(A, { ...NOBODY, active: active(A, "sending") })).toBe("transmitting");
    expect(sendStateOf(A, { ...NOBODY, active: active(A, "awaiting_ack") })).toBe("transmitting");
  });

  it("is waiting while the outbox is preparing (nothing handed to the radio yet)", () => {
    expect(sendStateOf(A, { ...NOBODY, active: active(A, "preparing") })).toBe("waiting");
  });

  it("is waiting in the outbox's own queue, in the send queue, or handed to the outbox by the queue", () => {
    expect(sendStateOf(A, { ...NOBODY, outboxQueued: [B, A] })).toBe("waiting");
    expect(sendStateOf(A, { ...NOBODY, queueWaiting: [A] })).toBe("waiting");
    expect(sendStateOf(A, { ...NOBODY, queueSending: A })).toBe("waiting");
  });

  it("a live transmission wins over every other hold", () => {
    expect(
      sendStateOf(A, {
        active: active(A, "awaiting_ack"),
        outboxQueued: [A],
        queueWaiting: [A],
        queueSending: A,
      }),
    ).toBe("transmitting");
  });
});
