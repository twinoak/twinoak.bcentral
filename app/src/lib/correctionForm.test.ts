// The correction form's rules (P3-02) over the contract walkthrough: the box opens with the
// entry's current text — the latest correction's when it has one — and targets the original;
// an unchanged or empty text cannot be saved; the "#n " of a message is a fixed prefix that
// survives into the stored text.

import { describe, expect, it } from "vitest";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import type { JournalEntry } from "../store/types.ts";
import { canSaveCorrection, correctedText, correctionForm } from "./correctionForm.ts";

const walkthrough = loadWalkthrough();

const W = {
  order1: "01JB8ZK3QX9V2M4N6P8R0T2W51",
  note: "01JB8ZK3QX9V2M4N6P8R0T2W58",
  noteCorrection: "01JB8ZK3QX9V2M4N6P8R0T2W62",
};

function entry(id: string): JournalEntry {
  const found = walkthrough.entries.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no walkthrough entry ${id}`);
  }
  return found;
}

describe("prefill", () => {
  it("opens with the entry's own text when it was never corrected, targeting the entry", () => {
    const note = entry(W.note);
    const form = correctionForm(note, []);
    expect(form).toEqual({
      target: note,
      prefix: "",
      body: "Ringede til forsyningen, kø, ingen svar",
    });
  });

  it("opens with the latest correction's text on a second correction, still targeting the original", () => {
    const note = entry(W.note);
    const first = entry(W.noteCorrection);
    const form = correctionForm(note, [first]);
    expect(form.body).toBe("Det var kommunens vagt, ikke forsyningen");
    expect(form.target.id).toBe(W.note);
    // A later correction (a higher ULID) wins, whatever order the list came in.
    const second: JournalEntry = {
      ...first,
      id: "01JB8ZK3QX9V2M4N6P8R0T2W99",
      deviceSeq: 14,
      text: "Det var kommunens vagt",
    };
    expect(correctionForm(note, [second, first]).body).toBe("Det var kommunens vagt");
    expect(correctionForm(note, [second, first]).target.id).toBe(W.note);
  });
});

describe("Save", () => {
  const form = correctionForm(entry(W.note), []);

  it("is disabled while the text is unchanged", () => {
    expect(canSaveCorrection(form, form.body)).toBe(false);
    expect(canSaveCorrection(form, `  ${form.body}\n`)).toBe(false);
  });

  it("is disabled while the text is empty", () => {
    expect(canSaveCorrection(form, "")).toBe(false);
    expect(canSaveCorrection(form, "   \n")).toBe(false);
  });

  it("is enabled once one word differs, and stores the trimmed text", () => {
    const typed = " Ringede til kommunens vagt, kø, ingen svar ";
    expect(canSaveCorrection(form, typed)).toBe(true);
    expect(correctedText(form, typed)).toBe("Ringede til kommunens vagt, kø, ingen svar");
  });
});

describe("a message_out keeps its #n", () => {
  it("shows '#1 ' as a fixed prefix before the box and puts it back into the stored text", () => {
    const order = entry(W.order1);
    expect(order.text).toBe("#1 Meld status for Nørregade");
    const form = correctionForm(order, []);
    expect(form).toEqual({ target: order, prefix: "#1 ", body: "Meld status for Nørregade" });
    expect(canSaveCorrection(form, "Meld status for Nørregade")).toBe(false);
    expect(correctedText(form, "Meld status for Søndergade ")).toBe(
      "#1 Meld status for Søndergade",
    );
  });

  it("keeps the drill prefix too, and the prefix of the latest correction on a second one", () => {
    const order = entry(W.order1);
    const drilled = { ...order, text: "ØVELSE #1 Meld status" };
    const form = correctionForm(drilled, []);
    expect(form.prefix).toBe("ØVELSE #1 ");
    expect(form.body).toBe("Meld status");
    expect(correctedText(form, "Meld status for alle")).toBe("ØVELSE #1 Meld status for alle");

    const correction: JournalEntry = {
      ...entry(W.noteCorrection),
      id: "01JB8ZK3QX9V2M4N6P8R0T2W98",
      refersTo: order.id,
      text: "#1 Meld status for Søndergade",
    };
    const again = correctionForm(order, [correction]);
    expect(again).toEqual({ target: order, prefix: "#1 ", body: "Meld status for Søndergade" });
  });

  it("has no prefix when the text does not start with the message's own one", () => {
    const order = entry(W.order1);
    expect(correctionForm({ ...order, text: "Meld status" }, []).prefix).toBe("");
    expect(correctionForm({ ...order, text: "#2 Meld status" }, []).prefix).toBe("");
  });
});
