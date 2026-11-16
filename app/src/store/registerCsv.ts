// The register as a CSV file (P1-06): the association's resident list in, the register out.
// Pure functions over text; the store write is registerImport.ts's importRegister.
//
// Import: columns matched by header name, case-insensitive, in any order; `label` required,
// the rest optional. Separator `;` or `,`, decided by the header line; UTF-8 with or without
// a BOM; CRLF or LF; fields may be quoted the way Excel quotes them ("" for a quote inside).
// Nothing fuzzy: an unknown header, a bad origin, a bad key, a duplicate key (within the file
// or against the register), an origin on a row without a key and a wrong field count are
// each an error naming the line, and nothing is written while there is one. A row without a
// key is a contact without a radio (P3-06): `origin` is read only with a `publicKey`, and
// empty means `issued` then. A line with nothing in it is not a row.
//
// Export: the same columns, `;`, a BOM (Danish Excel opens it without a dialog), CRLF, one
// row per register entry; a contact without a radio has an empty key and an empty origin.

import { t } from "../i18n/index.svelte.ts";
import { isValidPublicKey, normalizePublicKey, REGISTER_ORIGINS } from "./register.ts";
import type { NewRegisterEntry, RegisterEntry, RegisterOrigin } from "./types.ts";

export const CSV_COLUMNS = [
  "label",
  "person",
  "street",
  "role",
  "phone",
  "origin",
  "publicKey",
  "notes",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvSeparator = ";" | ",";

export const BOM = "﻿";

export type CsvError =
  // File level: nothing is read past these.
  | { kind: "empty" }
  | { kind: "unterminatedQuote"; line: number }
  | { kind: "emptyHeader"; column: number }
  | { kind: "unknownHeader"; column: number; name: string }
  | { kind: "duplicateHeader"; column: number; name: string }
  | { kind: "missingLabelHeader" }
  // Row level: the line the record starts on.
  | { kind: "fieldCount"; line: number; found: number; expected: number }
  | { kind: "labelMissing"; line: number }
  | { kind: "badOrigin"; line: number; value: string }
  // An origin on a row without a key: the origin is the radio's (P3-06).
  | { kind: "originWithoutKey"; line: number; value: string }
  | { kind: "badKey"; line: number; value: string }
  | { kind: "duplicateKeyInFile"; line: number; otherLine: number; publicKey: string }
  | { kind: "duplicateKeyInStore"; line: number; label: string; publicKey: string };

export function csvErrorText(error: CsvError): string {
  switch (error.kind) {
    case "empty":
      return t("register.import.error.empty");
    case "unterminatedQuote":
      return t("register.import.error.unterminatedQuote", { line: error.line });
    case "emptyHeader":
      return t("register.import.error.emptyHeader", { column: error.column });
    case "unknownHeader":
      return t("register.import.error.unknownHeader", {
        column: error.column,
        name: error.name,
        allowed: CSV_COLUMNS.join(", "),
      });
    case "duplicateHeader":
      return t("register.import.error.duplicateHeader", { column: error.column, name: error.name });
    case "missingLabelHeader":
      return t("register.import.error.missingLabelHeader");
    case "fieldCount":
      return t("register.import.error.fieldCount", {
        line: error.line,
        found: error.found,
        expected: error.expected,
      });
    case "labelMissing":
      return t("register.import.error.labelMissing", { line: error.line });
    case "badOrigin":
      return t("register.import.error.badOrigin", { line: error.line, value: error.value });
    case "originWithoutKey":
      return t("register.import.error.originWithoutKey", {
        line: error.line,
        value: error.value,
      });
    case "badKey":
      return t("register.import.error.badKey", { line: error.line, value: error.value });
    case "duplicateKeyInFile":
      return t("register.import.error.duplicateKeyInFile", {
        line: error.line,
        otherLine: error.otherLine,
      });
    case "duplicateKeyInStore":
      return t("register.import.error.duplicateKeyInStore", {
        line: error.line,
        label: error.label,
      });
  }
}

// --- records ------------------------------------------------------------------------------

export interface CsvRecord {
  // The line the record starts on (the header is line 1).
  line: number;
  fields: string[];
}

export interface CsvRecords {
  separator: CsvSeparator;
  records: CsvRecord[];
}

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

// The header line decides: a `;` in it makes `;` the separator, else `,`. A header with
// both is split on `;`, and whatever that leaves is then an unknown column, named.
export function detectSeparator(text: string): CsvSeparator {
  const end = text.search(/\r|\n/);
  const header = end === -1 ? text : text.slice(0, end);
  return header.includes(";") ? ";" : ",";
}

// Splits the text into records: fields separated by the separator, records by CRLF or LF, a
// field quoted with " may hold separators, quotes ("") and line breaks. A record whose every
// field is empty is a blank line and is dropped. The one way to fail is a quote that is not
// closed by the end of the file.
export function parseCsvRecords(
  text: string,
  separator: CsvSeparator,
): { records: CsvRecord[]; error: CsvError | null } {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;

  function endRecord(): void {
    fields.push(field);
    if (fields.some((value) => value !== "")) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = "";
  }

  while (i < text.length) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        if (c === "\n") {
          line += 1;
        }
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      i += 1;
    } else if (c === separator) {
      fields.push(field);
      field = "";
      i += 1;
    } else if (c === "\r" || c === "\n") {
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += c;
      i += 1;
    }
  }
  if (inQuotes) {
    return { records, error: { kind: "unterminatedQuote", line: recordLine } };
  }
  if (field !== "" || fields.length > 0) {
    endRecord();
  }
  return { records, error: null };
}

// --- the header ---------------------------------------------------------------------------

// Column index -> column, from the header's names. Case-insensitive; surrounding whitespace
// ignored; nothing else forgiven.
export function matchHeader(names: readonly string[]): {
  columns: CsvColumn[];
  errors: CsvError[];
} {
  const errors: CsvError[] = [];
  const columns: CsvColumn[] = [];
  const seen = new Set<CsvColumn>();
  const byLowerName = new Map<string, CsvColumn>(CSV_COLUMNS.map((c) => [c.toLowerCase(), c]));
  names.forEach((raw, index) => {
    const name = raw.trim();
    const column = index + 1;
    if (name === "") {
      errors.push({ kind: "emptyHeader", column });
      return;
    }
    const matched = byLowerName.get(name.toLowerCase());
    if (matched === undefined) {
      errors.push({ kind: "unknownHeader", column, name });
      return;
    }
    if (seen.has(matched)) {
      errors.push({ kind: "duplicateHeader", column, name });
      return;
    }
    seen.add(matched);
    columns[index] = matched;
  });
  if (errors.length === 0 && !seen.has("label")) {
    errors.push({ kind: "missingLabelHeader" });
  }
  return { columns, errors };
}

// --- rows ---------------------------------------------------------------------------------

// One data row as the preview shows it: the fields as they will be stored, the key normalized
// ("" for a contact without a radio, and then no origin), and the row's own errors.
export interface CsvRow {
  line: number;
  label: string;
  person?: string;
  street?: string;
  role?: string;
  phone?: string;
  origin?: RegisterOrigin;
  publicKey: string;
  notes?: string;
  errors: CsvError[];
}

export interface RegisterImportPreview {
  separator: CsvSeparator;
  rows: CsvRow[];
  // Every row ready for the store, in file order — with a radio or without. Empty while
  // there is any error.
  entries: NewRegisterEntry[];
  // File-level errors, then every row's errors, in file order.
  errors: CsvError[];
}

// What a preview holds, for the summary line and the note: the rows with a radio and the
// rows without, among the rows that have no error of their own.
export function previewCounts(preview: RegisterImportPreview): {
  withRadio: number;
  withoutRadio: number;
} {
  const clean = preview.rows.filter((row) => row.errors.length === 0);
  const withRadio = clean.filter((row) => row.publicKey !== "").length;
  return { withRadio, withoutRadio: clean.length - withRadio };
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
}

// The origin of a row with a key: empty means issued; anything else has to be one of the
// three words, case folded. A row without a key has no origin, and one given is an error.
function parseOrigin(
  value: string | undefined,
  hasKey: boolean,
  line: number,
): { origin: RegisterOrigin | undefined; error: CsvError | null } {
  const trimmed = value?.trim() ?? "";
  if (!hasKey) {
    return {
      origin: undefined,
      error: trimmed === "" ? null : { kind: "originWithoutKey", line, value: trimmed },
    };
  }
  if (trimmed === "") {
    return { origin: "issued", error: null };
  }
  const lower = trimmed.toLowerCase();
  const origin = REGISTER_ORIGINS.find((candidate) => candidate === lower);
  if (origin === undefined) {
    return { origin: "issued", error: { kind: "badOrigin", line, value: trimmed } };
  }
  return { origin, error: null };
}

// The whole import, decided before anything is written: the text to rows, every rule
// applied, the keys checked against each other and against `existing` (the register as
// loaded; the store checks again inside its transaction).
export function previewRegisterImport(
  text: string,
  existing: readonly RegisterEntry[],
): RegisterImportPreview {
  const body = stripBom(text);
  const separator = detectSeparator(body);
  const empty: RegisterImportPreview = { separator, rows: [], entries: [], errors: [] };

  const parsed = parseCsvRecords(body, separator);
  if (parsed.error !== null) {
    return { ...empty, errors: [parsed.error] };
  }
  const [header, ...records] = parsed.records;
  if (header === undefined) {
    return { ...empty, errors: [{ kind: "empty" }] };
  }
  const matched = matchHeader(header.fields);
  if (matched.errors.length > 0) {
    return { ...empty, errors: matched.errors };
  }
  const columns = matched.columns;

  const existingByKey = new Map<string, RegisterEntry>();
  for (const entry of existing) {
    if (entry.publicKey !== undefined) {
      existingByKey.set(entry.publicKey, entry);
    }
  }
  const firstLineOfKey = new Map<string, number>();
  const rows: CsvRow[] = [];
  const errors: CsvError[] = [];

  for (const record of records) {
    const line = record.line;
    if (record.fields.length !== header.fields.length) {
      const error: CsvError = {
        kind: "fieldCount",
        line,
        found: record.fields.length,
        expected: header.fields.length,
      };
      rows.push({ line, label: "", publicKey: "", errors: [error] });
      errors.push(error);
      continue;
    }
    const byColumn: Partial<Record<CsvColumn, string>> = {};
    record.fields.forEach((value, index) => {
      const column = columns[index];
      if (column !== undefined) {
        byColumn[column] = value;
      }
    });

    const rowErrors: CsvError[] = [];
    const label = byColumn.label?.trim() ?? "";
    if (label === "") {
      rowErrors.push({ kind: "labelMissing", line });
    }
    const rawKey = byColumn.publicKey?.trim() ?? "";
    const origin = parseOrigin(byColumn.origin, rawKey !== "", line);
    if (origin.error !== null) {
      rowErrors.push(origin.error);
    }
    let publicKey = "";
    if (rawKey !== "") {
      publicKey = normalizePublicKey(rawKey);
      if (!isValidPublicKey(publicKey)) {
        rowErrors.push({ kind: "badKey", line, value: rawKey });
      } else {
        const otherLine = firstLineOfKey.get(publicKey);
        const holder = existingByKey.get(publicKey);
        if (otherLine !== undefined) {
          rowErrors.push({ kind: "duplicateKeyInFile", line, otherLine, publicKey });
        } else if (holder !== undefined) {
          rowErrors.push({ kind: "duplicateKeyInStore", line, label: holder.label, publicKey });
        } else {
          firstLineOfKey.set(publicKey, line);
        }
      }
    }
    rows.push({
      line,
      label,
      person: optional(byColumn.person),
      street: optional(byColumn.street),
      role: optional(byColumn.role),
      phone: optional(byColumn.phone),
      origin: origin.origin,
      publicKey,
      notes: optional(byColumn.notes),
      errors: rowErrors,
    });
    errors.push(...rowErrors);
  }

  if (errors.length > 0) {
    return { separator, rows, entries: [], errors };
  }
  // The key and the origin go together or not at all (the schema's rule, P3-06).
  const entries: NewRegisterEntry[] = rows.map((row) => ({
    label: row.label,
    person: row.person,
    phone: row.phone,
    street: row.street,
    role: row.role,
    notes: row.notes,
    ...(row.publicKey === "" ? {} : { publicKey: row.publicKey, origin: row.origin }),
  }));
  return { separator, rows, entries, errors };
}

// --- export -------------------------------------------------------------------------------

// A field is quoted only when it has to be: a separator, a quote, or a line break in it.
export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(fields: readonly string[]): string {
  return fields.map(csvField).join(";");
}

// The file: BOM, header, one line per entry in the order given, CRLF throughout; a contact
// without a radio has an empty key and an empty origin. Imports back into the same rows
// (registerCsv.test.ts).
export function registerCsv(entries: readonly RegisterEntry[]): string {
  const lines: string[] = [csvLine(CSV_COLUMNS)];
  for (const entry of entries) {
    lines.push(
      csvLine([
        entry.label,
        entry.person ?? "",
        entry.street ?? "",
        entry.role ?? "",
        entry.phone ?? "",
        entry.origin ?? "",
        entry.publicKey ?? "",
        entry.notes ?? "",
      ]),
    );
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
