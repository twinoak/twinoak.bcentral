// The IndexedDB layout, through idb. Four object stores: the three the contract defines, keyed
// by their ULID, and `meta` for this device's running counters, the time of the last print and
// the journal folder's directory handle (P1-04; out-of-line string keys).
// The entry indexes are the ones the journal screen and the text protocol need: by incident,
// by counterparty, by what an entry refers to, and the dedupe key (unique: the same incoming
// message is never stored twice). The register has one index, by public key, unique: one
// radio is one register entry (P0-03).

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Incident, JournalEntry, RegisterEntry } from "./types.ts";

// 1: P0-02 layout. 2: P0-03 adds the unique by-publicKey index on register.
export const DATABASE_VERSION = 2;

export const META_DEVICE_SEQ = "deviceSeq";
// ISO timestamp of the last print of the journal (P1-04: "since last print").
export const META_LAST_PRINT_AT = "lastPrintAt";
// The FileSystemDirectoryHandle of the journal folder (P1-04). A handle is structured-
// cloneable, so IndexedDB keeps it across browser restarts; the permission on it is not kept
// and is asked for again on start.
export const META_JOURNAL_FOLDER = "journalFolder";

// Per-recipient #n counter (text-protocol.md), keyed by the register entry's id.
export function metaSeqNoKey(counterpartyId: string): string {
  return `seqNo:${counterpartyId}`;
}

// What `meta` holds: the counters are numbers, the last print time a string, the journal
// folder a directory handle. Each key has one type; `counter()` reads a counter key.
export type MetaValue = number | string | FileSystemDirectoryHandle;

// A counter key's value: 0 while the key is absent. A counter key never holds anything but a
// number; anything else is treated as absent rather than silently used in arithmetic.
export function counter(value: MetaValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

export interface JournalDb extends DBSchema {
  incidents: { key: string; value: Incident };
  register: {
    key: string;
    value: RegisterEntry;
    indexes: {
      "by-publicKey": string;
    };
  };
  entries: {
    key: string;
    value: JournalEntry;
    indexes: {
      "by-incidentId": string;
      "by-counterpartyId": string;
      "by-refersTo": string;
      "by-dedupeKey": string;
    };
  };
  meta: { key: string; value: MetaValue };
}

export type JournalDatabase = IDBPDatabase<JournalDb>;

export async function openDatabase(name: string): Promise<JournalDatabase> {
  return await openDB<JournalDb>(name, DATABASE_VERSION, {
    // Runs once per browser, from whatever version is on disk (0 for a new database) up to
    // DATABASE_VERSION; each step is applied in order.
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore("incidents", { keyPath: "id" });
        db.createObjectStore("register", { keyPath: "id" });
        const entries = db.createObjectStore("entries", { keyPath: "id" });
        entries.createIndex("by-incidentId", "incidentId");
        entries.createIndex("by-counterpartyId", "counterpartyId");
        entries.createIndex("by-refersTo", "refersTo");
        entries.createIndex("by-dedupeKey", "dedupeKey", { unique: true });
        db.createObjectStore("meta");
      }
      if (oldVersion < 2) {
        tx.objectStore("register").createIndex("by-publicKey", "publicKey", { unique: true });
      }
    },
  });
}
