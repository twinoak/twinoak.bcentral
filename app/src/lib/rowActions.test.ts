// The action set of an open row (P3-04), one case per row kind: a mesh message, a message by
// hand, an incoming message, a note, a send-to-all row — and the rows that offer nothing.

import { describe, expect, it } from "vitest";
import { batchActions, entryActions, messageActions } from "./rowActions.ts";

describe("message_out over the radio", () => {
  it("given up: Retry, Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "given_up", canRetry: true, inflight: false }),
    ).toEqual(["retry", "mark", "correct"]);
  });

  it("delivered, the receipt in: Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "delivered", canRetry: false, inflight: false }),
    ).toEqual(["mark", "correct"]);
  });

  it("confirmed: Correct only (roger is final)", () => {
    expect(
      messageActions({ transport: "mesh", status: "roger", canRetry: false, inflight: false }),
    ).toEqual(["correct"]);
  });

  it("while the outbox holds it: Correct only", () => {
    expect(
      messageActions({ transport: "mesh", status: "sent", canRetry: false, inflight: true }),
    ).toEqual(["correct"]);
  });

  it("never sent and nobody sending it: Send, Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "pending", canRetry: true, inflight: false }),
    ).toEqual(["send", "mark", "correct"]);
  });
});

describe("message_out by hand", () => {
  it("a courier message: Mark, Correct — never Retry", () => {
    expect(
      messageActions({ transport: "courier", status: "sent", canRetry: false, inflight: false }),
    ).toEqual(["mark", "correct"]);
    expect(
      messageActions({ transport: "phone", status: "delivered", canRetry: false, inflight: false }),
    ).toEqual(["mark", "correct"]);
  });
});

describe("the other rows", () => {
  it("message_in: Reply, Correct", () => {
    expect(entryActions("message_in")).toEqual(["reply", "correct"]);
  });

  it("note: Correct", () => {
    expect(entryActions("note")).toEqual(["correct"]);
  });

  it("the incident's own status and an orphan correction: nothing", () => {
    expect(entryActions("status_change")).toEqual([]);
    expect(entryActions("correction")).toEqual([]);
  });

  it("a send-to-all row: Retry all given up, only when any can be retried", () => {
    expect(batchActions(2)).toEqual(["retryAll"]);
    expect(batchActions(0)).toEqual([]);
  });
});
