// The journal screen on the design language (P2-03, docs/design.md §Screens → Journal).
// Checked on the sources, since there is no component test harness: the six files of the
// screen lay out and nothing else (no colour, no size, no transition alias in their style
// blocks), the timeline is a row list with quiet row actions and chip counters on the batch
// row, the compose card's tabs key on aria-selected — New record first and on load,
// MeshCore second, one job each (P3-01) — the setup card is shown while no operator name
// is set and the gate sends every route there.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const JOURNAL_FILES = [
  "pages/JournalPage.svelte",
  "components/Timeline.svelte",
  "components/ComposeForm.svelte",
  "components/ManualEntryForm.svelte",
  "components/OpenItemsPanel.svelte",
  "components/LastHeardPanel.svelte",
  "components/SetupCard.svelte",
];

function read(file: string): string {
  return readFileSync(join(srcDir, file), "utf8");
}

function styleBlock(text: string): string {
  const match = /<style[^>]*>([\s\S]*?)<\/style>/.exec(text);
  return match?.[1] ?? "";
}

// What a component's <style> may not say (docs/design.md §Components: "a component <style>
// block may only lay out"). Padding, gaps and widths in tokens are layout.
const NOT_LAYOUT =
  /^\s*(color|background[\w-]*|border(-[\w-]+)?-color|border|box-shadow|outline|font-size|font-weight|opacity)\s*:/m;

describe("the journal screen", () => {
  it("its components carry no colour or size of their own", () => {
    for (const file of JOURNAL_FILES) {
      const style = styleBlock(read(file));
      expect(style, file).not.toMatch(NOT_LAYOUT);
      expect(style, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it("uses none of the P1-09 transition aliases", () => {
    for (const file of JOURNAL_FILES) {
      expect(read(file), file).not.toMatch(
        /--navy|--light\b|--muted|--line\b|--error\b|--surface-in|--surface-given-up|--dot-/,
      );
    }
  });

  it("the timeline is a row list with quiet row actions and a dot per state", () => {
    const timeline = read("components/Timeline.svelte");
    expect(timeline).toContain('<ol class="rows">');
    expect(timeline).not.toContain("<table");
    expect(timeline).toContain('class="row-actions"');
    expect(timeline).toContain('class="btn btn-quiet"');
    expect(timeline).not.toMatch(/class="(secondary|small|link|pill)"/);
    expect(timeline).toContain("stripChip(item.kind)");
    expect(timeline).toContain("counterChips(row.counters)");
    expect(timeline).toContain('class="rows-top"');
    expect(timeline).toContain('class="msg row-note"');
    expect(timeline).toContain('class="row-detail"');
    expect(timeline).toContain("DIRECTION_GLYPH[direction]");
  });

  it("the compose card is one card with two tabs keyed on aria-selected", () => {
    const page = read("pages/JournalPage.svelte");
    expect(page).toContain('class="tabs" role="tablist"');
    expect(page.match(/aria-selected=\{tab === "/g)).toHaveLength(2);
    expect(page).toContain("<ComposeForm");
    expect(page).toContain("<ManualEntryForm");
    expect(page).toContain("grid-template-columns: minmax(0, 1fr) 320px");
    expect(page).toContain("@media (max-width: 60rem)");
  });

  it("New record is the first tab and the one shown on load; MeshCore is the second (P3-01)", () => {
    const page = read("pages/JournalPage.svelte");
    expect(page).toContain('let tab: "record" | "meshcore" = $state("record");');
    const record = page.indexOf('id="tab-record"');
    const meshcore = page.indexOf('id="tab-meshcore"');
    expect(record).toBeGreaterThan(-1);
    expect(meshcore).toBeGreaterThan(record);
    expect(page.slice(record, meshcore)).toContain('t("journal.add.title")');
    expect(page.slice(meshcore)).toContain('t("journal.compose.title")');
    // A opens New record, N opens MeshCore: each form reveals its own tab.
    expect(page).toContain('onreveal={() => (tab = "record")}');
    expect(page).toContain('onreveal={() => (tab = "meshcore")}');
    expect(read("components/ManualEntryForm.svelte")).toContain('onShortcut("addNote"');
    expect(read("components/ComposeForm.svelte")).toContain('onShortcut("newMessage"');
    // Reply goes to the tab the incoming message's transport decides.
    expect(page).toContain("replyPrefill(entry)");
  });

  it("MeshCore has no Via control and always sends; New record offers phone, courier, verbal for the two message types (P3-01)", () => {
    const meshcore = read("components/ComposeForm.svelte");
    expect(meshcore).not.toContain("send.transport");
    expect(meshcore).not.toContain("TRANSPORTS");
    expect(meshcore).toContain("composeMeshMessage({");
    expect(meshcore).toContain('{t("send.send")}');
    expect(meshcore).not.toContain("send.record");
    expect(meshcore).toContain('t("send.bytes"');

    const record = read("components/ManualEntryForm.svelte");
    expect(record).toContain("{#each RECORD_TYPES as option (option)}");
    expect(record).toContain("{#each NON_MESH_TRANSPORTS as option (option)}");
    expect(record).not.toContain("send.transport.mesh");
    expect(record).toContain('{t("send.record")}');
    expect(record).not.toContain("send.bytes");
    // From on an incoming message, To on an outgoing one; both and Via only for messages.
    expect(record).toContain(
      'kind === "message_in" ? t("journal.add.counterparty") : t("journal.add.recipient")',
    );
    expect(record).toContain("{#if isMessage}");
    expect(record).toContain("resendByHand(closes, { transport, body: text })");
  });

  it("the side cards are cards with the count in the title", () => {
    for (const file of ["components/OpenItemsPanel.svelte", "components/LastHeardPanel.svelte"]) {
      const text = read(file);
      expect(text, file).toContain('class="card"');
      expect(text, file).toContain('class="count"');
      expect(text, file).toMatch(/class="rows rows-[23]"/);
    }
  });

  it("the setup card shows while no operator name is set, and the gate goes to the journal", () => {
    const page = read("pages/JournalPage.svelte");
    expect(page).toContain("{#if !hasOperatorName()}");
    expect(page).toContain("<SetupCard />");
    const setup = read("components/SetupCard.svelte");
    expect(setup).toContain("updateSettings({ operatorName: trimmed })");
    expect(setup).toContain("setClockConfirmed(");
    expect(setup).toContain("radio.connect(kind)");
    const app = read("App.svelte");
    expect(app).toContain(': "journal",');
    expect(app).not.toContain(': "settings");');
  });

  it("the forms are on the components, not the transition rules", () => {
    for (const file of ["components/ComposeForm.svelte", "components/ManualEntryForm.svelte"]) {
      const text = read(file);
      expect(text, file).toContain('class="btn btn-primary"');
      expect(text, file).toContain('class="field field-grow text"');
      expect(text, file).toContain('class="meta field-help"');
      expect(text, file).not.toMatch(/class="(secondary|small|error)"/);
    }
  });
});
