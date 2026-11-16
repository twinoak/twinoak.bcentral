// The action set of an open row (P3-04), one case per row kind: a mesh message, a message by
// hand, an incoming message, a note, a send-to-all row — and the rows that offer nothing.
// Since P3-08 a radio message's Mark is hidden by a live transmission only: a message
// waiting in a queue (paused or not) offers Mark and Correct, never Retry.

import { describe, expect, it } from "vitest";
import { batchActions, entryActions, messageActions, pointAction } from "./rowActions.ts";

describe("message_out over the radio", () => {
  it("given up: Retry, Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "given_up", canRetry: true, sendState: null }),
    ).toEqual(["retry", "mark", "correct"]);
  });

  it("delivered, the receipt in: Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "delivered", canRetry: false, sendState: null }),
    ).toEqual(["mark", "correct"]);
  });

  it("confirmed: Correct only (roger is final)", () => {
    expect(
      messageActions({ transport: "mesh", status: "roger", canRetry: false, sendState: null }),
    ).toEqual(["correct"]);
  });

  it("transmitting (the radio has the payload, the ack is awaited): Correct only", () => {
    expect(
      messageActions({
        transport: "mesh",
        status: "sent",
        canRetry: false,
        sendState: "transmitting",
      }),
    ).toEqual(["correct"]);
    // Even a status the page would retry: nothing while it is on the air.
    expect(
      messageActions({
        transport: "mesh",
        status: "given_up",
        canRetry: true,
        sendState: "transmitting",
      }),
    ).toEqual(["correct"]);
  });

  it("waiting in a queue (also paused for lack of a radio): Mark, Correct — no Retry, no Send (P3-08)", () => {
    expect(
      messageActions({
        transport: "mesh",
        status: "pending",
        canRetry: true,
        sendState: "waiting",
      }),
    ).toEqual(["mark", "correct"]);
    // A given-up message retried into the queue: the same.
    expect(
      messageActions({
        transport: "mesh",
        status: "given_up",
        canRetry: true,
        sendState: "waiting",
      }),
    ).toEqual(["mark", "correct"]);
    // Confirmed stays final whatever holds it.
    expect(
      messageActions({ transport: "mesh", status: "roger", canRetry: false, sendState: "waiting" }),
    ).toEqual(["correct"]);
  });

  it("never sent and nobody sending it: Send, Mark, Correct", () => {
    expect(
      messageActions({ transport: "mesh", status: "pending", canRetry: true, sendState: null }),
    ).toEqual(["send", "mark", "correct"]);
  });
});

describe("message_out by hand (P3-07: a plain record, no status chain)", () => {
  it("a courier, phone or verbal message: Correct only — never Retry, never Mark", () => {
    for (const transport of ["courier", "phone", "verbal"] as const) {
      expect(messageActions({ transport, status: null, canRetry: false, sendState: null })).toEqual(
        ["correct"],
      );
    }
    // Even an inconsistent input (a status on a non-mesh transport, or none on the radio)
    // never offers Mark: the chain is the radio's and a null is nothing to mark.
    expect(
      messageActions({ transport: "courier", status: "sent", canRetry: false, sendState: null }),
    ).toEqual(["correct"]);
    expect(
      messageActions({ transport: "mesh", status: null, canRetry: false, sendState: null }),
    ).toEqual(["correct"]);
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

describe("the point action of a row (P3-05)", () => {
  it("Open point while the entry has no point, Close point while it is open, Reopen point once closed", () => {
    expect(pointAction(undefined)).toBe("openPoint");
    expect(pointAction("open")).toBe("closePoint");
    expect(pointAction("closed")).toBe("reopenPoint");
  });
});
