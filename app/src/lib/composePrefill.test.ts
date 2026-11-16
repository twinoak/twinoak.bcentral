// Which tab an action opens, and with what (P3-01): Reply on a mesh incoming → MeshCore with
// the sender; Reply on a courier (phone, verbal) incoming → New record as an outgoing
// message on the same transport to the sender; "send by courier" on a given-up message →
// New record as a courier message with the original's body, closing it.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import type { JournalEntry } from "../store/types.ts";
import { PrefillError, courierPrefill, replyPrefill } from "./composePrefill.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const DEVICE = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";

function entry(fields: Partial<JournalEntry> & Pick<JournalEntry, "type">): JournalEntry {
  return {
    id: "01JB8ZK3QX9V2M4N6P8R0T2X10",
    incidentId: INCIDENT,
    deviceId: DEVICE,
    deviceSeq: 99,
    timestamp: "2026-10-28T19:30:00Z",
    clockTrust: "manual",
    operator: "Thomas",
    ...fields,
  };
}

describe("Reply from the row", () => {
  it("a mesh incoming opens MeshCore with the sender as recipient and the entry as the reply target", () => {
    const incoming = loadWalkthrough().entries.find(
      (candidate) => candidate.type === "message_in" && candidate.transport === "mesh",
    )!;
    expect(replyPrefill(incoming)).toEqual({
      tab: "meshcore",
      counterpartyId: HANS,
      replyTo: incoming,
    });
  });

  it("a courier incoming opens New record as an outgoing courier message to the sender, nothing closed", () => {
    const incoming = entry({
      type: "message_in",
      transport: "courier",
      counterpartyId: HANS,
      text: "Kælderen er tør",
    });
    expect(replyPrefill(incoming)).toEqual({
      tab: "record",
      type: "message_out",
      transport: "courier",
      counterpartyId: HANS,
      text: "",
      replyTo: incoming,
      closes: null,
    });
  });

  it("a phone and a verbal incoming keep their transport", () => {
    for (const transport of ["phone", "verbal"] as const) {
      const incoming = entry({ type: "message_in", transport, counterpartyId: HANS, text: "x" });
      expect(replyPrefill(incoming)).toMatchObject({ tab: "record", transport });
    }
  });

  it("refuses anything but an incoming message", () => {
    expect(() => replyPrefill(entry({ type: "note", text: "x" }))).toThrow(PrefillError);
    expect(() =>
      replyPrefill(
        entry({
          type: "message_out",
          transport: "mesh",
          counterpartyId: HANS,
          seqNo: 1,
          text: "#1 x",
        }),
      ),
    ).toThrow(PrefillError);
  });
});

describe("send by courier", () => {
  it("opens New record as a courier message to the recipient with the original's body, closing it", () => {
    const original = entry({
      type: "message_out",
      transport: "mesh",
      counterpartyId: HANS,
      seqNo: 3,
      text: "#3 Kør til nr 4",
    });
    expect(courierPrefill(original)).toEqual({
      tab: "record",
      type: "message_out",
      transport: "courier",
      counterpartyId: HANS,
      text: "Kør til nr 4",
      replyTo: null,
      closes: original,
    });
  });

  it("strips the ØVELSE prefix with the number in a drill", () => {
    const original = entry({
      type: "message_out",
      transport: "mesh",
      counterpartyId: HANS,
      seqNo: 12,
      text: "ØVELSE #12 Meld status",
    });
    expect(courierPrefill(original).text).toBe("Meld status");
  });

  it("refuses anything but an outgoing message", () => {
    expect(() =>
      courierPrefill(
        entry({ type: "message_in", transport: "mesh", counterpartyId: HANS, text: "x" }),
      ),
    ).toThrow(PrefillError);
  });
});
