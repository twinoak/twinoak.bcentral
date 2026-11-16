// The CSV import's write (P1-06): a preview with no errors goes into the store in one
// transaction — every row a contact, with a radio or without (P3-06) — then one note is
// appended to the current incident if one is open: "register: imported N contacts from
// <file name>, n with a radio". The register write comes first, as for an edit
// (register.ts): the note describes what has happened.

import { t } from "../i18n/index.svelte.ts";
import { filenameTimestamp } from "./export.ts";
import type { JournalStore } from "./journalStore.ts";
import { hasRadio } from "./register.ts";
import type { RegisterImportPreview } from "./registerCsv.ts";
import type { JournalEntry, RegisterEntry } from "./types.ts";

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
  // The note, or null: no incident selected, or the selected one is closed.
  note: JournalEntry | null;
}

// The note's text: "register: imported 25 contacts from beboere.csv, 20 with a radio".
export function importNoteText(fileName: string, count: number, withRadio: number): string {
  return t("register.import.note", { count, file: fileName, radios: withRadio });
}

export async function importRegister(
  store: JournalStore,
  preview: RegisterImportPreview,
  context: ImportContext,
): Promise<ImportResult> {
  if (preview.errors.length > 0) {
    throw new RegisterImportError(`the file has ${preview.errors.length} errors; nothing imported`);
  }
  if (preview.entries.length === 0) {
    throw new RegisterImportError("the file has no rows");
  }
  const entries = await store.createRegisterEntries(preview.entries);
  if (context.incidentId === null || !(await store.isIncidentOpen(context.incidentId))) {
    return { entries, note: null };
  }
  const note = await store.appendEntry({
    incidentId: context.incidentId,
    operator: context.operator,
    type: "note",
    text: importNoteText(context.fileName, entries.length, entries.filter(hasRadio).length),
  });
  return { entries, note };
}

// bcentral-register-<deviceId>-<timestamp>.csv, named like the journal export.
export function registerCsvFilename(deviceId: string, exportedAt: string): string {
  return `bcentral-register-${deviceId}-${filenameTimestamp(exportedAt)}.csv`;
}
