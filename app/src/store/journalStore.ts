// The journal store: the one write path per object kind, every write validated against the
// contract schema before it is stored. Entries are append-only; there is no update or delete
// for an entry (tasks/CONVENTIONS.md). The store is a plain object over an idb database so
// tests can open it on fake-indexeddb with a fixed clock and device id.

import { monotonicFactory } from "ulid";
import type { IDBPObjectStore } from "idb";
import {
  META_DEVICE_SEQ,
  metaSeqNoKey,
  openDatabase,
  type JournalDatabase,
  type JournalDb,
} from "./db.ts";
import {
  assertValid,
  validateEnvelope,
  validateIncident,
  validateJournalEntry,
  validateRegisterEntry,
} from "./schema.ts";
import { isLater, latestStatusChange, statusOf } from "./status.ts";
import {
  ENVELOPE_FORMAT,
  ENVELOPE_VERSION,
  type Clock,
  type Envelope,
  type Incident,
  type JournalEntry,
  type NewIncident,
  type NewJournalEntry,
  type NewMessageOut,
  type NewRegisterEntry,
  type RegisterEntry,
  type Status,
} from "./types.ts";

export interface JournalStoreOptions {
  // IndexedDB database name. The app uses one; tests use a fresh name per test.
  name: string;
  // This device's id (settings); stamped on every entry as deviceId / createdOnDevice.
  deviceId: string;
  clock: Clock;
}

// Monotonic within one process: ids minted in the same millisecond still sort in creation
// order, so "time-ordered" holds for this device's own ids. Exported for the one id that is
// minted outside the store: a send-to-all's batchId (outgoing.ts, P1-01).
export const mintId = monotonicFactory();
const ulid = mintId;

// A caller may pass optional fields as `undefined`. The schema treats those as absent, but
// IndexedDB would keep the key and JSON would drop it, so strip them before validating: what
// is validated is exactly what is stored and exported.
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as unknown as T;
}

// idb creates a transaction's `done` promise eagerly with no handler on it, so a transaction
// that is abandoned after an error must be aborted and its `done` awaited, or the rejection
// surfaces as unhandled.
async function abortQuietly(tx: { abort(): void; done: Promise<void> }): Promise<void> {
  try {
    tx.abort();
  } catch {
    // Already finished or aborting; nothing to do.
  }
  try {
    await tx.done;
  } catch {
    // Aborted on purpose.
  }
}

// Thrown by the register write paths when another entry already holds the public key. One
// radio is one register entry; a key is never shared (P0-03). The unique by-publicKey index
// is the second line of defence behind this check.
export class DuplicatePublicKeyError extends Error {
  readonly publicKey: string;
  readonly existingId: string;

  constructor(publicKey: string, existingId: string) {
    super(`register entry ${existingId} already has public key ${publicKey}`);
    this.name = "DuplicatePublicKeyError";
    this.publicKey = publicKey;
    this.existingId = existingId;
  }
}

type RegisterWriteStore = IDBPObjectStore<JournalDb, ["register"], "register", "readwrite">;
type EntriesWriteStore = IDBPObjectStore<JournalDb, ("entries" | "meta")[], "entries", "readwrite">;
type MetaWriteStore = IDBPObjectStore<JournalDb, ("entries" | "meta")[], "meta", "readwrite">;

// Inside the write transaction, so a concurrent write cannot slip in between check and put.
async function assertPublicKeyFree(register: RegisterWriteStore, entry: RegisterEntry): Promise<void> {
  const holder = await register.index("by-publicKey").get(entry.publicKey);
  if (holder !== undefined && holder.id !== entry.id) {
    throw new DuplicatePublicKeyError(entry.publicKey, holder.id);
  }
}

export class JournalStore {
  readonly deviceId: string;
  readonly clock: Clock;
  private readonly db: JournalDatabase;

  constructor(db: JournalDatabase, options: JournalStoreOptions) {
    this.db = db;
    this.deviceId = options.deviceId;
    this.clock = options.clock;
  }

  close(): void {
    this.db.close();
  }

  // --- entries -------------------------------------------------------------------------

  // The single write path for journal entries. Assigns id (ULID), deviceId, deviceSeq
  // (gap-free, from meta, in the same transaction as the write), timestamp and clockTrust;
  // validates; stores. A message_in whose dedupeKey is already stored is not stored again:
  // the existing entry is returned instead.
  async appendEntry(input: NewJournalEntry): Promise<JournalEntry> {
    const reading = this.clock();
    const tx = this.db.transaction(["entries", "meta"], "readwrite");
    try {
      const entries = tx.objectStore("entries");
      const meta = tx.objectStore("meta");

      if (input.type === "message_in" && input.dedupeKey !== undefined) {
        const existing = await entries.index("by-dedupeKey").get(input.dedupeKey);
        if (existing !== undefined) {
          await tx.done;
          return existing;
        }
      }

      const entry = await this.writeEntry(entries, meta, input, reading.timestamp, reading.clockTrust);
      await tx.done;
      return entry;
    } catch (error) {
      await abortQuietly(tx);
      throw error;
    }
  }

  // A message_out with the recipient's next #n, reserved and stored in one transaction
  // (P0-05): the counter is read, `compose(n)` builds the text ("#n <text>"), the entry is
  // validated and stored, and the counter moves to n. If compose throws (the text would be
  // over the 160-byte limit), the transaction is aborted and the counter is untouched, so a
  // refused send never leaves a gap in n (text-protocol.md: increments by 1, never reused).
  async appendMessageOut(input: NewMessageOut, compose: (seqNo: number) => string): Promise<JournalEntry> {
    const reading = this.clock();
    const tx = this.db.transaction(["entries", "meta"], "readwrite");
    try {
      const meta = tx.objectStore("meta");
      const seqNo = ((await meta.get(metaSeqNoKey(input.counterpartyId))) ?? 0) + 1;
      const text = compose(seqNo);
      const entry = await this.writeEntry(
        tx.objectStore("entries"),
        meta,
        { ...input, type: "message_out", seqNo, text },
        reading.timestamp,
        reading.clockTrust,
      );
      await tx.done;
      return entry;
    } catch (error) {
      await abortQuietly(tx);
      throw error;
    }
  }

  // The body shared by appendEntry and appendMessageOut, inside the caller's transaction:
  // assigns id, deviceId, deviceSeq (gap-free, from meta), timestamp and clockTrust;
  // validates; stores; moves the counters.
  private async writeEntry(
    entries: EntriesWriteStore,
    meta: MetaWriteStore,
    input: NewJournalEntry,
    timestamp: string,
    clockTrust: JournalEntry["clockTrust"],
  ): Promise<JournalEntry> {
    const deviceSeq = ((await meta.get(META_DEVICE_SEQ)) ?? 0) + 1;
    const entry = withoutUndefined({
      ...input,
      id: ulid(),
      deviceId: this.deviceId,
      deviceSeq,
      timestamp,
      clockTrust,
    });
    assertValid(validateJournalEntry, entry, "journalEntry");

    await entries.add(entry);
    await meta.put(deviceSeq, META_DEVICE_SEQ);

    // The per-recipient #n counter never falls behind what was actually sent, whoever
    // assigned the number (text-protocol.md: never reused, never reset).
    if (entry.type === "message_out" && entry.counterpartyId !== undefined && entry.seqNo !== undefined) {
      const key = metaSeqNoKey(entry.counterpartyId);
      const current = (await meta.get(key)) ?? 0;
      if (entry.seqNo > current) {
        await meta.put(entry.seqNo, key);
      }
    }
    return entry;
  }

  async getEntry(id: string): Promise<JournalEntry | undefined> {
    return await this.db.get("entries", id);
  }

  // All entries in id order (ULIDs, so time-ordered per device).
  async allEntries(): Promise<JournalEntry[]> {
    return await this.db.getAll("entries");
  }

  async entriesForIncident(incidentId: string): Promise<JournalEntry[]> {
    return await this.db.getAllFromIndex("entries", "by-incidentId", incidentId);
  }

  async entriesForCounterparty(counterpartyId: string): Promise<JournalEntry[]> {
    return await this.db.getAllFromIndex("entries", "by-counterpartyId", counterpartyId);
  }

  async entriesReferringTo(id: string): Promise<JournalEntry[]> {
    return await this.db.getAllFromIndex("entries", "by-refersTo", id);
  }

  async entryByDedupeKey(dedupeKey: string): Promise<JournalEntry | undefined> {
    return await this.db.getFromIndex("entries", "by-dedupeKey", dedupeKey);
  }

  // Derived status of an outgoing message: see status.ts.
  async statusOf(messageOutId: string): Promise<Status> {
    return statusOf(await this.entriesReferringTo(messageOutId), messageOutId);
  }

  // When this register entry was last heard from: the timestamp of the latest message_in
  // whose counterparty it is (P0-06), or null when none. Derived on every call; nothing is
  // stored on the register entry.
  async lastHeardAt(counterpartyId: string): Promise<string | null> {
    let latest: JournalEntry | undefined;
    for (const entry of await this.entriesForCounterparty(counterpartyId)) {
      if (entry.type !== "message_in") {
        continue;
      }
      if (latest === undefined || isLater(entry, latest)) {
        latest = entry;
      }
    }
    return latest?.timestamp ?? null;
  }

  // --- counters (meta) -----------------------------------------------------------------

  async lastDeviceSeq(): Promise<number> {
    return (await this.db.get("meta", META_DEVICE_SEQ)) ?? 0;
  }

  // The highest #n used for this recipient from this device, 0 when none.
  async lastSeqNo(counterpartyId: string): Promise<number> {
    return (await this.db.get("meta", metaSeqNoKey(counterpartyId))) ?? 0;
  }

  // Reserves the next #n for this recipient. Atomic on the meta store: two callers never get
  // the same number. The caller puts it in a message_out (P0-05 owns that flow).
  async nextSeqNo(counterpartyId: string): Promise<number> {
    const key = metaSeqNoKey(counterpartyId);
    const tx = this.db.transaction("meta", "readwrite");
    const next = ((await tx.store.get(key)) ?? 0) + 1;
    await tx.store.put(next, key);
    await tx.done;
    return next;
  }

  // --- incidents -----------------------------------------------------------------------

  // The single write path for incidents: validate, then put (insert or replace by id).
  async putIncident(incident: Incident): Promise<Incident> {
    const value = withoutUndefined(incident);
    assertValid(validateIncident, value, "incident");
    await this.db.put("incidents", value);
    return value;
  }

  async createIncident(input: NewIncident): Promise<Incident> {
    const reading = this.clock();
    return await this.putIncident({
      ...input,
      id: ulid(),
      createdAt: reading.timestamp,
      clockTrust: reading.clockTrust,
      createdOnDevice: this.deviceId,
    });
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return await this.db.get("incidents", id);
  }

  async allIncidents(): Promise<Incident[]> {
    return await this.db.getAll("incidents");
  }

  // An incident is open when it exists and its latest status_change (text-protocol.md: the
  // latest one wins) is not `closed`; an incident with no status_change yet is open.
  async isIncidentOpen(incidentId: string): Promise<boolean> {
    const incident = await this.getIncident(incidentId);
    if (incident === undefined) {
      return false;
    }
    const latest = latestStatusChange(await this.entriesReferringTo(incidentId), incidentId);
    return latest === undefined || latest.newStatus !== "closed";
  }

  // --- register ------------------------------------------------------------------------

  // The single write path for register entries: validate, check that no other entry holds
  // the public key, then put (insert or replace by id). Register entries are mutable; the
  // journal note about an edit is the caller's business (register.ts).
  async putRegisterEntry(entry: RegisterEntry): Promise<RegisterEntry> {
    const value = withoutUndefined(entry);
    assertValid(validateRegisterEntry, value, "registerEntry");
    const tx = this.db.transaction("register", "readwrite");
    try {
      await assertPublicKeyFree(tx.store, value);
      await tx.store.put(value);
      await tx.done;
      return value;
    } catch (error) {
      await abortQuietly(tx);
      throw error;
    }
  }

  async createRegisterEntry(input: NewRegisterEntry): Promise<RegisterEntry> {
    const reading = this.clock();
    return await this.putRegisterEntry({
      ...input,
      id: ulid(),
      createdAt: reading.timestamp,
      createdOnDevice: this.deviceId,
    });
  }

  // Several new entries in one transaction, all or nothing: the ad hoc batch ("radio #1" …
  // "radio #N"). A key that is invalid, already in the register or repeated within the batch
  // leaves the store untouched. Returns the entries in input order.
  async createRegisterEntries(inputs: readonly NewRegisterEntry[]): Promise<RegisterEntry[]> {
    const values: RegisterEntry[] = [];
    for (const input of inputs) {
      const reading = this.clock();
      const value = withoutUndefined({
        ...input,
        id: ulid(),
        createdAt: reading.timestamp,
        createdOnDevice: this.deviceId,
      });
      assertValid(validateRegisterEntry, value, "registerEntry");
      values.push(value);
    }

    const tx = this.db.transaction("register", "readwrite");
    try {
      for (const value of values) {
        // Earlier adds in this transaction are visible here, so a key repeated within the
        // batch is caught by the same check as one already in the store.
        await assertPublicKeyFree(tx.store, value);
        await tx.store.add(value);
      }
      await tx.done;
      return values;
    } catch (error) {
      await abortQuietly(tx);
      throw error;
    }
  }

  async registerEntryByPublicKey(publicKey: string): Promise<RegisterEntry | undefined> {
    return await this.db.getFromIndex("register", "by-publicKey", publicKey);
  }

  async getRegisterEntry(id: string): Promise<RegisterEntry | undefined> {
    return await this.db.get("register", id);
  }

  async allRegisterEntries(): Promise<RegisterEntry[]> {
    return await this.db.getAll("register");
  }

  // --- envelope ------------------------------------------------------------------------

  // The export file's content: the schema's envelope around everything in the store, read
  // in one transaction, validated before it is handed out.
  async exportEnvelope(): Promise<Envelope> {
    const tx = this.db.transaction(["incidents", "register", "entries"], "readonly");
    const incidents = await tx.objectStore("incidents").getAll();
    const register = await tx.objectStore("register").getAll();
    const entries = await tx.objectStore("entries").getAll();
    await tx.done;

    const envelope: Envelope = {
      format: ENVELOPE_FORMAT,
      version: ENVELOPE_VERSION,
      deviceId: this.deviceId,
      exportedAt: this.clock().timestamp,
      incidents,
      register,
      entries,
    };
    assertValid(validateEnvelope, envelope, "envelope");
    return envelope;
  }

  // Loads an envelope as it is: ids, deviceSeq and timestamps are kept, nothing is assigned.
  // Used only by tests for now (round-trip of contract/examples/walkthrough.json); a later
  // phase may build restore/merge on it. All or nothing: the envelope is validated first and
  // written in one transaction, so a duplicate id or dedupeKey leaves the store untouched.
  // The device's own counters catch up with the highest deviceSeq / seqNo among its entries.
  async importEnvelope(envelope: Envelope): Promise<void> {
    assertValid(validateEnvelope, envelope, "envelope");
    const tx = this.db.transaction(["incidents", "register", "entries", "meta"], "readwrite");
    try {
      for (const incident of envelope.incidents) {
        await tx.objectStore("incidents").put(incident);
      }
      for (const entry of envelope.register) {
        await tx.objectStore("register").put(entry);
      }
      for (const entry of envelope.entries) {
        await tx.objectStore("entries").add(entry);
      }

      const meta = tx.objectStore("meta");
      let deviceSeq = (await meta.get(META_DEVICE_SEQ)) ?? 0;
      const seqNos = new Map<string, number>();
      for (const entry of envelope.entries) {
        if (entry.deviceId !== this.deviceId) {
          continue;
        }
        deviceSeq = Math.max(deviceSeq, entry.deviceSeq);
        if (entry.type === "message_out" && entry.counterpartyId !== undefined && entry.seqNo !== undefined) {
          const seen = seqNos.get(entry.counterpartyId) ?? 0;
          seqNos.set(entry.counterpartyId, Math.max(seen, entry.seqNo));
        }
      }
      await meta.put(deviceSeq, META_DEVICE_SEQ);
      for (const [counterpartyId, seqNo] of seqNos) {
        const key = metaSeqNoKey(counterpartyId);
        const current = (await meta.get(key)) ?? 0;
        if (seqNo > current) {
          await meta.put(seqNo, key);
        }
      }

      await tx.done;
    } catch (error) {
      await abortQuietly(tx);
      throw error;
    }
  }
}

export async function openJournalStore(options: JournalStoreOptions): Promise<JournalStore> {
  const db = await openDatabase(options.name);
  return new JournalStore(db, options);
}
