// The colour-literal check (P2-01): no `#hex`, `rgb(` or `hsl(` in a .svelte file or in any
// CSS outside styles/tokens.css. The check itself is `todo` with the current count in its
// name until P2-05 turns it on at zero (each task in between reports its count); the
// scanner's rules are tested here so the count means what it says.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findColourLiterals, isScanned } from "./colourLiterals.ts";

const srcDir = fileURLToPath(new URL("..", import.meta.url));

function scannedFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scannedFiles(path));
    } else if (isScanned(relative(srcDir, path))) {
      files.push(path);
    }
  }
  return files.sort();
}

export function countColourLiterals(): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  let total = 0;
  for (const file of scannedFiles(srcDir)) {
    const found = findColourLiterals(readFileSync(file, "utf8"));
    if (found.length > 0) {
      perFile[relative(srcDir, file).replace(/\\/g, "/")] = found.length;
      total += found.length;
    }
  }
  return { total, perFile };
}

describe("the colour-literal scanner", () => {
  it("finds hex, rgb and hsl literals with their line", () => {
    const found = findColourLiterals(
      "a { color: #444; }\nb { background: rgba(0, 0, 0, 0.45); border-color: hsl(0 0% 50%); }\nc { color: #1E3A5F }\n",
    );
    expect(found).toEqual([
      { line: 1, text: "#444" },
      { line: 2, text: "rgba(" },
      { line: 2, text: "hsl(" },
      { line: 3, text: "#1E3A5F" },
    ]);
  });

  it("leaves hash routes, Svelte blocks, message numbers and tokens alone", () => {
    const text =
      '<a href="#/journal">{#each rows as row}{#if row.n}#12 {row.text}{/if}{/each}</a>\n' +
      "<style>.x { color: var(--ink); background: var(--accent-weak); }</style>\n";
    expect(findColourLiterals(text)).toEqual([]);
  });

  it("scans every .svelte file and every .css file but the token sheet", () => {
    expect(isScanned("pages/JournalPage.svelte")).toBe(true);
    expect(isScanned("styles/components.css")).toBe(true);
    expect(isScanned("app.css")).toBe(true);
    expect(isScanned("styles/tokens.css")).toBe(false);
    expect(isScanned("styles\\tokens.css")).toBe(false);
    expect(isScanned("lib/icons.ts")).toBe(false);
  });

  it("the new stylesheets and the style guide carry none", () => {
    const { perFile } = countColourLiterals();
    for (const file of Object.keys(perFile)) {
      expect(file).not.toMatch(/^styles\//);
      expect(file).not.toBe("app.css");
      expect(file).not.toBe("pages/StyleGuidePage.svelte");
      expect(file).not.toBe("components/Icon.svelte");
    }
  });
});

const { total, perFile } = countColourLiterals();
const where = Object.entries(perFile)
  .map(([file, count]) => `${file}: ${count}`)
  .join(", ");

describe("colour literals outside styles/tokens.css", () => {
  // P2-05 turns this on: change `it.todo` to `it` once the count is 0.
  it.todo(`none in any .svelte file or CSS — currently ${total} (${where || "none"})`, () => {
    expect(perFile).toEqual({});
  });
});
