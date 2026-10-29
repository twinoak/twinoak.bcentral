import { describe, expect, it } from "vitest";
import { dedupeInput, dedupeKey, PUBLIC_KEY_PATTERN } from "./dedupeKey.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";

const KEY = "7a".repeat(32);

function epochSeconds(timestamp: string): number {
  return Math.floor(Date.parse(timestamp) / 1000);
}

describe("dedupeKey", () => {
  it("hashes '<sender key>:<epoch seconds>:<text>' with nothing added or removed", () => {
    expect(dedupeInput(KEY, 1793214220, "R1")).toBe(`${KEY}:1793214220:R1`);
    expect(dedupeInput(KEY, 0, "")).toBe(`${KEY}:0:`);
  });

  it("reproduces the keys in contract/examples/walkthrough.json", async () => {
    const walkthrough = loadWalkthrough();
    const incoming = walkthrough.entries.filter((entry) => entry.type === "message_in");
    expect(incoming.length).toBe(2);
    for (const entry of incoming) {
      const sender = walkthrough.register.find((r) => r.id === entry.counterpartyId);
      if (sender === undefined || entry.text === undefined) {
        throw new Error("walkthrough message_in is missing its sender or text");
      }
      const key = await dedupeKey(sender.publicKey, epochSeconds(entry.timestamp), entry.text);
      expect(key).toBe(entry.dedupeKey);
    }
  });

  it("is 64 lowercase hex characters, as the schema requires", async () => {
    const key = await dedupeKey(KEY, 1793214220, "R1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    expect(await dedupeKey(KEY, 1793214220, "R1")).toBe(await dedupeKey(KEY, 1793214220, "R1"));
  });

  it("does not trim or normalise the text", async () => {
    const plain = await dedupeKey(KEY, 1793214220, "R1");
    expect(await dedupeKey(KEY, 1793214220, "R1 ")).not.toBe(plain);
    expect(await dedupeKey(KEY, 1793214220, "r1")).not.toBe(plain);
  });

  it("changes with the sender timestamp and the sender key", async () => {
    const plain = await dedupeKey(KEY, 1793214220, "R1");
    expect(await dedupeKey(KEY, 1793214221, "R1")).not.toBe(plain);
    expect(await dedupeKey("7b".repeat(32), 1793214220, "R1")).not.toBe(plain);
  });

  it("hashes the text as UTF-8 bytes", async () => {
    // "æ" is two bytes; the hash of the string must differ from a one-byte stand-in.
    expect(await dedupeKey(KEY, 1, "kælder")).not.toBe(await dedupeKey(KEY, 1, "kalder"));
  });

  it("rejects a sender key that is not 64 lowercase hex characters", () => {
    expect(PUBLIC_KEY_PATTERN.test(KEY)).toBe(true);
    expect(() => dedupeInput(KEY.toUpperCase(), 1, "x")).toThrow();
    expect(() => dedupeInput("7a", 1, "x")).toThrow();
    expect(() => dedupeInput("", 1, "x")).toThrow();
  });

  it("rejects a sender timestamp that is not a whole number of seconds", () => {
    expect(() => dedupeInput(KEY, 1.5, "x")).toThrow();
    expect(() => dedupeInput(KEY, -1, "x")).toThrow();
    expect(() => dedupeInput(KEY, Number.NaN, "x")).toThrow();
  });
});
