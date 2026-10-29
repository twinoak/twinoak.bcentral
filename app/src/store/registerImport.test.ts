import { beforeAll, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import {
  COMMA_LF,
  KEY_A,
  KEY_B,
  KEY_C,
  KEY_D,
  MISSING_KEYS,
  SEMICOLON_BOM_CRLF,
} from "../test-support/registerCsvFixtures.ts";
import { openTestStore, TEST_DEVICE_ID, uniqueDatabaseName } from "../test-support/testStore.ts";
import {
  DuplicatePublicKeyError,
  NoPendingRowError,
  type JournalStore,
  type Written,
} from "./journalStore.ts";
import { previewRegisterImport, registerCsv } from "./registerCsv.ts";
import {
  importNoteText,
  importRegister,
  RegisterImportError,
  registerCsvFilename,
} from "./registerImport.ts";
import { sortedByLabel } from "./register.ts";
import { ValidationError } from "./schema.ts";
import type { NewRegisterEntry, PendingRegisterRow, RegisterEntry } from "./types.ts";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

beforeAll(() => {
  setLanguage("en");
});

function fieldsOf(entry: RegisterEntry | PendingRegisterRow): Omit<
  NewRegisterEntry,
  "publicKey"
> & {
  publicKey: string;
} {
  return {
    label: entry.label,
    person: entry.person,
    street: entry.street,
    role: entry.role,
    origin: entry.origin,
    notes: entry.notes,
    publicKey: "publicKey" in entry ? entry.publicKey : "",
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
  it("stores the rows with a key as entries and the rows without as pending rows", async () => {
    const store = await openTestStore();
    const result = await importFile(store, MISSING_KEYS);
    expect(result.entries.map((entry) => entry.label)).toStrictEqual(["Hans", "Ole"]);
    expect(result.pending.map((row) => row.label)).toStrictEqual(["Peter", "Lise", "Anna"]);
    expect(result.note).toBeNull();

    const stored = await store.allRegisterEntries();
    expect(stored.length).toBe(2);
    expect(
      stored.every((entry) => ULID.test(entry.id) && entry.createdOnDevice === TEST_DEVICE_ID),
    ).toBe(true);
    expect(await store.registerEntryByPublicKey(KEY_B)).toMatchObject({
      label: "Ole",
      person: "Ole Madsen",
      street: "Vestergade 3",
      origin: "private",
    });

    const pending = await store.pendingRegisterRows();
    expect(pending.map((row) => row.label)).toStrictEqual(["Peter", "Lise", "Anna"]);
    for (const row of pending) {
      expect(ULID.test(row.id)).toBe(true);
      expect(row.createdOnDevice).toBe(TEST_DEVICE_ID);
      expect(row.createdAt).toMatch(/^2026-10-28T19:00:0\d\.000Z$/);
      expect("publicKey" in row).toBe(false);
    }
    expect(pending[1]).toMatchObject({ label: "Lise", role: "suppleant", notes: "ny beboer" });
    expect(new Set([...stored, ...pending].map((x) => x.id)).size).toBe(5);
    store.close();
  });

  it("pending rows are kept across a restart and are not the journal folder", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    await importFile(first, MISSING_KEYS);
    first.close();

    const second = await openTestStore({ name });
    expect((await second.pendingRegisterRows()).map((row) => row.label)).toStrictEqual([
      "Peter",
      "Lise",
      "Anna",
    ]);
    expect(await second.journalFolder()).toBeUndefined();
    expect(await second.lastDeviceSeq()).toBe(0);
    second.close();
  });

  it("is all or nothing: a key the store already holds leaves entries and pending rows unwritten", async () => {
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
    expect(await store.pendingRegisterRows()).toStrictEqual([]);
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
    expect(await store.pendingRegisterRows()).toStrictEqual([]);
    store.close();
  });

  it("a pending row is validated as the entry it will become", async () => {
    const store = await openTestStore();
    await expect(store.importRegister([], [{ label: "", origin: "issued" }])).rejects.toThrow(
      ValidationError,
    );
    expect(await store.pendingRegisterRows()).toStrictEqual([]);
    store.close();
  });

  it("notifies onWrite for every entry and for no pending row", async () => {
    const store = await openTestStore();
    const written: Written[] = [];
    store.onWrite((w) => written.push(w));
    await importFile(store, MISSING_KEYS);
    expect(written.map((w) => w.kind)).toStrictEqual(["registerEntry", "registerEntry"]);
    expect(written.map((w) => (w.kind === "registerEntry" ? w.value.label : ""))).toStrictEqual([
      "Hans",
      "Ole",
    ]);
    store.close();
  });
});

describe("importRegister: the note", () => {
  it("appends one note to an open incident: register: imported N entries from <file>", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const result = await importFile(store, SEMICOLON_BOM_CRLF, incident.id);
    expect(result.note).toMatchObject({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "register: imported 3 entries from beboere.csv",
    });
    expect(await store.entriesForIncident(incident.id)).toStrictEqual([result.note]);
    store.close();
  });

  it("says how many rows are not yet bound", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const result = await importFile(store, MISSING_KEYS, incident.id);
    expect(result.note?.text).toBe(
      "register: imported 5 entries from beboere.csv, 3 not yet bound to a radio",
    );
    expect(importNoteText("a.csv", 2, 0)).toBe("register: imported 2 entries from a.csv");
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

describe("binding a pending row", () => {
  it("makes it a register entry with the same id and stamps, and takes it off the pending list", async () => {
    const store = await openTestStore();
    await importFile(store, MISSING_KEYS);
    const [peter] = await store.pendingRegisterRows();
    expect(peter?.label).toBe("Peter");
    const written: Written[] = [];
    store.onWrite((w) => written.push(w));

    const bound = await store.bindPendingRegisterRow(peter!.id, {
      ...fieldsOf(peter!),
      publicKey: KEY_C,
    });
    expect(bound).toStrictEqual({
      id: peter!.id,
      createdAt: peter!.createdAt,
      createdOnDevice: peter!.createdOnDevice,
      label: "Peter",
      person: "Peter Sørensen",
      street: "Søndergade 4",
      origin: "issued",
      publicKey: KEY_C,
    });
    expect(await store.getRegisterEntry(peter!.id)).toStrictEqual(bound);
    expect(await store.registerEntryByPublicKey(KEY_C)).toStrictEqual(bound);
    expect((await store.pendingRegisterRows()).map((row) => row.label)).toStrictEqual([
      "Lise",
      "Anna",
    ]);
    expect(await store.getPendingRegisterRow(peter!.id)).toBeUndefined();
    expect(written).toStrictEqual([{ kind: "registerEntry", value: bound }]);
    store.close();
  });

  it("the staff may correct the fields while binding", async () => {
    const store = await openTestStore();
    await importFile(store, MISSING_KEYS);
    const lise = (await store.pendingRegisterRows()).find((row) => row.label === "Lise")!;
    const bound = await store.bindPendingRegisterRow(lise.id, {
      label: "Lise H.",
      origin: "private",
      publicKey: KEY_C,
    });
    expect(bound).toStrictEqual({
      id: lise.id,
      createdAt: lise.createdAt,
      createdOnDevice: lise.createdOnDevice,
      label: "Lise H.",
      origin: "private",
      publicKey: KEY_C,
    });
    store.close();
  });

  it("refuses a taken or invalid key and leaves the row pending; refuses a row that is not pending", async () => {
    const store = await openTestStore();
    await importFile(store, MISSING_KEYS);
    const [peter] = await store.pendingRegisterRows();
    await expect(
      store.bindPendingRegisterRow(peter!.id, { ...fieldsOf(peter!), publicKey: KEY_A }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    await expect(
      store.bindPendingRegisterRow(peter!.id, { ...fieldsOf(peter!), publicKey: "nope" }),
    ).rejects.toThrow(ValidationError);
    expect(await store.getPendingRegisterRow(peter!.id)).toStrictEqual(peter);
    expect((await store.allRegisterEntries()).length).toBe(2);

    await store.bindPendingRegisterRow(peter!.id, { ...fieldsOf(peter!), publicKey: KEY_C });
    await expect(
      store.bindPendingRegisterRow(peter!.id, { ...fieldsOf(peter!), publicKey: KEY_D }),
    ).rejects.toThrow(NoPendingRowError);
    await expect(
      store.bindPendingRegisterRow("01JB8ZK3QX9V2M4N6P8R0T2W99", {
        label: "x",
        origin: "issued",
        publicKey: KEY_D,
      }),
    ).rejects.toThrow(NoPendingRowError);
    expect(await store.registerEntryByPublicKey(KEY_D)).toBeUndefined();
    store.close();
  });
});

describe("export and round trip through the store", () => {
  it("the export holds every entry and the pending rows with an empty key", async () => {
    const store = await openTestStore();
    await importFile(store, MISSING_KEYS);
    const text = registerCsv(
      sortedByLabel(await store.allRegisterEntries(), "da"),
      sortedByLabel(await store.pendingRegisterRows(), "da"),
    );
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("﻿label;person;street;role;origin;publicKey;notes");
    expect(lines.slice(1, 6).map((line) => line.split(";")[0])).toStrictEqual([
      "Hans",
      "Ole",
      "Anna",
      "Lise",
      "Peter",
    ]);
    expect(lines[3]).toBe("Anna;Anna Berg;Nørregade 9;;issued;;");
    store.close();
  });

  it("import → export → import into a fresh store gives identical rows", async () => {
    const first = await openTestStore();
    await importFile(first, MISSING_KEYS);
    const text = registerCsv(
      sortedByLabel(await first.allRegisterEntries(), "da"),
      sortedByLabel(await first.pendingRegisterRows(), "da"),
    );

    const second = await openTestStore();
    const preview = previewRegisterImport(text, []);
    expect(preview.errors).toStrictEqual([]);
    await importRegister(second, preview, {
      operator: "Thomas",
      incidentId: null,
      fileName: "x.csv",
    });

    const rows = async (store: JournalStore) => [
      ...sortedByLabel(await store.allRegisterEntries(), "da").map(fieldsOf),
      ...sortedByLabel(await store.pendingRegisterRows(), "da").map(fieldsOf),
    ];
    expect(await rows(second)).toStrictEqual(await rows(first));
    expect((await rows(second)).length).toBe(5);

    // And once more: the second export is the first, byte for byte.
    const again = registerCsv(
      sortedByLabel(await second.allRegisterEntries(), "da"),
      sortedByLabel(await second.pendingRegisterRows(), "da"),
    );
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
