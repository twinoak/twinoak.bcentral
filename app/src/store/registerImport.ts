// The CSV import's write (P1-06): a preview with no errors goes into the store in one
// transaction (entries and pending rows), then one note is appended to the current incident
// if one is open: "register: imported N entries from <file name>". The register write comes
// first, as for an edit (register.ts): the note describes what has happened.

import { t } from "../i18n/index.svelte.ts";
import { filenameTimestamp } from "./export.ts";
import type { JournalStore } from "./journalStore.ts";
import type { RegisterImportPreview } from "./registerCsv.ts";
import type { JournalEntry, PendingRegisterRow, RegisterEntry } from "./types.ts";

export class RegisterImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterImportError";
  }
}

export interface ImportContext {
  operator: string;
  incidentId: string | null;
  // The file's name as chosen, for the note.
  fileName: string;
}

export interface ImportResult {
  entries: RegisterEntry[];
  pending: PendingRegisterRow[];
  // The note, or null: no incident selected, or the selected one is closed.
  note: JournalEntry | null;
}

// The note's text: "register: imported 25 entries from beboere.csv", with the pending count
// added when some rows had no key.
export function importNoteText(fileName: string, entries: number, pending: number): string {
  const count = entries + pending;
  return pending === 0
    ? t("register.import.note", { count, file: fileName })
    : t("register.import.notePending", { count, file: fileName, pending });
}

export async function importRegister(
  store: JournalStore,
  preview: RegisterImportPreview,
  context: ImportContext,
): Promise<ImportResult> {
  if (preview.errors.length > 0) {
    throw new RegisterImportError(`the file has ${preview.errors.length} errors; nothing imported`);
  }
  if (preview.entries.length === 0 && preview.pending.length === 0) {
    throw new RegisterImportError("the file has no rows");
  }
  const written = await store.importRegister(preview.entries, preview.pending);
  if (context.incidentId === null || !(await store.isIncidentOpen(context.incidentId))) {
    return { ...written, note: null };
  }
  const note = await store.appendEntry({
    incidentId: context.incidentId,
    operator: context.operator,
    type: "note",
    text: importNoteText(context.fileName, written.entries.length, written.pending.length),
  });
  return { ...written, note };
}

// bcentral-register-<deviceId>-<timestamp>.csv, named like the journal export.
export function registerCsvFilename(deviceId: string, exportedAt: string): string {
  return `bcentral-register-${deviceId}-${filenameTimestamp(exportedAt)}.csv`;
}
