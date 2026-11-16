// Correcting by editing, end to end through the store (P3-02): the form's prefill from the
// row, the correction appended with addCorrection's unchanged shape, the row then reading
// the corrected text. A second correction refers to the original entry, not to the first
// correction; the original is untouched throughout and every entry is in the export.

import { describe, expect, it } from "vitest";
import { canSaveCorrection, correctedText, correctionForm } from "../lib/correctionForm.ts";
import { openTestStore } from "../test-support/testStore.ts";
import type { JournalStore } from "./journalStore.ts";
import { buildTimeline, currentText, textVersions, type TimelineRow } from "./journalView.ts";
import { appendCorrection, appendNote } from "./manual.ts";
import { composeMessage } from "./outgoing.ts";
import type { JournalEntry } from "./types.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";

function rowOf(rows: readonly TimelineRow[], id: string): TimelineRow {
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`no row ${id}`);
  }
  return row;
}

function correctionsOf(row: TimelineRow): JournalEntry[] {
  return row.kind === "message"
    ? row.message.corrections
    : row.kind === "entry"
      ? row.corrections
      : [];
}

// What the row's Correct button does: the form off the row, Save with the typed text.
async function correctFromRow(
  store: JournalStore,
  entryId: string,
  typed: string,
): Promise<JournalEntry> {
  const row = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), entryId);
  const form = correctionForm(row.entry, correctionsOf(row));
  expect(canSaveCorrection(form, typed)).toBe(true);
  return await appendCorrection(store, form.target, {
    operator: "Bo",
    text: correctedText(form, typed),
  });
}

describe("correcting a note by editing it", () => {
  it("changes one word: the row reads the new text, marked corrected, the original untouched", async () => {
    const store = await openTestStore();
    const note = await appendNote(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      text: "Ringede til forsyningen, kø, ingen svar",
    });
    const correction = await correctFromRow(store, note.id, "Ringede til kommunen, kø, ingen svar");
    expect(correction).toMatchObject({
      type: "correction",
      refersTo: note.id,
      text: "Ringede til kommunen, kø, ingen svar",
    });
    expect(await store.getEntry(note.id)).toEqual(note);

    const rows = buildTimeline(await store.entriesForIncident(INCIDENT));
    const row = rowOf(rows, note.id);
    expect(row.kind === "entry" && row.corrections.map((c) => c.id)).toEqual([correction.id]);
    expect(currentText(row.entry, correctionsOf(row))).toBe("Ringede til kommunen, kø, ingen svar");
    // The history: the original and the correction, each with its own time and operator.
    expect(textVersions(row.entry, correctionsOf(row)).map((v) => [v.operator, v.text])).toEqual([
      ["Anne", "Ringede til forsyningen, kø, ingen svar"],
      ["Bo", "Ringede til kommunen, kø, ingen svar"],
    ]);
    store.close();
  });

  it("correcting it again: the box holds the corrected text and the new correction refers to the original", async () => {
    const store = await openTestStore();
    const note = await appendNote(store, { incidentId: INCIDENT, operator: "Anne", text: "v1" });
    const first = await correctFromRow(store, note.id, "v2");

    const rowAfterFirst = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), note.id);
    const form = correctionForm(rowAfterFirst.entry, correctionsOf(rowAfterFirst));
    expect(form.body).toBe("v2");
    expect(form.target.id).toBe(note.id);
    expect(canSaveCorrection(form, "v2")).toBe(false);

    const second = await correctFromRow(store, note.id, "v3");
    expect(second.refersTo).toBe(note.id);
    expect(second.refersTo).not.toBe(first.id);

    const entries = await store.entriesForIncident(INCIDENT);
    const row = rowOf(buildTimeline(entries), note.id);
    expect(currentText(row.entry, correctionsOf(row))).toBe("v3");
    expect(textVersions(row.entry, correctionsOf(row)).map((v) => v.text)).toEqual([
      "v1",
      "v2",
      "v3",
    ]);
    // One original with two corrections, never a correction of a correction.
    expect(entries.filter((e) => e.type === "correction").map((e) => e.refersTo)).toEqual([
      note.id,
      note.id,
    ]);
    expect(await store.getEntry(note.id)).toEqual(note);
    // The export carries every entry: the note and both corrections.
    const envelope = await store.exportEnvelope();
    expect(envelope.entries.map((e) => e.id)).toEqual([note.id, first.id, second.id]);
    store.close();
  });
});

describe("correcting a message_out", () => {
  it("keeps '#n ' fixed in front of the box and present in the stored text of a radio message", async () => {
    const store = await openTestStore();
    const hans = await store.createRegisterEntry({
      publicKey: "7a".repeat(32),
      label: "Hans",
      origin: "adhoc",
    });
    for (let n = 1; n < 12; n++) {
      await composeMessage(store, {
        incidentId: INCIDENT,
        operator: "Anne",
        counterpartyId: hans.id,
        transport: "mesh",
        body: `besked ${n}`,
      });
    }
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: hans.id,
      transport: "mesh",
      body: "Meld status for Nørregade",
    });
    expect(message.text).toBe("#12 Meld status for Nørregade");

    const row = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), message.id);
    const form = correctionForm(row.entry, correctionsOf(row));
    expect(form.prefix).toBe("#12 ");
    expect(form.body).toBe("Meld status for Nørregade");

    const correction = await correctFromRow(store, message.id, "Meld status for Søndergade");
    expect(correction.text).toBe("#12 Meld status for Søndergade");
    expect(correction.refersTo).toBe(message.id);
    expect(await store.getEntry(message.id)).toEqual(message);

    const after = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), message.id);
    expect(currentText(after.entry, correctionsOf(after))).toBe("#12 Meld status for Søndergade");
    // The message's status and strip are untouched by the correction.
    expect(after.kind === "message" && after.message.status).toBe("pending");
    store.close();
  });

  it("a courier record has no prefix to keep: the box opens with the whole text (P3-07)", async () => {
    const store = await openTestStore();
    const hans = await store.createRegisterEntry({ label: "Hans", phone: "12 34 56 78" });
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Anne",
      counterpartyId: hans.id,
      transport: "courier",
      body: "Pumpe på vej til nr 4 med Peter",
    });
    expect(message.text).toBe("Pumpe på vej til nr 4 med Peter");
    const row = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), message.id);
    const form = correctionForm(row.entry, correctionsOf(row));
    expect(form.prefix).toBe("");
    expect(form.body).toBe("Pumpe på vej til nr 4 med Peter");
    const correction = await correctFromRow(store, message.id, "Pumpe på vej til nr 4 med Anne");
    expect(correction.text).toBe("Pumpe på vej til nr 4 med Anne");
    const after = rowOf(buildTimeline(await store.entriesForIncident(INCIDENT)), message.id);
    expect(currentText(after.entry, correctionsOf(after))).toBe("Pumpe på vej til nr 4 med Anne");
    // The record has no status; the versions are its only history.
    expect(after.kind === "message" && after.message.status).toBeNull();
    expect(after.kind === "message" && after.message.history).toEqual([]);
    expect(textVersions(after.entry, correctionsOf(after)).map((v) => v.text)).toEqual([
      "Pumpe på vej til nr 4 med Peter",
      "Pumpe på vej til nr 4 med Anne",
    ]);
    store.close();
  });
});
