import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { openDB } from "idb";
import { openTestStore, uniqueDatabaseName } from "../test-support/testStore.ts";
import { setLanguage } from "../i18n/index.svelte.ts";
import { DuplicatePublicKeyError, type JournalStore } from "./journalStore.ts";
import { ValidationError } from "./schema.ts";
import {
  adhocLabels,
  hasRadio,
  isValidPublicKey,
  normalizePublicKey,
  PUBLIC_KEY_PATTERN,
  radioContacts,
  REGISTER_FIELDS,
  registerChanges,
  registerChangeText,
  saveRegisterEntry,
  sortedByLabel,
  withoutRadio,
} from "./register.ts";
import type { RegisterEntry } from "./types.ts";

const KEY_A = "7a".repeat(32);
const KEY_B = "7b".repeat(32);
const KEY_C = "7c".repeat(32);

function contractPublicKeyPattern(): string {
  const text = readFileSync(new URL("../../../contract/journal.schema.json", import.meta.url), "utf8");
  const schema = JSON.parse(text) as { $defs: { publicKey: { pattern: string } } };
  return schema.$defs.publicKey.pattern;
}

async function createRadio7(store: JournalStore): Promise<RegisterEntry> {
  return await store.createRegisterEntry({ publicKey: KEY_A, label: "radio #7", origin: "adhoc" });
}

// The note texts below are the English ones.
beforeAll(() => {
  setLanguage("en");
});

describe("public key validation", () => {
  it("uses the contract's publicKey pattern", () => {
    expect(PUBLIC_KEY_PATTERN.source).toBe(contractPublicKeyPattern());
  });

  it("accepts exactly 64 lowercase hex characters and nothing else", () => {
    expect(isValidPublicKey(KEY_A)).toBe(true);
    expect(isValidPublicKey("0123456789abcdef".repeat(4))).toBe(true);
    expect(isValidPublicKey(KEY_A.toUpperCase())).toBe(false);
    expect(isValidPublicKey(KEY_A.slice(0, 63))).toBe(false);
    expect(isValidPublicKey(`${KEY_A}7`)).toBe(false);
    expect(isValidPublicKey(`${KEY_A.slice(0, 63)}g`)).toBe(false);
    expect(isValidPublicKey(` ${KEY_A}`)).toBe(false);
    expect(isValidPublicKey(`${KEY_A}\n`)).toBe(false);
    expect(isValidPublicKey("")).toBe(false);
  });

  it("normalizes pasted input by trimming and lowercasing only", () => {
    expect(normalizePublicKey(`  ${KEY_A.toUpperCase()}\n`)).toBe(KEY_A);
    expect(normalizePublicKey("0x" + KEY_A)).toBe("0x" + KEY_A);
    expect(normalizePublicKey("7a 7a")).toBe("7a 7a");
    expect(isValidPublicKey(normalizePublicKey(`${KEY_A.toUpperCase()} `))).toBe(true);
  });
});

describe("store: public keys are unique", () => {
  it("rejects a second entry with the same public key and stores nothing", async () => {
    const store = await openTestStore();
    const first = await createRadio7(store);
    await expect(
      store.createRegisterEntry({ publicKey: KEY_A, label: "Hans", origin: "private" }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect(await store.allRegisterEntries()).toStrictEqual([first]);
    store.close();
  });

  it("names the entry that holds the key", async () => {
    const store = await openTestStore();
    const first = await createRadio7(store);
    let thrown: unknown;
    try {
      await store.createRegisterEntry({ publicKey: KEY_A, label: "Hans", origin: "private" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DuplicatePublicKeyError);
    expect((thrown as DuplicatePublicKeyError).existingId).toBe(first.id);
    expect((thrown as DuplicatePublicKeyError).publicKey).toBe(KEY_A);
    store.close();
  });

  it("rejects an edit that takes another entry's key, and allows an edit that keeps its own", async () => {
    const store = await openTestStore();
    const a = await createRadio7(store);
    const b = await store.createRegisterEntry({ publicKey: KEY_B, label: "radio #8", origin: "adhoc" });

    await expect(store.putRegisterEntry({ ...b, publicKey: KEY_A })).rejects.toThrow(
      DuplicatePublicKeyError,
    );
    expect(await store.getRegisterEntry(b.id)).toStrictEqual(b);

    const renamed = await store.putRegisterEntry({ ...a, label: "Hans" });
    expect(renamed.publicKey).toBe(KEY_A);
    expect(await store.getRegisterEntry(a.id)).toStrictEqual({ ...a, label: "Hans" });

    // Moving to a free key is fine.
    await store.putRegisterEntry({ ...b, publicKey: KEY_C });
    expect(await store.registerEntryByPublicKey(KEY_C)).toStrictEqual({ ...b, publicKey: KEY_C });
    expect(await store.registerEntryByPublicKey(KEY_B)).toBeUndefined();
    store.close();
  });

  it("still holds after a restart", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    await createRadio7(first);
    first.close();

    const second = await openTestStore({ name });
    await expect(
      second.createRegisterEntry({ publicKey: KEY_A, label: "Hans", origin: "private" }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect((await second.allRegisterEntries()).length).toBe(1);
    second.close();
  });

  it("upgrades a P0-02 (version 1) database and enforces the key from then on", async () => {
    const name = uniqueDatabaseName();
    const hans: RegisterEntry = {
      id: "01JB8ZK3QX9V2M4N6P8R0T2W50",
      publicKey: KEY_A,
      label: "Hans",
      origin: "adhoc",
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
    };
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore("incidents", { keyPath: "id" });
        db.createObjectStore("register", { keyPath: "id" });
        const entries = db.createObjectStore("entries", { keyPath: "id" });
        entries.createIndex("by-incidentId", "incidentId");
        entries.createIndex("by-counterpartyId", "counterpartyId");
        entries.createIndex("by-refersTo", "refersTo");
        entries.createIndex("by-dedupeKey", "dedupeKey", { unique: true });
        db.createObjectStore("meta");
      },
    });
    await v1.put("register", hans);
    v1.close();

    const store = await openTestStore({ name });
    expect(await store.registerEntryByPublicKey(KEY_A)).toStrictEqual(hans);
    await expect(
      store.createRegisterEntry({ publicKey: KEY_A, label: "radio #1", origin: "adhoc" }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect((await store.allRegisterEntries()).length).toBe(1);
    store.close();
  });

  it("an invalid key never reaches the store", async () => {
    const store = await openTestStore();
    const invalid = [KEY_A.toUpperCase(), KEY_A.slice(0, 63), `${KEY_A} `, "", "not a key"];
    for (const publicKey of invalid) {
      await expect(
        store.createRegisterEntry({ publicKey, label: "x", origin: "issued" }),
      ).rejects.toThrow(ValidationError);
    }
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });
});

describe("ad hoc batch", () => {
  it("adhocLabels numbers from the first number, distinct", () => {
    expect(adhocLabels(1, 3)).toStrictEqual(["radio #1", "radio #2", "radio #3"]);
    expect(adhocLabels(7, 2)).toStrictEqual(["radio #7", "radio #8"]);
    const hundred = adhocLabels(1, 100);
    expect(new Set(hundred).size).toBe(100);
    expect(() => adhocLabels(0, 1)).toThrow(RangeError);
    expect(() => adhocLabels(1, 0)).toThrow(RangeError);
    expect(() => adhocLabels(1.5, 2)).toThrow(RangeError);
  });

  it("createRegisterEntries makes N entries with distinct labels and keys", async () => {
    const store = await openTestStore();
    const labels = adhocLabels(1, 5);
    const created = await store.createRegisterEntries(
      labels.map((label, i) => ({
        label,
        origin: "adhoc" as const,
        publicKey: `${i + 1}`.repeat(64),
      })),
    );
    expect(created.length).toBe(5);
    expect(created.map((entry) => entry.label)).toStrictEqual(labels);
    expect(new Set(created.map((entry) => entry.id)).size).toBe(5);
    expect(new Set(created.map((entry) => entry.publicKey)).size).toBe(5);
    expect(created.every((entry) => entry.origin === "adhoc")).toBe(true);

    const stored = await store.allRegisterEntries();
    expect(stored.length).toBe(5);
    expect(new Set(stored.map((entry) => entry.label))).toStrictEqual(new Set(labels));
    store.close();
  });

  it("is all or nothing when a key is repeated within the batch", async () => {
    const store = await openTestStore();
    await expect(
      store.createRegisterEntries([
        { label: "radio #1", origin: "adhoc", publicKey: KEY_A },
        { label: "radio #2", origin: "adhoc", publicKey: KEY_B },
        { label: "radio #3", origin: "adhoc", publicKey: KEY_A },
      ]),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });

  it("is all or nothing when a key is already in the register", async () => {
    const store = await openTestStore();
    const existing = await createRadio7(store);
    await expect(
      store.createRegisterEntries([
        { label: "radio #1", origin: "adhoc", publicKey: KEY_B },
        { label: "radio #2", origin: "adhoc", publicKey: KEY_A },
      ]),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect(await store.allRegisterEntries()).toStrictEqual([existing]);
    store.close();
  });

  it("is all or nothing when one entry does not validate", async () => {
    const store = await openTestStore();
    await expect(
      store.createRegisterEntries([
        { label: "radio #1", origin: "adhoc", publicKey: KEY_B },
        { label: "", origin: "adhoc", publicKey: KEY_C },
      ]),
    ).rejects.toThrow(ValidationError);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });

  it("an empty batch creates nothing", async () => {
    const store = await openTestStore();
    expect(await store.createRegisterEntries([])).toStrictEqual([]);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    store.close();
  });
});

describe("what an edit changed", () => {
  const base: RegisterEntry = {
    id: "01JB8ZK3QX9V2M4N6P8R0T2W50",
    publicKey: KEY_A,
    label: "radio #7",
    origin: "adhoc",
    createdAt: "2026-10-28T18:00:00Z",
    createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
  };

  it("lists changed fields in the schema's order", () => {
    expect(registerChanges(base, { ...base, street: "Nørregade", label: "Hans" })).toStrictEqual([
      { field: "label", from: "radio #7", to: "Hans" },
      { field: "street", from: undefined, to: "Nørregade" },
    ]);
  });

  it("treats absent and empty as the same", () => {
    expect(registerChanges(base, { ...base, person: "" })).toStrictEqual([]);
    expect(registerChanges({ ...base, person: "" }, base)).toStrictEqual([]);
  });

  it("writes the task's example: label and street", () => {
    expect(registerChangeText(base, { ...base, label: "Hans", street: "Nørregade" })).toBe(
      "register: radio #7 → Hans, Street (none) → Nørregade",
    );
  });

  it("names the entry when the label did not change", () => {
    expect(registerChangeText(base, { ...base, notes: "out of service 12:40" })).toBe(
      "register: radio #7, Notes (none) → out of service 12:40",
    );
  });

  it("shows origins as words and keys in full", () => {
    expect(registerChangeText(base, { ...base, origin: "private" })).toBe(
      "register: radio #7, Origin Ad hoc, from the staff's stack → Privately owned",
    );
    expect(registerChangeText(base, { ...base, publicKey: KEY_B })).toBe(
      `register: radio #7, Public key ${KEY_A} → ${KEY_B}`,
    );
  });

  it("is null when nothing changed", () => {
    expect(registerChangeText(base, { ...base })).toBeNull();
    expect(registerChangeText(base, { ...base, person: undefined })).toBeNull();
  });
});

describe("saveRegisterEntry: the edit and its note", () => {
  it("appends a note to an open incident saying what changed", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const radio = await createRadio7(store);

    const result = await saveRegisterEntry(
      store,
      { ...radio, label: "Hans", street: "Nørregade" },
      { operator: "Thomas", incidentId: incident.id },
    );
    expect(result.entry).toStrictEqual({ ...radio, label: "Hans", street: "Nørregade" });
    expect(await store.getRegisterEntry(radio.id)).toStrictEqual(result.entry);
    expect(result.note).not.toBeNull();
    expect(result.note).toMatchObject({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "register: radio #7 → Hans, Street (none) → Nørregade",
    });
    expect(await store.entriesForIncident(incident.id)).toStrictEqual([result.note]);
    store.close();
  });

  it("writes no note when no incident is selected", async () => {
    const store = await openTestStore();
    await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const radio = await createRadio7(store);
    const result = await saveRegisterEntry(
      store,
      { ...radio, label: "Hans" },
      { operator: "Thomas", incidentId: null },
    );
    expect(result.note).toBeNull();
    expect(await store.getRegisterEntry(radio.id)).toStrictEqual({ ...radio, label: "Hans" });
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });

  it("writes no note when the selected incident is closed, and again when reopened", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const radio = await createRadio7(store);
    const closed = await store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "status_change",
      refersTo: incident.id,
      newStatus: "closed",
    });
    expect(await store.isIncidentOpen(incident.id)).toBe(false);

    const whileClosed = await saveRegisterEntry(
      store,
      { ...radio, label: "Hans" },
      { operator: "Thomas", incidentId: incident.id },
    );
    expect(whileClosed.note).toBeNull();
    expect(await store.entriesForIncident(incident.id)).toStrictEqual([closed]);

    const reopened = await store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "status_change",
      refersTo: incident.id,
      newStatus: "reopened",
    });
    expect(await store.isIncidentOpen(incident.id)).toBe(true);
    const whileOpen = await saveRegisterEntry(
      store,
      { ...whileClosed.entry, street: "Nørregade" },
      { operator: "Thomas", incidentId: incident.id },
    );
    expect(whileOpen.note).toMatchObject({ text: "register: Hans, Street (none) → Nørregade" });
    expect(await store.entriesForIncident(incident.id)).toStrictEqual([
      closed,
      reopened,
      whileOpen.note,
    ]);
    store.close();
  });

  it("writes no note when the selected incident does not exist", async () => {
    const store = await openTestStore();
    const radio = await createRadio7(store);
    const result = await saveRegisterEntry(
      store,
      { ...radio, label: "Hans" },
      { operator: "Thomas", incidentId: "01JB8ZK3QX9V2M4N6P8R0T2W99" },
    );
    expect(result.note).toBeNull();
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });

  it("writes no note when nothing changed, and none for a new entry", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const radio = await createRadio7(store);

    const unchanged = await saveRegisterEntry(
      store,
      { ...radio, person: "" },
      { operator: "Thomas", incidentId: incident.id },
    );
    expect(unchanged.note).toBeNull();

    const fresh: RegisterEntry = {
      id: "01JB8ZK3QX9V2M4N6P8R0T2W51",
      publicKey: KEY_B,
      label: "Peter",
      origin: "private",
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
    };
    const created = await saveRegisterEntry(store, fresh, {
      operator: "Thomas",
      incidentId: incident.id,
    });
    expect(created.note).toBeNull();
    expect(await store.getRegisterEntry(fresh.id)).toStrictEqual(fresh);
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });

  it("does not store the edit, and writes no note, when the key is taken", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const a = await createRadio7(store);
    const b = await store.createRegisterEntry({ publicKey: KEY_B, label: "radio #8", origin: "adhoc" });
    await expect(
      saveRegisterEntry(
        store,
        { ...b, publicKey: KEY_A, label: "Hans" },
        { operator: "Thomas", incidentId: incident.id },
      ),
    ).rejects.toThrow(DuplicatePublicKeyError);
    expect(await store.getRegisterEntry(b.id)).toStrictEqual(b);
    expect(await store.getRegisterEntry(a.id)).toStrictEqual(a);
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });
});

describe("isIncidentOpen", () => {
  it("is false for an unknown incident and true for a fresh one", async () => {
    const store = await openTestStore();
    expect(await store.isIncidentOpen("01JB8ZK3QX9V2M4N6P8R0T2W99")).toBe(false);
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    expect(await store.isIncidentOpen(incident.id)).toBe(true);
    store.close();
  });
});

describe("contacts without a radio (P3-06)", () => {
  it("an entry without a key validates and is stored with no key and no origin; phone as typed", async () => {
    const store = await openTestStore();
    const grethe = await store.createRegisterEntry({
      label: "Grethe",
      person: "Grethe Nielsen",
      street: "Nørregade 12",
      phone: "12 34 56 78",
    });
    expect(grethe).toStrictEqual({
      id: grethe.id,
      createdAt: grethe.createdAt,
      createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
      label: "Grethe",
      person: "Grethe Nielsen",
      street: "Nørregade 12",
      phone: "12 34 56 78",
    });
    expect("publicKey" in grethe).toBe(false);
    expect("origin" in grethe).toBe(false);
    expect(hasRadio(grethe)).toBe(false);
    expect(await store.getRegisterEntry(grethe.id)).toStrictEqual(grethe);
    // The envelope validates with her in it.
    const envelope = await store.exportEnvelope();
    expect(envelope.register).toStrictEqual([grethe]);
    store.close();
  });

  it("two contacts without a key do not clash on the key, and one with a key sits beside them", async () => {
    const store = await openTestStore();
    const grethe = await store.createRegisterEntry({ label: "Grethe" });
    const kurt = await store.createRegisterEntry({ label: "Kurt", phone: "87 65 43 21" });
    const hans = await createRadio7(store);
    expect((await store.allRegisterEntries()).map((entry) => entry.label).sort()).toStrictEqual([
      "Grethe",
      "Kurt",
      "radio #7",
    ]);
    expect(radioContacts([grethe, kurt, hans])).toStrictEqual([hans]);
    expect(await store.registerEntryByPublicKey(KEY_A)).toStrictEqual(hans);
    // The batch path too: a keyless row beside a keyed one, all or nothing as before.
    const batch = await store.createRegisterEntries([
      { label: "Lise" },
      { label: "radio #8", origin: "adhoc", publicKey: KEY_B },
    ]);
    expect(batch.map((entry) => entry.publicKey)).toStrictEqual([undefined, KEY_B]);
    store.close();
  });

  it("refuses a key without an origin and an origin without a key, at the store", async () => {
    const store = await openTestStore();
    await expect(
      store.createRegisterEntry({ label: "Hans", publicKey: KEY_A }),
    ).rejects.toThrow(ValidationError);
    await expect(
      store.createRegisterEntry({ label: "Grethe", origin: "issued" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      store.createRegisterEntries([{ label: "Grethe" }, { label: "Hans", publicKey: KEY_A }]),
    ).rejects.toThrow(ValidationError);
    expect(await store.allRegisterEntries()).toStrictEqual([]);
    // An edit cannot drop one of the two either.
    const hans = await createRadio7(store);
    const withoutOrigin: RegisterEntry = { ...withoutRadio(hans), publicKey: KEY_A };
    await expect(store.putRegisterEntry(withoutOrigin)).rejects.toThrow(ValidationError);
    expect(await store.getRegisterEntry(hans.id)).toStrictEqual(hans);
    store.close();
  });

  it("a contact given a radio later is a radio contact; the key is checked as for any entry", async () => {
    const store = await openTestStore();
    const grethe = await store.createRegisterEntry({ label: "Grethe", phone: "12 34 56 78" });
    await createRadio7(store);
    await expect(
      store.putRegisterEntry({ ...grethe, publicKey: KEY_A, origin: "private" }),
    ).rejects.toThrow(DuplicatePublicKeyError);
    const withRadio = await store.putRegisterEntry({ ...grethe, publicKey: KEY_B, origin: "private" });
    expect(hasRadio(withRadio)).toBe(true);
    expect(await store.registerEntryByPublicKey(KEY_B)).toStrictEqual(withRadio);
    // And the other way: the radio taken back, the key is free again.
    const back = await store.putRegisterEntry(withoutRadio(withRadio));
    expect(hasRadio(back)).toBe(false);
    expect(back).toStrictEqual({ ...grethe });
    expect(await store.registerEntryByPublicKey(KEY_B)).toBeUndefined();
    store.close();
  });

  it("the edit note says what the radio change was, and a phone change", () => {
    const grethe: RegisterEntry = {
      id: "01JB8ZK3QX9V2M4N6P8R0T2W60",
      label: "Grethe",
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
    };
    expect(registerChanges(grethe, { ...grethe, publicKey: KEY_B, origin: "private" })).toStrictEqual([
      { field: "publicKey", from: undefined, to: KEY_B },
      { field: "origin", from: undefined, to: "private" },
    ]);
    expect(registerChangeText(grethe, { ...grethe, publicKey: KEY_B, origin: "private" })).toBe(
      `register: Grethe, Public key (none) → ${KEY_B}, Origin (none) → Privately owned`,
    );
    expect(registerChangeText(grethe, { ...grethe, phone: "12 34 56 78" })).toBe(
      "register: Grethe, Phone (none) → 12 34 56 78",
    );
    expect(REGISTER_FIELDS).toContain("phone");
  });
});

describe("the register list", () => {
  it("sorts by label with numbers as numbers and case folded", () => {
    const stamp = {
      publicKey: KEY_A,
      origin: "adhoc" as const,
      createdAt: "2026-10-28T18:00:00Z",
      createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y",
    };
    const entries: RegisterEntry[] = [
      { ...stamp, id: "01JB8ZK3QX9V2M4N6P8R0T2W54", label: "radio #10" },
      { ...stamp, id: "01JB8ZK3QX9V2M4N6P8R0T2W53", label: "radio #2" },
      { ...stamp, id: "01JB8ZK3QX9V2M4N6P8R0T2W52", label: "Hans" },
      { ...stamp, id: "01JB8ZK3QX9V2M4N6P8R0T2W51", label: "anders" },
      { ...stamp, id: "01JB8ZK3QX9V2M4N6P8R0T2W50", label: "Hans" },
    ];
    const sorted = sortedByLabel(entries, "da");
    expect(sorted.map((entry) => entry.label)).toStrictEqual([
      "anders",
      "Hans",
      "Hans",
      "radio #2",
      "radio #10",
    ]);
    // Equal labels keep a stable order by id.
    expect(sorted[1]?.id).toBe("01JB8ZK3QX9V2M4N6P8R0T2W50");
    expect(sorted[2]?.id).toBe("01JB8ZK3QX9V2M4N6P8R0T2W52");
    // The input is not touched.
    expect(entries[0]?.label).toBe("radio #10");
  });
});
