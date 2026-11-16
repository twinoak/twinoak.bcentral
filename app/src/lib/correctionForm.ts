// The correction form's rules (P3-02): correcting an entry feels like editing its text. The
// one box opens with the entry's *current* text — the latest correction's when it has one,
// else the original — and Save appends a `correction` whose text is the whole corrected text
// and whose refersTo is the entry being corrected: always the original entry, also on a
// second correction (a chain is one original with N corrections, never a correction of a
// correction). Nothing in the model changes; the row then reads the new text (currentText).
//
// For a message_out the "#n " (or "ØVELSE #n ") prefix is the text protocol's, not the
// operator's: the form shows it as a fixed prefix before the box and the stored correction
// keeps it. What went on the air is not changed by a correction; the journal records that
// the record was corrected, and the history shows both.
//
// Pure: nothing here reads a store or a screen. The stored text goes through
// store/manual.ts's appendCorrection, which trims and refuses an empty one.

import { currentText, splitPrefix } from "../store/journalView.ts";
import type { JournalEntry } from "../store/types.ts";

export interface CorrectionForm {
  // The entry the correction will refer to: the original, whatever was corrected before.
  target: JournalEntry;
  // The fixed "#n " in front of the box; empty for anything but a numbered message.
  prefix: string;
  // What the box opens with: the current text without the prefix.
  body: string;
}

export function correctionForm(
  entry: JournalEntry,
  corrections: readonly JournalEntry[],
): CorrectionForm {
  const { prefix, body } = splitPrefix(entry, currentText(entry, corrections));
  return { target: entry, prefix, body };
}

// Save is disabled while the typed body is empty or still the text the box opened with.
export function canSaveCorrection(form: CorrectionForm, typed: string): boolean {
  const body = typed.trim();
  return body !== "" && body !== form.body.trim();
}

// The text to store: the fixed prefix, then the typed body trimmed.
export function correctedText(form: CorrectionForm, typed: string): string {
  return form.prefix + typed.trim();
}
