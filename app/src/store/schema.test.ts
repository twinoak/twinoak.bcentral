import { describe, expect, it } from "vitest";
import {
  assertValid,
  validateEnvelope,
  validateIncident,
  validateJournalEntry,
  validateRegisterEntry,
  ValidationError,
} from "./schema.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";

describe("contract schema validators", () => {
  it("accept contract/examples/walkthrough.json and each object in it", () => {
    const walkthrough = loadWalkthrough();
    expect(validateEnvelope(walkthrough)).toBe(true);
    for (const incident of walkthrough.incidents) {
      expect(validateIncident(incident)).toBe(true);
    }
    for (const entry of walkthrough.register) {
      expect(validateRegisterEntry(entry)).toBe(true);
    }
    for (const entry of walkthrough.entries) {
      expect(validateJournalEntry(entry)).toBe(true);
    }
  });

  it("reject an envelope with the wrong format, version or an unknown property", () => {
    const walkthrough = loadWalkthrough();
    expect(validateEnvelope({ ...walkthrough, format: "journal" })).toBe(false);
    expect(validateEnvelope({ ...walkthrough, version: 2 })).toBe(false);
    expect(validateEnvelope({ ...walkthrough, extra: true })).toBe(false);
    expect(validateEnvelope({ ...walkthrough, exportedAt: "yesterday" })).toBe(false);
  });

  it("allow batchId on a message_out only (P1-01)", () => {
    const walkthrough = loadWalkthrough();
    const batchId = "01JB8ZK3QX9V2M4N6P8R0T2X10";
    const byType = (type: string) => walkthrough.entries.find((e) => e.type === type);
    expect(validateJournalEntry({ ...byType("message_out"), batchId })).toBe(true);
    expect(validateJournalEntry({ ...byType("message_out"), batchId: "batch-1" })).toBe(false);
    expect(validateJournalEntry({ ...byType("note"), batchId })).toBe(false);
    expect(validateJournalEntry({ ...byType("message_in"), batchId })).toBe(false);
    expect(validateJournalEntry({ ...byType("status_change"), batchId })).toBe(false);
    expect(validateJournalEntry({ ...byType("correction"), batchId })).toBe(false);
  });

  it("allow refersTo on a message_out (a reply, P1-02) as the schema already did", () => {
    const walkthrough = loadWalkthrough();
    const out = walkthrough.entries.find((e) => e.type === "message_out");
    const incomingId = walkthrough.entries.find((e) => e.type === "message_in")?.id;
    expect(validateJournalEntry({ ...out, refersTo: incomingId })).toBe(true);
    expect(validateJournalEntry({ ...out, refersTo: "not-a-ulid" })).toBe(false);
  });

  it("check the date-time format", () => {
    const [entry] = loadWalkthrough().entries;
    expect(validateJournalEntry({ ...entry, timestamp: "2026-10-28 19:00" })).toBe(false);
    expect(validateJournalEntry({ ...entry, timestamp: "2026-10-28T19:00:00+02:00" })).toBe(true);
    expect(validateJournalEntry({ ...entry, timestamp: "2026-10-28T19:00:00.000Z" })).toBe(true);
  });

  it("assertValid throws a ValidationError that names what failed", () => {
    const [entry] = loadWalkthrough().entries;
    expect(() => assertValid(validateJournalEntry, entry, "journalEntry")).not.toThrow();
    let caught: unknown;
    try {
      assertValid(validateJournalEntry, { ...entry, operator: "" }, "journalEntry");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    if (caught instanceof ValidationError) {
      expect(caught.message).toContain("journalEntry");
      expect(caught.message).toContain("contract/journal.schema.json");
      expect(caught.errors.length).toBeGreaterThan(0);
    }
  });
});
