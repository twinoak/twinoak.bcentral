// The print pages on the design language, the paper rules and the screenshot set (P2-05,
// docs/design.md §Screens → Print). Checked on the sources, since there is no component test
// harness: the two print pages lay out and nothing else and every control of theirs is on
// the components, the document is `.doc` in the component sheet with a paper block that turns
// chips into words, the handover prints its header from `.dl`, the seed hook of main.ts is
// there only when the URL asks, and `npm run screenshots` exists apart from `npm run test`
// and names every route. The colour-literal count itself is lib/colourLiterals.test.ts, on.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));
const appDir = join(srcDir, "..");

const PRINT_PAGES = ["pages/PrintPage.svelte", "pages/PrintRegisterPage.svelte"];

function read(file: string): string {
  return readFileSync(join(srcDir, file), "utf8");
}

function styleBlock(text: string): string {
  const match = /<style[^>]*>([\s\S]*?)<\/style>/.exec(text);
  return match?.[1] ?? "";
}

function markup(text: string): string {
  return text.replace(/<style[^>]*>[\s\S]*?<\/style>/, "");
}

const NOT_LAYOUT =
  /^\s*(color|background[\w-]*|border(-[\w-]+)?-color|border|box-shadow|outline|font-size|font-weight|opacity)\s*:/m;

function printBlock(css: string): string {
  const start = css.lastIndexOf("@media print");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
}

describe("the print pages (P2-05)", () => {
  it("lay out and nothing else, on the components, without the P1-09 aliases", () => {
    for (const file of PRINT_PAGES) {
      const text = read(file);
      expect(styleBlock(text), file).not.toMatch(NOT_LAYOUT);
      expect(text, file).not.toMatch(/--muted|--line\b|--error\b|--light\b|#444/);
      for (const match of markup(text).matchAll(/<button\b[^>]*>/g)) {
        expect(match[0], `${file}: ${match[0]}`).toMatch(/class="[^"]*\bbtn\b/);
      }
      for (const match of markup(text).matchAll(/<table\b[^>]*>/g)) {
        expect(match[0], `${file}: ${match[0]}`).toMatch(/class="table"/);
      }
      expect(text, file).toContain('class="toolbar controls no-print"');
      expect(text, file).toContain('<article class="doc"');
      expect(text, file).toContain('<dl class="dl">');
      expect(text, file).toContain('class="msg msg-danger no-print" role="alert"');
    }
    const journal = read("pages/PrintPage.svelte");
    expect(journal).toContain('class="msg msg-drill doc-drill"');
    expect(journal).toContain('class="doc-status"');
    expect(journal).toContain("stripLine(view)");
    expect(journal).toContain("countersText(row.counters)");
    expect(journal).toContain('data-nested="true" data-type="correction"');
  });

  it("the document and the paper rules live in the component sheet", () => {
    const css = read("styles/components.css");
    expect(css).toMatch(/^\.doc \{/m);
    expect(css).toMatch(/^\.doc-meta \{\s*font-size: var\(--fs-14\);\s*color: var\(--ink-2\);/m);
    expect(css).toContain('.doc tr[data-type="batch"] td');
    const paper = printBlock(css);
    // Status words instead of chips: the chip's tint and dot go, the word stays.
    expect(paper).toMatch(
      /\.chip,[\s\S]*?\.msg-drill \{\s*padding: 0;\s*background: transparent;\s*color: var\(--ink\)/,
    );
    expect(paper).toMatch(/\.chip-dot,\s*\.chip \.icon \{\s*display: none;/);
    expect(paper).toMatch(/\.doc-drill \{[\s\S]*?border: 1px solid var\(--ink\)/);
    expect(paper).toMatch(/\.table th \{[\s\S]*?position: static;/);
    expect(paper).toMatch(/\.rows > \* \{\s*break-inside: avoid;/);
    const base = read("styles/base.css");
    expect(base).toMatch(/@media print \{[\s\S]*?font-size: 12pt;/);
    expect(base).toContain("@page {");
  });

  it("the handover prints its header from the components", () => {
    const page = read("pages/HandoverPage.svelte");
    expect(page).toContain('<header class="print-only">');
    expect(page).toContain('<dl class="dl">');
    expect(page).toContain('class="msg msg-drill"');
    expect(page).toContain('class="card head no-print"');
  });

  it("the seed hook is there only when the URL asks for it", () => {
    const main = read("main.ts");
    const gate = main.indexOf('new URLSearchParams(location.search).has("seed")');
    expect(gate).toBeGreaterThan(-1);
    expect(main.indexOf("window.__bcentral =")).toBeGreaterThan(gate);
    expect(main).toContain("store.importEnvelope(envelope)");
  });

  it("npm run screenshots is its own script, apart from the tests, and takes every route", () => {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts["screenshots"]).toBe("node scripts/screenshots.mjs");
    expect(pkg.scripts["test"]).not.toContain("screenshots");
    expect(pkg.devDependencies["playwright-core"]).toBeDefined();
    const script = readFileSync(join(appDir, "scripts", "screenshots.mjs"), "utf8");
    for (const hash of [
      "#/journal",
      "#/handover",
      "#/queue",
      "#/register",
      "#/radio",
      "#/settings",
      "#/styleguide",
      "#/print",
      "#/register/print",
    ]) {
      expect(script, hash).toContain(`"${hash}"`);
    }
    for (const name of [
      '"journal"',
      '"journal-drill"',
      '"journal-largest"',
      '"journal-contrast"',
      '"print-handover"',
    ]) {
      expect(script).toContain(`shot(${name}`);
    }
    expect(script).toContain("[1280, 720]");
    expect(script).toContain("[1440, 900]");
    expect(script).toContain('"tasks", "phase-2", "reports", "screens"');
    expect(script).not.toMatch(/new Promise|Promise\.all/);
    expect(existsSync(join(appDir, "..", "tasks", "phase-2", "reports", "screens"))).toBe(true);
  });
});
