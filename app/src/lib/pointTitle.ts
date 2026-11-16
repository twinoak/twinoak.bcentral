// The title the "Open point" form opens with (P3-05): the origin entry's text, shortened to
// the first POINT_TITLE_LENGTH characters at a word boundary, so a point opened from a long
// incoming message starts with a readable title the operator can keep or replace. Pure.
//
// Counted in code points, so a cut never splits a character. Whitespace is collapsed to one
// space (a title is one line). A text longer than the limit is cut at the last space inside
// it; a text with no space inside the limit (one long word) is cut hard at the limit. No
// ellipsis: the title is the operator's to edit, not a quotation.

export const POINT_TITLE_LENGTH = 80;

export function suggestedTitle(text: string, max: number = POINT_TITLE_LENGTH): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const characters = [...oneLine];
  if (characters.length <= max) {
    return oneLine;
  }
  const head = characters.slice(0, max + 1).join("");
  const cut = head.lastIndexOf(" ");
  return (cut > 0 ? head.slice(0, cut) : characters.slice(0, max).join("")).trimEnd();
}
