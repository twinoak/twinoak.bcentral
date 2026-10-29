// The mirror file format (P1-04): one line per write, the kind first, the object as stored;
// the file reads back into an envelope that validates and equals the export.

import { describe, expect, it } from "vitest";
import { FakeDirectory } from "../test-support/fakeDirectory.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  appendLine,
  mirrorEnvelope,
  mirrorFilename,
  mirrorLine,
  MirrorParseError,
  parseMirror,
  writeFile,
} from "./mirrorFile.ts";
import { validateEnvelope } from "./schema.ts";
import type { Incident, JournalEntry, RegisterEntry } from "./types.ts";

const walkthrough = loadWalkthrough();
const incident = walkthrough.incidents[0] as Incident;
const hans = walkthrough.register[0] as RegisterEntry;
const order1 = walkthrough.entries[0] as JournalEntry;

describe("mirror lines", () => {
  it("names the file per device", () => {
    expect(mirrorFilename(walkthrough.deviceId)).toBe(
      "bcentral-journal-01JB8ZK3QX9V2M4N6P8R0T2W4Y.ndjson",
    );
  });

  it("is one JSON object per line, the kind first, the object as stored", () => {
    const line = mirrorLine({ kind: "entry", value: order1 });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.startsWith('{"kind":"entry",')).toBe(true);
    expect(line.slice(0, -1).includes("\n")).toBe(false);
    expect(JSON.parse(line)).toStrictEqual({ kind: "entry", ...order1 });
    expect(
      mirrorLine({ kind: "incident", value: incident }).startsWith('{"kind":"incident",'),
    ).toBe(true);
    expect(
      mirrorLine({ kind: "registerEntry", value: hans }).startsWith('{"kind":"registerEntry",'),
    ).toBe(true);
  });

  it("the whole walkthrough as lines reads back into the same envelope", () => {
    const text = [
      ...walkthrough.incidents.map((value) => mirrorLine({ kind: "incident", value })),
      ...walkthrough.register.map((value) => mirrorLine({ kind: "registerEntry", value })),
      ...walkthrough.entries.map((value) => mirrorLine({ kind: "entry", value })),
    ].join("");
    const envelope = mirrorEnvelope(
      parseMirror(text),
      walkthrough.deviceId,
      walkthrough.exportedAt,
    );
    expect(validateEnvelope(envelope)).toBe(true);
    expect(envelope).toStrictEqual(walkthrough);
  });

  it("a register entry or incident written twice keeps the last line in the first's place", () => {
    const edited: RegisterEntry = { ...hans, label: "Hans (ny radio)" };
    const renamed: Incident = { ...incident, name: "Strømsvigt" };
    const text =
      mirrorLine({ kind: "registerEntry", value: hans }) +
      mirrorLine({ kind: "incident", value: incident }) +
      mirrorLine({ kind: "entry", value: order1 }) +
      mirrorLine({ kind: "registerEntry", value: edited }) +
      mirrorLine({ kind: "incident", value: renamed });
    const content = parseMirror(text);
    expect(content.register).toStrictEqual([edited]);
    expect(content.incidents).toStrictEqual([renamed]);
    expect(content.entries).toStrictEqual([order1]);
  });

  it("an entry repeated (the same folder chosen twice) is kept once", () => {
    const text = mirrorLine({ kind: "entry", value: order1 }).repeat(2);
    expect(parseMirror(text).entries).toStrictEqual([order1]);
  });

  it("blank lines are skipped; a malformed line, an unknown kind or a missing id throws", () => {
    expect(parseMirror("\n\n").entries).toEqual([]);
    expect(() => parseMirror('{"kind":"entry"\n')).toThrow(MirrorParseError);
    expect(() => parseMirror('{"kind":"status","id":"x"}\n')).toThrow(
      /line 1: unknown kind "status"/,
    );
    expect(() => parseMirror('{"kind":"entry"}\n')).toThrow(/line 1: no id/);
    expect(() => parseMirror("[1]\n")).toThrow(/not a JSON object/);
    expect(() => parseMirror(mirrorLine({ kind: "entry", value: order1 }) + "{oops}\n")).toThrow(
      /line 2/,
    );
  });

  it("a line that is not the contract's shape fails the envelope's validation", () => {
    const broken = { ...order1, type: "shout" } as unknown as JournalEntry;
    const content = parseMirror(mirrorLine({ kind: "entry", value: broken }));
    expect(() => mirrorEnvelope(content, walkthrough.deviceId, walkthrough.exportedAt)).toThrow(
      /does not match contract/,
    );
  });
});

describe("appendLine and writeFile on a directory", () => {
  it("creates the file on the first append and appends after that, never rewriting", async () => {
    const directory = new FakeDirectory();
    await appendLine(directory, "j.ndjson", "a\n");
    await appendLine(directory, "j.ndjson", "b\n");
    await appendLine(directory, "j.ndjson", "c\n");
    expect(directory.text("j.ndjson")).toBe("a\nb\nc\n");
    expect(directory.commits).toBe(3);
  });

  it("a failure before the commit leaves the file as it was", async () => {
    const directory = new FakeDirectory();
    await appendLine(directory, "j.ndjson", "a\n");
    directory.failWith = new DOMException("gone", "NotFoundError");
    await expect(appendLine(directory, "j.ndjson", "b\n")).rejects.toThrow("gone");
    directory.failWith = null;
    expect(directory.text("j.ndjson")).toBe("a\n");
    expect(directory.commits).toBe(1);
  });

  it("writeFile replaces the whole file", async () => {
    const directory = new FakeDirectory();
    await writeFile(directory, "export.json", "{}\n");
    await writeFile(directory, "export.json", '{"a":1}\n');
    expect(directory.text("export.json")).toBe('{"a":1}\n');
  });
});
