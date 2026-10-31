// The shell (P2-02, docs/design.md §The shell): one top bar and nothing below it but the
// page. Acceptance: no element with a band role exists below the bar, the home page is gone.
// Checked on the sources, since there is no component test harness: the files of the bands,
// the banner, the incident bar and the home page do not exist, App.svelte renders the bar
// and then the page with nothing in between, and no screen carries a band or banner.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

function svelteFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...svelteFiles(path));
    } else if (entry.name.endsWith(".svelte")) {
      files.push(path);
    }
  }
  return files;
}

describe("the shell", () => {
  it("the drill band, the update banner, the incident bar and the home page are gone", () => {
    for (const gone of [
      "components/DrillBand.svelte",
      "components/UpdateBanner.svelte",
      "components/IncidentBar.svelte",
      "pages/HomePage.svelte",
    ]) {
      expect(existsSync(join(srcDir, gone)), gone).toBe(false);
    }
  });

  it("App.svelte renders the bar, then the page, nothing between", () => {
    const app = readFileSync(join(srcDir, "App.svelte"), "utf8");
    const bar = app.indexOf("<TopBar />");
    const page = app.indexOf("<main");
    expect(bar).toBeGreaterThan(-1);
    expect(page).toBeGreaterThan(bar);
    const between = app.slice(bar + "<TopBar />".length, page).replace(/<!--[\s\S]*?-->/g, "");
    expect(between.trim()).toBe("");
  });

  it("no screen or component carries a band or a banner", () => {
    for (const file of svelteFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/data-drill-band|class="band|class="banner|class="notices/);
    }
  });

  it("the bar is the one place with the shell classes, and the nav underline is aria-current", () => {
    const bar = readFileSync(join(srcDir, "components/TopBar.svelte"), "utf8");
    expect(bar).toContain('class="shell no-print"');
    expect(bar).toContain('aria-current={route() === to ? "page" : undefined}');
    for (const file of svelteFiles(srcDir)) {
      if (!file.endsWith("TopBar.svelte")) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/class="shell[" ]/);
      }
    }
  });
});
