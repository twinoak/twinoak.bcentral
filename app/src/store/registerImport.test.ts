import { beforeAll, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import {
  COMMA_LF,
  KEY_A,
  KEY_B,
  KEY_C,
  KEY_D,
  MISSING_KEYS,
  MIXED,
  SEMICOLON_BOM_CRLF,
} from "../test-support/registerCsvFixtures.ts";
import { openTestStore, TEST_DEVICE_ID, uniqueDatabaseName } from "../test-support/testStore.ts";
import { DuplicatePublicKeyError, type JournalStore, type Written } from "./journalStore.ts";
import { previewRegisterImport, registerCsv } from "./registerCsv.ts";
import {
  importNoteText,
  importRegister,
  RegisterImportError,
  registerCsvFilename,
} from "./registerImport.ts";
import { hasRadio, sortedByLabel } from "./register.ts";
import { ValidationError } from "./schema.ts";
import type { NewRegisterEntry, RegisterEntry } from "./types.ts";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

beforeAll(() => {
  setLanguage("en");
});

function fieldsOf(entry: RegisterEntry): NewRegisterEntry {
  return {
    label: entry.label,
    person: entry.person,
    phone: entry.phone,
    street: entry.street,
    role: entry.role,
    notes: entry.notes,
    ...(entry.publicKey === undefined ? {} : { publicKey: entry.publicKey, origin: entry.origin }),
  };
}

async function importFile(store: JournalStore, text: string, incidentId: string | null = null) {
  const preview = previewRegisterImport(text, await store.allRegisterEntries());
  return await importRegister(store, preview, {
    operator: "Thomas",
    incidentId,
    fileName: "beboere.csv",
  });
}

describe("importRegister: the store write", () => {
  it("stores every row as a contact, with a radio or without, none pending", async () => {
    const store = await openTestStore();
    const result = await importFile(store, MISSING_KEYS);
    expect(result.entries.map((entry) => entry.label)).toStrictEqual([
      "Hans",
      "Peter",
      "Lise",
      "Ole",
      "Anna",
    ]);
    expect(result.note).toBeNull();

    const stored = await store.allRegisterEntries();
    expect(stored.length).toBe(5);
    expect(
      stored.every((entry) => ULID.test(entry.id) && entry.createdOnDevice === TEST_DEVICE_ID),
    ).toBe(true);
    expect(new Set(stored.map((entry) => entry.id)).size).toBe(5);
    expect(await store.registerEntryByPublicKey(KEY_B)).toMatchObject({
      label: "Ole",
      person: "Ole Madsen",
      street: "Vestergade 3",
      origin: "private",
    });
    const withoutRadio = stored.filter((entry) => !hasRadio(entry));
    expect(withoutRadio.map((entry) => entry.label).sort()).toStrictEqual([
      "Anna",
      "Lise",
      "Peter",
    ]);
    for (const entry of withoutRadio) {
      expect("publicKey" in entry).toBe(false);
      expect("origin" in entry).toBe(false);
      expect(entry.createdAt).toMatch(/^2026-10-28T19:00:0\d\.000Z$/);
    }
    const peter = stored.find((entry) => entry.label === "Peter");
    expect(peter).toMatchObject({ phone: "23 45 67 89", street: "Søndergade 4" });
    store.close();
  });

  it("the acceptance file: two rows with keys and one without are three entries, Grethe with her phone", async () => {
    const store = await openTestStore();
    const result = await importFile(store, MIXED);
    expect(result.entries.map((entry) => entry.label)).toStrictEqual(["Hans", "Grethe", "Ole"]);
    const grethe = result.entries[1];
    expect(grethe).toMatchObject({
      label: "Grethe",
      person: "Grethe Nielsen",
      street: "Nørregade 12",
      phone: "12 34 56 78",
    });
    expect(grethe?.publicKey).toBeUndefined();
    expect(grethe?.origin).toBeUndefined();
    expect((await store.allRegisterEntries()).length).toBe(3);
    store.close();
  });

  it("contacts without a radio are kept across a restart and are not the journal folder", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    await importFile(first, MISSING_KEYS);
    first.close();

    const second = await openTestStore({ name });
    expect((await second.allRegisterEntries()).map((row) => row.label).sort()).toStrictEqual([
      "Anna",
      "Hans",
      "Lise",
      "Ole",
      "Peter",
    ]);
    expect(await second.journalFolder()).toBeUndefined();
    expect(await second.lastDeviceSeq()).toBe(0);
    second.close();
  });

  it("is all or nothing: a key the store already holds leaves every row unwritten", async () => {
    const store = await openTestStore();
    const existing = await store.createRegisterEntry({
      publicKey: KEY_B,
      label: "Ole",
      origin: "private",
    });
    // The preview against an empty list does not see the clash; the store does.
    const preview = previewRegisterImport(MISSING_KEYS, []);
    expect(preview.errors).toStrictEqual([]);
    await expect(
      importRegister(store, preview, {
        operator: "Thomas",
        incidentId: null,
        fileName: "beboere.csv",
      }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect(await store.allRegisterEntries()).toStrictEqual([existing]);
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });

  it("refuses a preview with errors, and an empty one, without touching the store", async () => {
    const store = await openTestStore();
    const bad = previewRegisterImport(`label;publicKey\nHans;${KEY_A}\nPeter;${KEY_A}\n`, []);
    expect(bad.errors.length).toBe(1);
    await expect(
      importRegister(store, bad, { operator: "Thomas", incidentId: null, fileName: "x.csv" }),
    ).rejects.toThrow(RegisterImportError);
    const empty = previewRegisterImport("label;publicKey\n", []);
    expect(empty.errors).toStrictEqual([]);
    await expect(
      importRegister(store, empty, { operator: "Thomas", incidentId: null, fileName: "x.csv" }),
    ).rejects.toThrow(RegisterImportError);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });

  it("a row the schema refuses leaves the whole file unwritten", async () => {
    const store = await openTestStore();
    await expect(
      store.createRegisterEntries([
        { label: "Grethe" },
        { label: "", publicKey: KEY_A, origin: "issued" },
      ]),
    ).rejects.toThrow(ValidationError);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });

  it("notifies onWrite for every contact, with a radio or without", async () => {
    const store = await openTestStore();
    const written: Written[] = [];
    store.onWrite((w) => written.push(w));
    await importFile(store, MIXED);
    expect(written.map((w) => w.kind)).toStrictEqual([
      "registerEntry",
      "registerEntry",
      "registerEntry",
    ]);
    expect(written.map((w) => (w.kind === "registerEntry" ? w.value.label : ""))).toStrictEqual([
      "Hans",
      "Grethe",
      "Ole",
    ]);
    store.close();
  });
});

describe("importRegister: the note", () => {
  it("appends one note to an open incident: register: imported N contacts from <file>, n with a radio", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const result = await importFile(store, SEMICOLON_BOM_CRLF, incident.id);
    expect(result.note).toMatchObject({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "register: imported 3 contacts from beboere.csv, 3 with a radio",
    });
    expect(await store.entriesForIncident(incident.id)).toStrictEqual([result.note]);
    store.close();
  });

  it("counts the contacts with a radio among them", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const result = await importFile(store, MISSING_KEYS, incident.id);
    expect(result.note?.text).toBe(
      "register: imported 5 contacts from beboere.csv, 2 with a radio",
    );
    expect(importNoteText("a.csv", 2, 0)).toBe(
      "register: imported 2 contacts from a.csv, 0 with a radio",
    );
    store.close();
  });

  it("writes no note without an incident, for a closed one, or for an unknown one", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const closed = await store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "status_change",
      refersTo: incident.id,
      newStatus: "closed",
    });
    expect((await importFile(store, COMMA_LF, incident.id)).note).toBeNull();
    const more = `label;publicKey\nLise;${KEY_C}\n`;
    expect((await importFile(store, more, null)).note).toBeNull();
    const evenMore = `label;publicKey\nOle;${KEY_D}\n`;
    expect((await importFile(store, evenMore, "01JB8ZK3QX9V2M4N6P8R0T2W99")).note).toBeNull();
    expect(await store.allEntries()).toStrictEqual([closed]);
    expect((await store.allRegisterEntries()).length).toBe(4);
    store.close();
  });
});

describe("export and round trip through the store", () => {
  it("the export holds every contact by label, a keyless one with an empty key and origin", async () => {
    const store = await openTestStore();
    await importFile(store, MISSING_KEYS);
    const text = registerCsv(sortedByLabel(await store.allRegisterEntries(), "da"));
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("﻿label;person;street;role;phone;origin;publicKey;notes");
    expect(lines.slice(1, 6).map((line) => line.split(";")[0])).toStrictEqual([
      "Anna",
      "Hans",
      "Lise",
      "Ole",
      "Peter",
    ]);
    expect(lines[1]).toBe("Anna;Anna Berg;Nørregade 9;;;;;");
    expect(lines[5]).toBe("Peter;Peter Sørensen;Søndergade 4;;23 45 67 89;;;");
    store.close();
  });

  it("import → export → import into a fresh store gives identical rows (mixed rows)", async () => {
    const first = await openTestStore();
    await importFile(first, MISSING_KEYS);
    const text = registerCsv(sortedByLabel(await first.allRegisterEntries(), "da"));

    const second = await openTestStore();
    const preview = previewRegisterImport(text, []);
    expect(preview.errors).toStrictEqual([]);
    await importRegister(second, preview, {
      operator: "Thomas",
      incidentId: null,
      fileName: "x.csv",
    });

    const rows = async (store: JournalStore) =>
      sortedByLabel(await store.allRegisterEntries(), "da").map(fieldsOf);
    expect(await rows(second)).toStrictEqual(await rows(first));
    expect((await rows(second)).length).toBe(5);
    expect((await rows(second)).filter((row) => row.publicKey !== undefined).length).toBe(2);

    // And once more: the second export is the first, byte for byte.
    const again = registerCsv(sortedByLabel(await second.allRegisterEntries(), "da"));
    expect(again).toBe(text);
    first.close();
    second.close();
  });

  it("names the file bcentral-register-<deviceId>-<timestamp>.csv", () => {
    expect(registerCsvFilename(TEST_DEVICE_ID, "2026-10-28T19:30:00.123Z")).toBe(
      "bcentral-register-01JB8ZK3QX9V2M4N6P8R0T2W4Y-2026-10-28T193000Z.csv",
    );
  });
});
