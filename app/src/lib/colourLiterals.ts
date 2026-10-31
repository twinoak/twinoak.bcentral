// Colour literals outside the token sheet (docs/design.md §Forbidden, P2-01): a `#hex`, an
// `rgb(` / `rgba(` or an `hsl(` / `hsla(` in a .svelte file or in any CSS but
// styles/tokens.css. Pure: text in, the literals with their line numbers out; the test
// (colourLiterals.test.ts) walks src/ and counts. Off (`todo`) until P2-05 turns it on at
// zero; P2-02 to P2-04 report the count as they bring it down.

export interface ColourLiteral {
  line: number;
  text: string;
}

// A hex colour is 3 to 8 hex digits after `#`, not followed by another word character (so
// `#/journal`, `{#each}` and `#12` are not colours); the functions are matched by name.
const LITERAL = /#[0-9a-f]{3,8}(?![\w-])|\b(?:rgb|hsl)a?\(/gi;

export function findColourLiterals(text: string): ColourLiteral[] {
  const found: ColourLiteral[] = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(LITERAL)) {
      found.push({ line: index + 1, text: match[0] });
    }
  }
  return found;
}

// Which files are scanned: every .svelte file, every .css file but the token sheet.
export function isScanned(relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, "/");
  if (path.endsWith(".svelte")) {
    return true;
  }
  return path.endsWith(".css") && path !== "styles/tokens.css";
}
