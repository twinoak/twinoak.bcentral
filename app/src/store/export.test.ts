import { describe, expect, it } from "vitest";
import { envelopeFilename, envelopeJson, filenameTimestamp } from "./export.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";

describe("export file", () => {
  it("names the file bcentral-journal-<deviceId>-<timestamp>.json", () => {
    const envelope = loadWalkthrough();
    expect(envelopeFilename(envelope)).toBe(
      "bcentral-journal-01JB8ZK3QX9V2M4N6P8R0T2W4Y-2026-10-28T193000Z.json",
    );
  });

  it("drops fractional seconds and colons from the timestamp so the name is legal on Windows", () => {
    expect(filenameTimestamp("2026-10-28T19:30:00.123Z")).toBe("2026-10-28T193000Z");
    expect(filenameTimestamp("2026-10-28T19:30:00Z")).toBe("2026-10-28T193000Z");
    expect(filenameTimestamp("2026-10-28T19:30:00+02:00")).toBe("2026-10-28T193000+0200");
  });

  it("writes pretty-printed JSON that parses back to the same envelope", () => {
    const envelope = loadWalkthrough();
    const text = envelopeJson(envelope);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "format": "bcentral-journal",\n');
    expect(JSON.parse(text)).toStrictEqual(envelope);
  });
});
