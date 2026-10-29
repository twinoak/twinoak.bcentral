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
