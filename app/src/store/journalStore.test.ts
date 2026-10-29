import { describe, expect, it } from "vitest";
import {
  openTestStore,
  steppingClock,
  TEST_CLOCK_START,
  TEST_DEVICE_ID,
  uniqueDatabaseName,
} from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { dedupeKey } from "./dedupeKey.ts";
import { validateEnvelope, ValidationError } from "./schema.ts";
import type { JournalEntry, NewJournalEntry } from "./types.ts";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const HANS = "01JB8ZK3QX9V2M4N6P8R0T2W50";
const PETER = "01JB8ZK3QX9V2M4N6P8R0T2W70";
const HANS_KEY = "7a".repeat(32);

function note(text: string): NewJournalEntry {
  return { incidentId: INCIDENT, operator: "Thomas", type: "note", text };
}

function messageOut(counterpartyId: string, seqNo: number, text: string): NewJournalEntry {
  return {
    incidentId: INCIDENT,
    operator: "Thomas",
    type: "message_out",
    transport: "mesh",
    counterpartyId,
    seqNo,
    text,
  };
}

function messageIn(text: string, key: string): NewJournalEntry {
  return {
    incidentId: INCIDENT,
    operator: "Thomas",
    type: "message_in",
    transport: "mesh",
    counterpartyId: HANS,
    text,
    dedupeKey: key,
  };
}

function statusChange(refersTo: string, newStatus: JournalEntry["newStatus"]): NewJournalEntry {
  return { incidentId: INCIDENT, operator: "Thomas", type: "status_change", refersTo, newStatus };
}

describe("round trip of contract/examples/walkthrough.json", () => {
  it("import, export, validate: identical incidents, register and entries", async () => {
    const walkthrough = loadWalkthrough();
    const store = await openTestStore({
      deviceId: walkthrough.deviceId,
      clock: steppingClock(Date.parse(walkthrough.exportedAt)),
    });
    await store.importEnvelope(walkthrough);

    const exported = await store.exportEnvelope();
    expect(validateEnvelope(exported)).toBe(true);
    expect(exported.format).toBe("bcentral-journal");
    expect(exported.version).toBe(1);
    expect(exported.deviceId).toBe(walkthrough.deviceId);
    expect(exported.incidents).toStrictEqual(walkthrough.incidents);
    expect(exported.register).toStrictEqual(walkthrough.register);
    expect(exported.entries).toStrictEqual(walkthrough.entries);

    // The file on disk is the same thing again.
    const reparsed = JSON.parse(JSON.stringify(exported)) as typeof exported;
    expect(validateEnvelope(reparsed)).toBe(true);
    expect(reparsed.entries).toStrictEqual(walkthrough.entries);
    store.close();
  });

  it("the walkthrough's own counters are picked up for this device", async () => {
    const walkthrough = loadWalkthrough();
    const store = await openTestStore({ deviceId: walkthrough.deviceId });
    await store.importEnvelope(walkthrough);
    expect(await store.lastDeviceSeq()).toBe(13);
    expect(await store.lastSeqNo(HANS)).toBe(2);

    const next = await store.appendEntry(note("after import"));
    expect(next.deviceSeq).toBe(14);
    expect(await store.nextSeqNo(HANS)).toBe(3);
    store.close();
  });

  it("another device's entries do not move this device's counters", async () => {
    const walkthrough = loadWalkthrough();
    const store = await openTestStore({ deviceId: "01JB8ZK3QX9V2M4N6P8R0T2W00" });
    await store.importEnvelope(walkthrough);
    expect(await store.lastDeviceSeq()).toBe(0);
    expect(await store.lastSeqNo(HANS)).toBe(0);
    expect((await store.allEntries()).length).toBe(13);
    store.close();
  });

  it("is all or nothing: importing the same envelope twice leaves the store as it was", async () => {
    const walkthrough = loadWalkthrough();
    const store = await openTestStore({ deviceId: walkthrough.deviceId });
    await store.importEnvelope(walkthrough);
    await expect(store.importEnvelope(walkthrough)).rejects.toThrow();
    expect((await store.allEntries()).length).toBe(13);
    expect(await store.lastDeviceSeq()).toBe(13);
    store.close();
  });

  it("rejects an envelope that does not validate, before writing anything", async () => {
    const walkthrough = loadWalkthrough();
    const broken = { ...walkthrough, entries: [{ ...walkthrough.entries[0], deviceSeq: 0 }] };
    const store = await openTestStore({ deviceId: walkthrough.deviceId });
    await expect(store.importEnvelope(broken as unknown as typeof walkthrough)).rejects.toThrow(
      ValidationError,
    );
    expect(await store.allIncidents()).toStrictEqual([]);
    expect(await store.allEntries()).toStrictEqual([]);
    store.close();
  });
});

describe("appendEntry", () => {
  it("assigns id, deviceId, deviceSeq, timestamp and clockTrust", async () => {
    const store = await openTestStore();
    const first = await store.appendEntry(note("one"));
    const second = await store.appendEntry(note("two"));

    expect(first.id).toMatch(ULID);
    expect(second.id).toMatch(ULID);
    expect(second.id > first.id).toBe(true);
    expect(first.deviceId).toBe(TEST_DEVICE_ID);
    expect(first.deviceSeq).toBe(1);
    expect(second.deviceSeq).toBe(2);
    expect(first.timestamp).toBe(new Date(TEST_CLOCK_START).toISOString());
    expect(second.timestamp).toBe(new Date(TEST_CLOCK_START + 1000).toISOString());
    expect(first.clockTrust).toBe("manual");
    expect(first).toMatchObject({ incidentId: INCIDENT, operator: "Thomas", type: "note", text: "one" });

    expect(await store.getEntry(first.id)).toStrictEqual(first);
    expect(await store.allEntries()).toStrictEqual([first, second]);
    store.close();
  });

  it("takes the clock trust from the clock at the time of the write", async () => {
    const store = await openTestStore({ clock: steppingClock(TEST_CLOCK_START, "unknown") });
    const entry = await store.appendEntry(note("x"));
    expect(entry.clockTrust).toBe("unknown");
    store.close();
  });

  it("does not store optional fields passed as undefined", async () => {
    const store = await openTestStore();
    const entry = await store.appendEntry({ ...note("x"), refersTo: undefined, counterpartyId: undefined });
    expect("refersTo" in entry).toBe(false);
    expect("counterpartyId" in entry).toBe(false);
    const stored = await store.getEntry(entry.id);
    expect(stored).toBeDefined();
    expect(stored !== undefined && "refersTo" in stored).toBe(false);
    store.close();
  });

  it("deviceSeq is gap-free across 1,000 appends, including a restart", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    for (let i = 1; i <= 500; i += 1) {
      await first.appendEntry(note(`note ${i}`));
    }
    first.close();

    // A new store instance on the same database is the app after a browser restart.
    const second = await openTestStore({ name });
    expect(await second.lastDeviceSeq()).toBe(500);
    for (let i = 501; i <= 1000; i += 1) {
      await second.appendEntry(note(`note ${i}`));
    }

    const entries = await second.allEntries();
    expect(entries.length).toBe(1000);
    const seqs = entries.map((entry) => entry.deviceSeq).sort((a, b) => a - b);
    expect(seqs).toStrictEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
    expect(await second.lastDeviceSeq()).toBe(1000);
    second.close();
  }, 120_000);

  it("gives concurrent appends distinct, consecutive deviceSeq values", async () => {
    const store = await openTestStore();
    const pending: Promise<JournalEntry>[] = [];
    for (let i = 1; i <= 25; i += 1) {
      pending.push(store.appendEntry(note(`note ${i}`)));
    }
    const seqs: number[] = [];
    for (const entry of pending) {
      seqs.push((await entry).deviceSeq);
    }
    expect([...seqs].sort((a, b) => a - b)).toStrictEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    store.close();
  });

  it("stores nothing and keeps deviceSeq when validation fails", async () => {
    const store = await openTestStore();
    await store.appendEntry(note("before"));

    const invalid: NewJournalEntry[] = [
      // message_out without seqNo
      { incidentId: INCIDENT, operator: "Thomas", type: "message_out", transport: "mesh", counterpartyId: HANS, text: "#1 x" },
      // message_in over mesh without dedupeKey
      { incidentId: INCIDENT, operator: "Thomas", type: "message_in", transport: "mesh", counterpartyId: HANS, text: "R1" },
      // status_change with a counterparty
      { ...statusChange(INCIDENT, "closed"), counterpartyId: HANS },
      // note with a status
      { ...note("x"), newStatus: "sent" },
      // empty operator
      { ...note("x"), operator: "" },
      // incidentId that is not a ULID
      { ...note("x"), incidentId: "incident-1" },
      // a property the schema does not know
      { ...note("x"), extra: 1 } as unknown as NewJournalEntry,
      // a status the chain does not know
      { ...statusChange(INCIDENT, "closed"), newStatus: "lost" } as unknown as NewJournalEntry,
    ];
    for (const input of invalid) {
      await expect(store.appendEntry(input)).rejects.toThrow(ValidationError);
    }

    const entries = await store.allEntries();
    expect(entries.length).toBe(1);
    expect(await store.lastDeviceSeq()).toBe(1);
    const after = await store.appendEntry(note("after"));
    expect(after.deviceSeq).toBe(2);
    store.close();
  });

  it("a second message_in with the same dedupeKey returns the first and stores nothing", async () => {
    const store = await openTestStore();
    const key = await dedupeKey(HANS_KEY, 1793214220, "R1");
    const first = await store.appendEntry(messageIn("R1", key));
    const again = await store.appendEntry(messageIn("R1", key));
    expect(again).toStrictEqual(first);
    expect((await store.allEntries()).length).toBe(1);
    expect(await store.lastDeviceSeq()).toBe(1);
    expect(await store.entryByDedupeKey(key)).toStrictEqual(first);

    const other = await store.appendEntry(messageIn("R1", await dedupeKey(HANS_KEY, 1793214221, "R1")));
    expect(other.id).not.toBe(first.id);
    expect(other.deviceSeq).toBe(2);
    store.close();
  });

  it("keeps the per-recipient #n counter at the highest seqNo sent", async () => {
    const store = await openTestStore();
    expect(await store.lastSeqNo(HANS)).toBe(0);
    expect(await store.nextSeqNo(HANS)).toBe(1);
    await store.appendEntry(messageOut(HANS, 1, "#1 Meld status"));
    expect(await store.lastSeqNo(HANS)).toBe(1);
    expect(await store.nextSeqNo(HANS)).toBe(2);
    await store.appendEntry(messageOut(HANS, 2, "#2 Pumpe på vej"));
    await store.appendEntry(messageOut(HANS, 5, "#5 out of order"));
    expect(await store.lastSeqNo(HANS)).toBe(5);
    expect(await store.nextSeqNo(HANS)).toBe(6);
    // Another recipient counts on its own.
    expect(await store.lastSeqNo(PETER)).toBe(0);
    expect(await store.nextSeqNo(PETER)).toBe(1);
    expect(await store.lastSeqNo(HANS)).toBe(6);
    store.close();
  });

  it("the #n counter survives a restart", async () => {
    const name = uniqueDatabaseName();
    const first = await openTestStore({ name });
    expect(await first.nextSeqNo(HANS)).toBe(1);
    expect(await first.nextSeqNo(HANS)).toBe(2);
    first.close();
    const second = await openTestStore({ name });
    expect(await second.nextSeqNo(HANS)).toBe(3);
    second.close();
  });
});

describe("queries", () => {
  it("finds entries by incident, counterparty and refersTo, and derives status", async () => {
    const store = await openTestStore();
    const out = await store.appendEntry(messageOut(HANS, 1, "#1 Meld status"));
    expect(await store.statusOf(out.id)).toBe("pending");
    const sent = await store.appendEntry(statusChange(out.id, "sent"));
    expect(await store.statusOf(out.id)).toBe("sent");
    const delivered = await store.appendEntry(statusChange(out.id, "delivered"));
    expect(await store.statusOf(out.id)).toBe("delivered");
    const inbound = await store.appendEntry(messageIn("R1", await dedupeKey(HANS_KEY, 1793214220, "R1")));
    const roger = await store.appendEntry({ ...statusChange(out.id, "roger"), text: inbound.id });
    expect(await store.statusOf(out.id)).toBe("roger");
    const aside = await store.appendEntry(note("phone call"));

    expect(await store.entriesForIncident(INCIDENT)).toStrictEqual([out, sent, delivered, inbound, roger, aside]);
    expect(await store.entriesForIncident("01JB8ZK3QX9V2M4N6P8R0T2W99")).toStrictEqual([]);
    expect(await store.entriesForCounterparty(HANS)).toStrictEqual([out, inbound]);
    expect(await store.entriesReferringTo(out.id)).toStrictEqual([sent, delivered, roger]);
    expect(await store.entriesReferringTo(aside.id)).toStrictEqual([]);
    store.close();
  });
});

describe("incidents and register", () => {
  it("createIncident stamps id, createdAt, clockTrust and createdOnDevice", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    expect(incident.id).toMatch(ULID);
    expect(incident.createdAt).toBe(new Date(TEST_CLOCK_START).toISOString());
    expect(incident.clockTrust).toBe("manual");
    expect(incident.createdOnDevice).toBe(TEST_DEVICE_ID);
    expect("drill" in incident).toBe(false);
    expect(await store.getIncident(incident.id)).toStrictEqual(incident);
    expect(await store.allIncidents()).toStrictEqual([incident]);
    store.close();
  });

  it("putIncident validates and replaces by id", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    await store.putIncident({ ...incident, name: "Strømsvigt 28. oktober", drill: true });
    expect(await store.getIncident(incident.id)).toStrictEqual({
      ...incident,
      name: "Strømsvigt 28. oktober",
      drill: true,
    });
    await expect(store.putIncident({ ...incident, name: "" })).rejects.toThrow(ValidationError);
    await expect(store.createIncident({ name: "", createdBy: "Thomas" })).rejects.toThrow(ValidationError);
    expect((await store.allIncidents()).length).toBe(1);
    store.close();
  });

  it("createRegisterEntry and putRegisterEntry validate and store", async () => {
    const store = await openTestStore();
    const entry = await store.createRegisterEntry({
      publicKey: HANS_KEY,
      label: "Hans",
      origin: "adhoc",
      street: "Nørregade",
    });
    expect(entry.id).toMatch(ULID);
    expect(entry.createdAt).toBe(new Date(TEST_CLOCK_START).toISOString());
    expect(entry.createdOnDevice).toBe(TEST_DEVICE_ID);
    expect(await store.getRegisterEntry(entry.id)).toStrictEqual(entry);

    await store.putRegisterEntry({ ...entry, person: "Hans Jensen" });
    expect(await store.getRegisterEntry(entry.id)).toStrictEqual({ ...entry, person: "Hans Jensen" });

    await expect(store.putRegisterEntry({ ...entry, publicKey: HANS_KEY.toUpperCase() })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      store.createRegisterEntry({ publicKey: "7a", label: "x", origin: "issued" }),
    ).rejects.toThrow(ValidationError);
    expect((await store.allRegisterEntries()).length).toBe(1);
    store.close();
  });

  it("exportEnvelope is validated and stamped with the device and the clock", async () => {
    const store = await openTestStore();
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const entry = await store.appendEntry(note("x"));
    const envelope = await store.exportEnvelope();
    expect(validateEnvelope(envelope)).toBe(true);
    expect(envelope.deviceId).toBe(TEST_DEVICE_ID);
    expect(envelope.exportedAt).toBe(new Date(TEST_CLOCK_START + 2000).toISOString());
    expect(envelope.incidents).toStrictEqual([incident]);
    expect(envelope.register).toStrictEqual([]);
    expect(envelope.entries).toStrictEqual([entry]);
    store.close();
  });
});

describe("onWrite (P1-04)", () => {
  it("tells a listener about every successful write, after it, with the value as stored", async () => {
    const store = await openTestStore();
    const seen: string[] = [];
    const off = store.onWrite((written) => {
      seen.push(`${written.kind}:${written.value.id}`);
    });
    const incident = await store.createIncident({ name: "Strømsvigt", createdBy: "Thomas" });
    const hans = await store.createRegisterEntry({ publicKey: HANS_KEY, label: "Hans", origin: "adhoc" });
    const entry = await store.appendEntry(note("x"));
    const order = await store.appendMessageOut(
      { incidentId: INCIDENT, operator: "Thomas", transport: "mesh", counterpartyId: hans.id },
      (n) => `#${n} x`,
    );
    expect(seen).toEqual([
      `incident:${incident.id}`,
      `registerEntry:${hans.id}`,
      `entry:${entry.id}`,
      `entry:${order.id}`,
    ]);

    // A refused write is no notification; a deduplicated message_in is none either.
    await expect(store.appendEntry({ ...note("y"), type: "shout" as "note" })).rejects.toThrow();
    const incoming = await store.appendEntry(messageIn("R1", "ab".repeat(32)));
    await store.appendEntry(messageIn("R1", "ab".repeat(32)));
    expect(seen.slice(4)).toEqual([`entry:${incoming.id}`]);

    // A listener that throws does not fail the write; unsubscribing stops the calls.
    store.onWrite(() => {
      throw new Error("listener broke");
    });
    await store.appendEntry(note("z"));
    expect(seen).toHaveLength(6);
    off();
    await store.appendEntry(note("w"));
    expect(seen).toHaveLength(6);
    store.close();
  });
});

describe("print time and journal folder in meta (P1-04)", () => {
  it("the last print time is null until recorded and moves only when recorded", async () => {
    const store = await openTestStore();
    expect(await store.lastPrintAt()).toBeNull();
    await store.appendEntry(note("x"));
    expect(await store.lastPrintAt()).toBeNull();
    await store.recordPrint("2026-10-29T10:00:00.000Z");
    expect(await store.lastPrintAt()).toBe("2026-10-29T10:00:00.000Z");
    await store.recordPrint("2026-10-29T11:00:00.000Z");
    expect(await store.lastPrintAt()).toBe("2026-10-29T11:00:00.000Z");
    // The counters are untouched by the other meta keys.
    expect(await store.lastDeviceSeq()).toBe(1);
    store.close();
  });

  it("the journal folder is absent until set and gone after clearing", async () => {
    const store = await openTestStore();
    expect(await store.journalFolder()).toBeUndefined();
    // A structured-cloneable stand-in for a directory handle (fake-indexeddb clones values).
    const handle = { kind: "directory", name: "usb" } as unknown as FileSystemDirectoryHandle;
    await store.setJournalFolder(handle);
    expect(await store.journalFolder()).toEqual({ kind: "directory", name: "usb" });
    await store.clearJournalFolder();
    expect(await store.journalFolder()).toBeUndefined();
    expect(await store.lastPrintAt()).toBeNull();
    store.close();
  });
});
