// The suggested title of a point (P3-05): the origin's text, one line, cut to 80 characters
// at a word boundary.

import { describe, expect, it } from "vitest";
import { POINT_TITLE_LENGTH, suggestedTitle } from "./pointTitle.ts";

describe("suggestedTitle", () => {
  it("keeps a short text as it is, trimmed and on one line", () => {
    expect(suggestedTitle("  Kommunens vagt ringede:\n pumpen er fremme 20:30 ")).toBe(
      "Kommunens vagt ringede: pumpen er fremme 20:30",
    );
  });

  it("keeps a text of exactly the limit", () => {
    const text = "a".repeat(POINT_TITLE_LENGTH);
    expect(suggestedTitle(text)).toBe(text);
  });

  it("cuts a longer text at the last space inside the limit, without an ellipsis", () => {
    const words =
      "Kælderen i nr 8 har vand og vi mangler lygter til hele vejen samt en pumpe mere til nr 4";
    expect(words.length).toBeGreaterThan(POINT_TITLE_LENGTH);
    const title = suggestedTitle(words);
    expect(title).toBe(
      "Kælderen i nr 8 har vand og vi mangler lygter til hele vejen samt en pumpe mere",
    );
    expect([...title].length).toBeLessThanOrEqual(POINT_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(false);
  });

  it("a word that ends exactly at the limit is kept whole", () => {
    const text = `${"b".repeat(POINT_TITLE_LENGTH)} rest`;
    expect(suggestedTitle(text)).toBe("b".repeat(POINT_TITLE_LENGTH));
  });

  it("one long word is cut hard at the limit; characters, not bytes", () => {
    expect(suggestedTitle("x".repeat(100))).toBe("x".repeat(POINT_TITLE_LENGTH));
    expect(suggestedTitle("æ".repeat(100))).toBe("æ".repeat(POINT_TITLE_LENGTH));
    expect(suggestedTitle("ab cd", 2)).toBe("ab");
    expect(suggestedTitle("abc de", 2)).toBe("ab");
  });

  it("an empty text is an empty title", () => {
    expect(suggestedTitle("   ")).toBe("");
  });
});
