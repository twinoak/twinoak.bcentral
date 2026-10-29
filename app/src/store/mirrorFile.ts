// The journal folder's files (P1-04). One append-only `.ndjson` per device: one JSON object
// per line, the kind first, then the object exactly as the store wrote it — the same shapes
// as the export envelope's three arrays. The lines read back into an envelope, so the file
// restores into a fresh store like an export does. Export files are written whole.
//
// Nothing here knows the browser: the directory is an interface the real
// FileSystemDirectoryHandle satisfies (with src/lib/file-system-access.d.ts) and a test fakes
// in memory (src/test-support/fakeDirectory.ts).

import type { Written } from "./journalStore.ts";
import { assertValid, validateEnvelope } from "./schema.ts";
import {
  ENVELOPE_FORMAT,
  ENVELOPE_VERSION,
  type Envelope,
  type Incident,
  type JournalEntry,
  type RegisterEntry,
} from "./types.ts";

// --- the directory, as much of it as the mirror uses --------------------------------------

export interface MirrorWritable {
  seek(position: number): Promise<void>;
  write(data: string): Promise<void>;
  // Commits: the browser replaces the file with what was written (an atomic swap).
  close(): Promise<void>;
  // Drops what was written; the file on disk is untouched.
  abort(): Promise<void>;
}

export interface MirrorFile {
  getFile(): Promise<{ size: number }>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<MirrorWritable>;
}

export interface MirrorDirectory {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<MirrorFile>;
  queryPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
}

// --- file names ---------------------------------------------------------------------------

// One file per device, not per incident: one file to find in a crisis (the task's lean).
export function mirrorFilename(deviceId: string): string {
  return `bcentral-journal-${deviceId}.ndjson`;
}

// --- lines --------------------------------------------------------------------------------

export const MIRROR_KINDS = ["incident", "registerEntry", "entry"] as const;
export type MirrorKind = (typeof MIRROR_KINDS)[number];

// `{"kind":"entry","id":…}`: the kind first so a human reading the file sees it at once; the
// rest is the object as stored. One line, newline-terminated.
export function mirrorLine(written: Written): string {
  return JSON.stringify({ kind: written.kind, ...written.value }) + "\n";
}

export interface MirrorContent {
  incidents: Incident[];
  register: RegisterEntry[];
  entries: JournalEntry[];
}

export class MirrorParseError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(`line ${line}: ${message}`);
    this.name = "MirrorParseError";
    this.line = line;
  }
}

function isKind(value: unknown): value is MirrorKind {
  return typeof value === "string" && (MIRROR_KINDS as readonly string[]).includes(value);
}

// The file back into the envelope's arrays, in file order. Incidents and register entries are
// mutable (put = insert or replace), so the file holds one line per write and the last line
// per id wins, in the position of the first. Entries are immutable; a repeated id (the same
// folder chosen twice, say) is the same entry and is kept once. Anything that is not a
// well-formed line of a known kind throws: nothing is guessed at.
export function parseMirror(text: string): MirrorContent {
  const incidents = new Map<string, Incident>();
  const register = new Map<string, RegisterEntry>();
  const entries = new Map<string, JournalEntry>();

  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new MirrorParseError(index + 1, error instanceof Error ? error.message : String(error));
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new MirrorParseError(index + 1, "not a JSON object");
    }
    const { kind, ...value } = parsed as { kind?: unknown; id?: unknown };
    if (!isKind(kind)) {
      throw new MirrorParseError(index + 1, `unknown kind ${JSON.stringify(kind)}`);
    }
    if (typeof value.id !== "string") {
      throw new MirrorParseError(index + 1, "no id");
    }
    switch (kind) {
      case "incident":
        incidents.set(value.id, value as unknown as Incident);
        break;
      case "registerEntry":
        register.set(value.id, value as unknown as RegisterEntry);
        break;
      case "entry":
        if (!entries.has(value.id)) {
          entries.set(value.id, value as unknown as JournalEntry);
        }
        break;
    }
  }

  return {
    incidents: [...incidents.values()],
    register: [...register.values()],
    entries: [...entries.values()],
  };
}

// The parsed file as an export envelope, validated against the contract like any envelope,
// so what re-imports is exactly what an export would be.
export function mirrorEnvelope(
  content: MirrorContent,
  deviceId: string,
  exportedAt: string,
): Envelope {
  const envelope: Envelope = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    deviceId,
    exportedAt,
    incidents: content.incidents,
    register: content.register,
    entries: content.entries,
  };
  assertValid(validateEnvelope, envelope, "envelope");
  return envelope;
}

// --- writing ------------------------------------------------------------------------------

async function abortQuietly(writable: MirrorWritable): Promise<void> {
  try {
    await writable.abort();
  } catch {
    // Already closed or errored; the file on disk is whatever it was.
  }
}

// Appends to the file, creating it when it does not exist. The existing content is kept and
// the line written after it; the file is never rewritten. close() is the commit: a browser
// killed before it leaves the old file intact, never a half line.
export async function appendLine(
  directory: MirrorDirectory,
  fileName: string,
  line: string,
): Promise<void> {
  const file = await directory.getFileHandle(fileName, { create: true });
  const size = (await file.getFile()).size;
  const writable = await file.createWritable({ keepExistingData: true });
  try {
    await writable.seek(size);
    await writable.write(line);
  } catch (error) {
    await abortQuietly(writable);
    throw error;
  }
  await writable.close();
}

// Writes the whole file (an export envelope), replacing one of the same name.
export async function writeFile(
  directory: MirrorDirectory,
  fileName: string,
  text: string,
): Promise<void> {
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(text);
  } catch (error) {
    await abortQuietly(writable);
    throw error;
  }
  await writable.close();
}
