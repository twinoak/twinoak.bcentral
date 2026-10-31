// The remaining screens on the design language (P2-04, docs/design.md §Screens → Handover,
// Send to all, Register, Radio, Settings). Checked on the sources, since there is no
// component test harness: the five pages and the six components lay out and nothing else
// (no colour, no size, no transition alias or P1-09 class in their style blocks and markup),
// the handover's lists are row lists with quiet actions in a 2 × 2 grid under a slim card,
// the queue is a table under a compose card whose picker is a checklist table grouped by
// street, the register is a toolbar over a table with the form in a side card, the radio is
// a state card, a contacts table and a monospaced log list with Clear, the settings are one
// column of cards each with its own Save or an at-once switch, every table is `.table` with
// its numbers right-aligned, and the transition sheet keeps only the print pages' rules.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const PAGES = [
  "pages/HandoverPage.svelte",
  "pages/QueuePage.svelte",
  "pages/RegisterPage.svelte",
  "pages/RadioPage.svelte",
  "pages/SettingsPage.svelte",
];

const COMPONENTS = [
  "components/ContactPicker.svelte",
  "components/RegisterForm.svelte",
  "components/AdhocBatchForm.svelte",
  "components/RegisterImport.svelte",
  "components/BatchComposeForm.svelte",
  "components/ShortcutHelp.svelte",
];

const FILES = [...PAGES, ...COMPONENTS];

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

// What a component's <style> may not say (docs/design.md §Components: "a component <style>
// block may only lay out"). Padding, gaps and widths in tokens are layout.
const NOT_LAYOUT =
  /^\s*(color|background[\w-]*|border(-[\w-]+)?-color|border|box-shadow|outline|font-size|font-weight|opacity)\s*:/m;

describe("the other screens (P2-04)", () => {
  it("their components carry no colour or size of their own", () => {
    for (const file of FILES) {
      const style = styleBlock(read(file));
      expect(style, file).not.toMatch(NOT_LAYOUT);
      expect(style, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it("use none of the P1-09 transition aliases or classes", () => {
    for (const file of FILES) {
      const text = read(file);
      expect(text, file).not.toMatch(
        /--navy|--light\b|--muted|--line\b|--error\b|--surface-in|--surface-given-up|--dot-/,
      );
      expect(markup(text), file).not.toMatch(/class="(secondary|small|link|pill|button)[" ]/);
      expect(markup(text), file).not.toMatch(/class="[^"]*\b(secondary|small)\b/);
    }
  });

  it("every control is on the components: no bare button, no field outside .field", () => {
    for (const file of FILES) {
      const text = markup(read(file));
      for (const match of text.matchAll(/<button\b[^>]*>/g)) {
        expect(match[0], `${file}: ${match[0]}`).toMatch(/class="[^"]*\b(btn|chip|tab)\b/);
      }
      for (const match of text.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        expect(match[0], `${file}: ${match[0]}`).not.toMatch(/class="(secondary|small|key)"/);
      }
      for (const match of text.matchAll(/<table\b[^>]*>/g)) {
        expect(match[0], `${file}: ${match[0]}`).toMatch(/class="table"/);
      }
    }
  });

  it("the handover is a slim card over four row-list cards with quiet actions", () => {
    const page = read("pages/HandoverPage.svelte");
    expect(page).toContain('class="card head no-print"');
    expect(page.match(/class="card list-card"/g)).toHaveLength(4);
    expect(page.match(/<ol class="rows[^"]*">/g)).toHaveLength(4);
    expect(page).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(page).toContain('class="btn btn-quiet"');
    expect(page).toContain('class="row-actions no-print"');
    expect(page).toContain('class="row-form no-print"');
    expect(page).toContain("stripChip(item.kind)");
    expect(page).not.toContain("<table");
    expect(page).toContain("setClockConfirmed(");
    expect(page).toContain("<ComposeForm");
    expect(page).toContain("showToast(");
  });

  it("the queue is a compose card over the table, the progress in the card title", () => {
    const page = read("pages/QueuePage.svelte");
    expect(page).toContain("<BatchComposeForm");
    expect(page).toContain('class="card queue-card"');
    expect(page).toContain('class="count progress" role="status"');
    expect(page).toContain("counterChips(queueCounters(");
    expect(page).toContain("queueRowChip(row.status)");
    expect(page).toContain('class="table-box"');
    expect(page).toContain('<th scope="rowgroup" colspan="7">');
    expect(page.match(/t\("send\.retry"\)/g)).toHaveLength(1);
    expect(page).toContain('t("queue.retryAll"');
    expect(page).toContain('t("queue.pausedShort")');
    expect(page).toContain("composeOpen = false");
    const form = read("components/BatchComposeForm.svelte");
    expect(form).toContain("groupByStreet(register, language())");
    expect(form).toContain('<th scope="rowgroup" colspan="3">');
    expect(form).toContain('type="checkbox"');
    expect(form).toContain('class="counter" class:field-error={preview.tooLong}');
  });

  it("the register is a toolbar over a table box, the form in a side card at 60 rem", () => {
    const page = read("pages/RegisterPage.svelte");
    expect(page).toContain('class="toolbar no-print"');
    expect(page).toContain('type="search"');
    expect(page).toContain("filterRegister(sorted, query)");
    expect(page).toContain('class="table-box register-box"');
    expect(page).toContain("grid-template-columns: minmax(0, 1fr) 22.5rem");
    expect(page).toContain('"toolbar side"');
    expect(page).toContain("@media (max-width: 60rem)");
    expect(page).toContain('<aside class="side">');
    expect(page).toContain("<RegisterForm");
    expect(page).toContain("<AdhocBatchForm");
    expect(page).toContain("<RegisterImport");
    expect(page).toContain("t(`register.origin.short.${entry.origin}`)");
    expect(page).toContain("heardText(entry)");
    expect(page).toContain('class="pending"');
    expect(page).toContain("showToast(message)");
    const importForm = read("components/RegisterImport.svelte");
    expect(importForm).toContain('class="table-box preview"');
    expect(importForm).toContain("chipClass(ROW_TINT[status])");
  });

  it("the radio is a state card, a contacts table and a monospaced log list with Clear", () => {
    const page = read("pages/RadioPage.svelte");
    expect(page).toContain('class="card state"');
    expect(page).toContain('<dl class="dl">');
    expect(page).toContain('class="msg msg-warn" role="alert"');
    expect(page).toContain('class="table-box contacts"');
    expect(page).toContain('<ol class="rows rows-log">');
    expect(page).toContain("[...radio.log()].reverse()");
    expect(page).toContain("radio.clearLog()");
    expect(page).not.toContain("<pre");
  });

  it("the settings are one column of cards, each with its own Save or an at-once switch", () => {
    const page = read("pages/SettingsPage.svelte");
    const cards = page.match(/<(form|section) class="card"/g) ?? [];
    expect(cards).toHaveLength(8);
    expect(page.match(/onsubmit=\{save(Operator|Radio|Hub)\}/g)).toHaveLength(3);
    expect(page.match(/t\("settings\.save"\)/g)).toHaveLength(3);
    expect(page.match(/showToast\(t\("settings\.saved"\)\)/g)).toHaveLength(3);
    expect(page).toContain("setClockConfirmed(");
    expect(page).toContain("updateSettings({ fontSize: size })");
    expect(page).toContain("<LanguageSelect");
    expect(page).toContain('hashFor("styleguide")');
    expect(page).toContain("formatBytes(usage.usage");
    expect(page).toContain("max-width: 44rem");
  });

  it("tables keep their numbers right-aligned and stick their header in a box", () => {
    const css = read("styles/components.css");
    expect(css).toMatch(/\.table \.num \{\s*text-align: right;/);
    expect(css).toMatch(/\.table th \{\s*position: sticky;/);
    expect(css).toContain(".table-box {");
    for (const file of [
      "pages/QueuePage.svelte",
      "components/BatchComposeForm.svelte",
      "components/RegisterImport.svelte",
    ]) {
      expect(read(file), file).toContain('class="num"');
    }
  });

  it("the transition sheet keeps only the print pages' rules and the alias block three names", () => {
    const transition = read("styles/transition.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(transition).not.toMatch(/^main\b/m);
    expect(transition).not.toMatch(/\.secondary|\.small\b|\.button\b|data-status/);
    const tokens = read("styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(tokens).not.toMatch(/--light:|--surface-in:|--surface-given-up:|--dot-/);
    const base = read("styles/base.css");
    expect(base).toMatch(/^main \{\s*max-width: 90rem;/m);
    const app = read("App.svelte");
    expect(app).toContain("<main>");
    expect(app).not.toContain("class:wide");
  });
});
