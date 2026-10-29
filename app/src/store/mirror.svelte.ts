// The journal mirror (P1-04): while a journal folder is set, every successful store write is
// appended as one line to `bcentral-journal-<deviceId>.ndjson` in that folder, and every
// export file is written there too. If the laptop dies, the folder (a USB stick, a synced
// folder) has the journal, at most seconds old.
//
// The folder is a FileSystemDirectoryHandle the store keeps in `meta`; the browser keeps the
// handle across restarts but not the permission, so on start the permission is queried and,
// when it is gone, asked for again from one click (reconnect(), a user gesture). The mirror
// never touches the store's write: it listens (JournalStore.onWrite) after the transaction is
// done, queues the line and writes in order, one at a time. A write that fails leaves its
// line at the head of the queue, sets the state the top bar shows, and is tried again on the
// next write, on retry(), or after reconnect() / chooseFolder(). Nothing is lost while the
// app is open; nothing is ever silent.
//
// The folder type is generic so the app passes real handles through to the store and tests
// pass an in-memory fake; the mirror itself uses only MirrorDirectory.

import { envelopeFilename, envelopeJson } from "./export.ts";
import type { JournalStore } from "./journalStore.ts";
import {
  appendLine,
  mirrorFilename,
  mirrorLine,
  writeFile,
  type MirrorDirectory,
} from "./mirrorFile.ts";
import type { Envelope } from "./types.ts";

// off: no folder set. ready: the last write went through (or none was tried yet).
// needsPermission: the browser dropped the permission; one click re-asks. error: the last
// write failed for another reason (folder gone, disk full); shown until a write succeeds.
export type MirrorState = "off" | "ready" | "needsPermission" | "error";

export interface MirrorDeps<F extends MirrorDirectory> {
  store: () => Promise<JournalStore>;
  now: () => string;
  // The folder as the store keeps it; undefined when none is set.
  loadFolder: () => Promise<F | undefined>;
  saveFolder: (folder: F) => Promise<void>;
  clearFolder: () => Promise<void>;
  // showDirectoryPicker; undefined in a browser without the API.
  pickFolder: (() => Promise<F>) | undefined;
}

export interface Mirror {
  // Subscribes to the store and loads the folder. Writes before this are not mirrored.
  start(): Promise<void>;
  // Whether this browser can pick a folder at all.
  supported(): boolean;
  state(): MirrorState;
  folderName(): string | null;
  fileName(): string;
  // The last failure's message, in the error state; null otherwise.
  error(): string | null;
  // ISO timestamp of the last successful write to the folder this session, or null.
  lastWriteAt(): string | null;
  // Lines queued and not yet written.
  pending(): number;
  // From a user gesture: picks a folder, keeps it, writes a full export file into it as the
  // starting point, then mirrors every write from here on.
  chooseFolder(): Promise<void>;
  // From a user gesture: asks for the permission again.
  reconnect(): Promise<void>;
  // Tries the queued lines again (or, with nothing queued, reaches for the file).
  retry(): Promise<void>;
  forget(): Promise<void>;
  // Writes an export file into the folder; the file's name, or null when no folder is set or
  // the write failed (the state says so).
  writeEnvelope(envelope: Envelope): Promise<string | null>;
  // Resolves once no write is in progress; the queue is then empty or stuck. For tests.
  settled(): Promise<void>;
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMirror<F extends MirrorDirectory>(deps: MirrorDeps<F>): Mirror {
  let folder: F | undefined;
  let loaded = false;
  let state: MirrorState = $state("off");
  let name: string | null = $state(null);
  let file = $state("");
  let lastError: string | null = $state(null);
  let lastWrite: string | null = $state(null);
  let pendingCount = $state(0);

  // Lines in write order; the head is the next (or the one that just failed).
  const queue: string[] = [];
  let busy = false;
  let current: Promise<void> | undefined;

  function fail(error: unknown): void {
    if (errorName(error) === "NotAllowedError") {
      state = "needsPermission";
      lastError = null;
    } else {
      state = "error";
      lastError = describe(error);
    }
  }

  function succeeded(): void {
    state = "ready";
    lastError = null;
    lastWrite = deps.now();
  }

  // One line at a time, in order, until the queue is empty or a write fails. A write that
  // fails stays at the head. Never two loops at once: `busy` is set and cleared with no await
  // in between the last queue check and the clearing, so a line pushed while the loop runs
  // is always seen by it.
  async function drain(): Promise<void> {
    busy = true;
    try {
      while (queue.length > 0 && folder !== undefined && state !== "needsPermission") {
        const line = queue[0] as string;
        try {
          await appendLine(folder, file, line);
        } catch (error) {
          fail(error);
          return;
        }
        queue.shift();
        pendingCount = queue.length;
        succeeded();
      }
    } finally {
      busy = false;
    }
  }

  function kick(): void {
    if (!busy) {
      current = drain();
    }
  }

  async function settled(): Promise<void> {
    while (busy && current !== undefined) {
      await current;
    }
  }

  function adopt(picked: F): void {
    folder = picked;
    name = picked.name;
  }

  async function start(): Promise<void> {
    const store = await deps.store();
    file = mirrorFilename(store.deviceId);
    // Subscribed before the folder is loaded, so a write during the load is not missed; the
    // queue is dropped if the load finds no folder.
    store.onWrite((written) => {
      if (loaded && folder === undefined) {
        return;
      }
      queue.push(mirrorLine(written));
      pendingCount = queue.length;
      kick();
    });

    const stored = await deps.loadFolder();
    loaded = true;
    if (stored === undefined) {
      queue.length = 0;
      pendingCount = 0;
      state = "off";
      return;
    }
    adopt(stored);
    try {
      const permission = await stored.queryPermission({ mode: "readwrite" });
      state = permission === "granted" ? "ready" : "needsPermission";
    } catch (error) {
      fail(error);
    }
    kick();
  }

  async function writeEnvelope(envelope: Envelope): Promise<string | null> {
    if (folder === undefined) {
      return null;
    }
    const fileName = envelopeFilename(envelope);
    try {
      await writeFile(folder, fileName, envelopeJson(envelope));
    } catch (error) {
      fail(error);
      return null;
    }
    succeeded();
    return fileName;
  }

  async function chooseFolder(): Promise<void> {
    if (deps.pickFolder === undefined) {
      return;
    }
    let picked: F;
    try {
      picked = await deps.pickFolder();
    } catch (error) {
      if (errorName(error) === "AbortError") {
        // The operator closed the picker; nothing changes.
        return;
      }
      throw error;
    }
    await deps.saveFolder(picked);
    adopt(picked);
    state = "ready";
    lastError = null;
    // The starting point: everything the store holds now, as an export file. The .ndjson
    // carries what is written from here on.
    const store = await deps.store();
    await writeEnvelope(await store.exportEnvelope());
    kick();
  }

  async function reconnect(): Promise<void> {
    if (folder === undefined) {
      return;
    }
    try {
      const permission = await folder.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        state = "needsPermission";
        return;
      }
    } catch (error) {
      fail(error);
      return;
    }
    state = "ready";
    lastError = null;
    kick();
  }

  async function retry(): Promise<void> {
    if (folder === undefined) {
      return;
    }
    if (queue.length > 0) {
      kick();
      await settled();
      return;
    }
    // Nothing to write: reach for the file so the state tells the truth.
    try {
      await folder.getFileHandle(file, { create: true });
      state = "ready";
      lastError = null;
    } catch (error) {
      fail(error);
    }
  }

  async function forget(): Promise<void> {
    await deps.clearFolder();
    folder = undefined;
    name = null;
    queue.length = 0;
    pendingCount = 0;
    state = "off";
    lastError = null;
  }

  return {
    start,
    supported: () => deps.pickFolder !== undefined,
    state: () => state,
    folderName: () => name,
    fileName: () => file,
    error: () => lastError,
    lastWriteAt: () => lastWrite,
    pending: () => pendingCount,
    chooseFolder,
    reconnect,
    retry,
    forget,
    writeEnvelope,
    settled,
  };
}
