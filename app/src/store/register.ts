// Register logic above the store (P0-03): public key validation as the contract spells it,
// the ad hoc batch labels, what an edit changed as journal text, and the edit itself with
// its note. The store validates and keeps keys unique; this module decides what to write.

import schema from "../../../contract/journal.schema.json";
import { t } from "../i18n/index.svelte.ts";
import type { JournalStore } from "./journalStore.ts";
import type { JournalEntry, RegisterEntry, RegisterOrigin } from "./types.ts";

// The contract's publicKey pattern, read from the schema so there is one definition.
export const PUBLIC_KEY_PATTERN = new RegExp(schema.$defs.publicKey.pattern);

export const REGISTER_ORIGINS: readonly RegisterOrigin[] = ["issued", "adhoc", "private"];

export function isValidPublicKey(value: string): boolean {
  return PUBLIC_KEY_PATTERN.test(value);
}

// What the form does with typed or pasted input before validating it: surrounding whitespace
// goes and hex case is folded (hex is case-insensitive; the contract stores lowercase).
// Nothing else: no prefix stripping, no guessing at what was meant.
export function normalizePublicKey(input: string): string {
  return input.trim().toLowerCase();
}

// "radio #first" … "radio #(first + count - 1)": the labels of an ad hoc batch, to be renamed
// at handout. Distinct by construction.
export function adhocLabels(first: number, count: number): string[] {
  if (!Number.isInteger(first) || first < 1 || !Number.isInteger(count) || count < 1) {
    throw new RangeError(`adhoc batch needs whole numbers >= 1, got first=${first} count=${count}`);
  }
  const labels: string[] = [];
  for (let n = first; n < first + count; n += 1) {
    labels.push(t("register.adhocLabel", { n }));
  }
  return labels;
}

// The fields the staff edit, in the order they are reported. The stamps (id, createdAt,
// createdOnDevice) never change.
export const REGISTER_FIELDS = [
  "label",
  "person",
  "street",
  "role",
  "origin",
  "notes",
  "publicKey",
] as const;

export type RegisterField = (typeof REGISTER_FIELDS)[number];

export interface RegisterChange {
  field: RegisterField;
  from: string | undefined;
  to: string | undefined;
}

// An absent optional field and an empty one read the same to the staff.
function blank(value: string | undefined): boolean {
  return value === undefined || value === "";
}

export function registerChanges(before: RegisterEntry, after: RegisterEntry): RegisterChange[] {
  const changes: RegisterChange[] = [];
  for (const field of REGISTER_FIELDS) {
    const from = before[field];
    const to = after[field];
    if (from === to || (blank(from) && blank(to))) {
      continue;
    }
    changes.push({ field, from, to });
  }
  return changes;
}

function shown(field: RegisterField, value: string | undefined): string {
  if (value === undefined || value === "") {
    return t("register.note.empty");
  }
  if (field === "origin") {
    return t(`register.origin.${value}`);
  }
  return value;
}

// The journal text for an edit: "register: radio #7 → Hans, Street (none) → Nørregade". The
// label comes first (old → new when it changed), then every other changed field by name.
// null when nothing changed.
export function registerChangeText(before: RegisterEntry, after: RegisterEntry): string | null {
  const changes = registerChanges(before, after);
  if (changes.length === 0) {
    return null;
  }
  const parts: string[] = [];
  const labelChanged = changes.some((change) => change.field === "label");
  parts.push(labelChanged ? `${before.label} → ${after.label}` : after.label);
  for (const change of changes) {
    if (change.field === "label") {
      continue;
    }
    const name = t(`register.field.${change.field}`);
    parts.push(`${name} ${shown(change.field, change.from)} → ${shown(change.field, change.to)}`);
  }
  return t("register.note", { changes: parts.join(", ") });
}

export interface SaveContext {
  // The operator at the keyboard; goes on the note.
  operator: string;
  // The incident the app currently shows, or null when none is selected.
  incidentId: string | null;
}

export interface SaveResult {
  entry: RegisterEntry;
  // The note appended to the incident, or null: nothing changed, no incident selected, or
  // the selected incident is closed.
  note: JournalEntry | null;
}

// Stores the entry (insert or replace by id) and, when it was an edit of an existing entry
// that changed something while an incident is open, appends a note saying what changed.
// The register write comes first: it is the thing the staff asked for, and the store has
// already rejected anything invalid by the time the note is attempted.
export async function saveRegisterEntry(
  store: JournalStore,
  entry: RegisterEntry,
  context: SaveContext,
): Promise<SaveResult> {
  const before = await store.getRegisterEntry(entry.id);
  const stored = await store.putRegisterEntry(entry);
  if (before === undefined) {
    return { entry: stored, note: null };
  }
  const text = registerChangeText(before, stored);
  if (text === null || context.incidentId === null) {
    return { entry: stored, note: null };
  }
  if (!(await store.isIncidentOpen(context.incidentId))) {
    return { entry: stored, note: null };
  }
  const note = await store.appendEntry({
    incidentId: context.incidentId,
    operator: context.operator,
    type: "note",
    text,
  });
  return { entry: stored, note };
}

// The register screen's order: by label in the UI language, numbers compared as numbers so
// "radio #2" comes before "radio #10"; ties broken by id so the order is stable.
export function sortedByLabel(entries: readonly RegisterEntry[], locale: string): RegisterEntry[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...entries].sort(
    (a, b) => collator.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
