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

  it("the timeline is a row list with quiet row actions and the status column", () => {
    const timeline = read("components/Timeline.svelte");
    expect(timeline).toContain('<ol class="rows">');
    expect(timeline).not.toContain("<table");
    expect(timeline).toContain('class="row-actions"');
    expect(timeline).toContain('class="btn btn-quiet"');
    expect(timeline).not.toMatch(/class="(secondary|small|link|pill)"/);
    expect(timeline).toContain("<StatusColumnHead>");
    expect(read("components/RowHistory.svelte")).toContain('class="row-detail"');
    expect(timeline).toContain("DIRECTION_GLYPH[direction]");
    expect(read("components/StatusColumnHead.svelte")).toContain('class="rows-top"');
  });

  // Every rule of components.css as [selector, declarations]; the rules inside a @media
  // block come out on their own, the block's own line is skipped.
  function cssRules(css: string): [string, string][] {
    return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (match) => [(match[1] ?? "").trim(), match[2] ?? ""],
    );
  }

  // What a hover rule may change: the colours and the pointer, never a box property.
  const HOVER_MAY_CHANGE = new Set([
    "background",
    "background-color",
    "color",
    "border-color",
    "box-shadow",
    "cursor",
    "text-decoration",
  ]);

  it("a row is one line at rest and nothing appears or grows on hover (P3-04)", () => {
    const css = read("styles/components.css");
    const hoverRules = cssRules(css).filter(([selector]) => selector.includes(":hover"));
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const [selector, declarations] of hoverRules) {
      for (const declaration of declarations.split(";")) {
        const property = declaration.split(":")[0]?.trim() ?? "";
        if (property !== "") {
          expect(HOVER_MAY_CHANGE.has(property), `${selector} { ${property} }`).toBe(true);
        }
      }
    }
    // The hover reveal of P2-03 is gone: the action row is never hidden, nothing keys on
    // focus-within or on "always", and the row's hover rule tints only.
    expect(css).not.toMatch(/\.row-actions \{[^}]*display: none/);
    expect(css).not.toContain(":focus-within");
    expect(css).not.toContain("rows-actions-always");
    expect(css).not.toContain("data-expanded");
    expect(css).toMatch(
      /^\.rows > :hover,\s*\.rows > \[data-open="true"\],\s*\.rows > \[data-nested="true"\] \{\s*background: var\(--surface-2\);\s*\}/m,
    );
    // The line is a subgrid of the row with no padding of its own; the area spans the
    // columns under it.
    expect(css).toMatch(/^\.row-line \{\s*display: grid;\s*grid-template-columns: subgrid;/m);
    expect(css).toMatch(/^\.row-area \{\s*grid-column: 1 \/ -1;/m);
    expect(css).not.toMatch(/^\.row-line \{[^}]*padding/m);
    // No "History" / "Hide history" / "Recipients" toggle anywhere, nor its keys.
    for (const file of [
      "components/Timeline.svelte",
      "components/Row.svelte",
      "components/RowHistory.svelte",
      "pages/HandoverPage.svelte",
    ]) {
      expect(read(file), file).not.toMatch(/action\.history|hideHistory|batch\.(expand|collapse)/);
      expect(read(file), file).not.toContain("rows-actions-always");
      expect(read(file), file).not.toContain("data-expanded");
    }
    for (const catalog of ["i18n/en.json", "i18n/da.json"]) {
      expect(read(catalog), catalog).not.toMatch(
        /journal\.action\.history|journal\.action\.hideHistory|journal\.batch\.expand|journal\.batch\.collapse/,
      );
    }
  });

  it("the row is one button: click, Enter or Space toggles it, a link or a selection does not (P3-04)", () => {
    const row = read("components/Row.svelte");
    expect(row).toContain('<div\n    class="row-line"\n    role="button"');
    expect(row).toContain("aria-expanded={openable ? open : undefined}");
    expect(row).toContain("aria-controls={showArea ? areaId : undefined}");
    expect(row).toContain('<div class="row-area" id={areaId}>');
    expect(row).toContain("clickToggles(target, window.getSelection(), lineElement)");
    expect(row).toContain('event.key === "Enter" || event.key === " "');
    expect(row).toContain("event.preventDefault();");
    expect(row).not.toContain("onmouseenter");
    expect(row).not.toContain("onmouseover");
    // The timeline keeps one row open through the pure rule; Esc closes a form, then the
    // open row; J / K walk the lines.
    const timeline = read("components/Timeline.svelte");
    expect(timeline).toContain("opened = toggleRow(opened, id, place)");
    expect(timeline).toContain("opened = closeOne(opened)");
    expect(timeline).toContain("opened = revealRow(row, id)");
    expect(timeline).toContain('onShortcut("cancel", closeCurrent)');
    expect(timeline).not.toContain('onShortcut("expandRow"');
    expect(timeline).toContain('querySelectorAll<HTMLElement>(".row-line[data-row]")');
    expect(timeline.match(/<Row\n/g)).toHaveLength(3);
    // The overlay says Enter or Space.
    expect(read("lib/shortcuts.ts")).toContain(
      '{ action: "expandRow", keys: ["Enter", "Space"], inTextField: false }',
    );
    expect(read("components/ShortcutHelp.svelte")).toContain('t("shortcuts.or")');
  });

  it("the open row lists its history with times and exactly the actions of its kind (P3-04)", () => {
    const timeline = read("components/Timeline.svelte");
    // Three areas: a message (history, the answered message, the form or the actions), a
    // batch (Retry all given up), an entry (the versions, the answers, Reply / Correct).
    expect(timeline.match(/\{#snippet area\(\)\}/g)).toHaveLength(3);
    expect(timeline.match(/<RowHistory\n/g)).toHaveLength(1);
    expect(timeline).toContain(
      "<RowHistory {entry} corrections={row.corrections} {byId} onjump={scrollToEntry} />",
    );
    expect(timeline).toContain("messageActions({");
    expect(timeline).toContain("entryActions(entry.type)");
    expect(timeline).toContain("batchActions(canRetryAll.length)");
    expect(timeline).toContain('actions.includes("retry") || actions.includes("send")');
    expect(timeline).toContain('{#if actions.includes("mark")}');
    expect(timeline).toContain('{#if actions.includes("reply")}');
    expect(timeline).toContain('{#if actions.includes("correct")}');
    expect(timeline).toContain('t("queue.retryAll", { count: canRetryAll.length })');
    // The forms replace the action row while they are open.
    expect(timeline).toMatch(
      /\{#if changingStatus === entry\.id\}\s*\{@render statusForm\(entry\)\}\s*\{:else if correcting === entry\.id\}\s*\{@render correctionForm\(\)\}\s*\{:else\}\s*<div class="row-actions">/,
    );
    // The reply links sit in the area, not on the line.
    expect(timeline.match(/<p class="row-links">/g)).toHaveLength(2);
    expect(timeline).not.toMatch(/<div class="row-body">[^]*?btn-link[^]*?<\/div>\s*<StatusSlots/);
    // The history with times and operators, the roger's source as a jump.
    const history = read("components/RowHistory.svelte");
    expect(history).toContain("{formatTime(item.entry.timestamp)}");
    expect(history).toContain("{historyDetail(item.entry, byId)}");
    expect(history).toContain('<span class="row-meta">{item.entry.operator}</span>');
    expect(history).toContain("{#each versions as version, index (version.id)}");
    expect(history).toContain("onclick={() => onjump(source.id)}");
    // The handover's three entry lists and the open-items card share the behaviour: the
    // same Row with its history, one row open at a time on the page; an open item jumps to
    // its row, which opens.
    const handover = read("pages/HandoverPage.svelte");
    expect(handover.match(/<Row\n/g)).toHaveLength(3);
    expect(handover.match(/<RowHistory/g)).toHaveLength(3);
    expect(handover).toContain("openRow = openRow === id ? null : id");
    expect(handover).toContain('onShortcut("cancel"');
    expect(read("components/OpenItemsPanel.svelte")).toContain("onselect(item.message.id)");
    expect(read("pages/JournalPage.svelte")).toContain("timeline?.scrollToEntry(id)");
  });

  it("the status is a fixed column of three symbol slots, no time in the list (P3-03)", () => {
    const timeline = read("components/Timeline.svelte");
    // A message row and a batch row carry the column; the strip of chips is gone.
    expect(timeline).toContain(
      "<StatusSlots strip={view.strip} transport={entry.transport} {inflightText} />",
    );
    expect(timeline).toContain("<StatusSlots counters={row.counters} />");
    expect(timeline).not.toContain("stripChip");
    expect(timeline).not.toContain("stripText");
    expect(timeline).not.toContain("counterChips");
    expect(timeline).not.toContain('class="row-strip strip"');
    // An incoming row, a note and a correction render nothing in the column; the "answered"
    // marks sit in the open row's area (P3-04), never in the column.
    expect(timeline.match(/<StatusSlots /g)).toHaveLength(2);
    expect(timeline).toMatch(
      /<p class="row-links">\s*\{#each row\.answeredBy as reply \(reply\.id\)\}[\s\S]*?<\/p>/,
    );
    // The header's labels are stuck to the top of the box, the "N new" chip at their left.
    expect(timeline).toMatch(
      /<StatusColumnHead>\s*\{#if newCount > 0\}\s*<button type="button" class="chip chip-accent"/,
    );
    const head = read("components/StatusColumnHead.svelte");
    expect(head).toContain('<div class="rows-head">');
    expect(head).toContain("{#each SLOT_NAMES as name (name)}");
    expect(head).toContain("{t(`journal.slot.${name}`)}");
    const css = read("styles/components.css");
    expect(css).toMatch(/^\.rows-head \{\s*position: sticky;\s*top: 0;/m);
    expect(css).toMatch(
      /grid-template-columns: max-content max-content minmax\(0, 1fr\) calc\(3 \* var\(--slot-w\)\);/,
    );
    expect(css).toMatch(/^\.rows \{\s*--slot-w: 4rem;/m);
    expect(css).toMatch(/^\.rows-3 \{\s*--slot-w: 1\.5rem;/m);
    expect(css).not.toContain(".strip {");
    // The slots: the rule, the symbol per slot, the words in title and aria-label only.
    const slots = read("components/StatusSlots.svelte");
    expect(slots).toContain("statusSlots(strip, transport)");
    expect(slots).toContain("countSlots(counters)");
    expect(slots).toContain('<span class="row-strip slots" data-slots="message">');
    expect(slots).toContain('<span class="row-strip slots slots-counts" data-slots="counts">');
    expect(slots).toContain("<SlotSymbol shape={slot.shape} />");
    expect(slots).toContain("{#if counters.givenUp > 0}");
    expect(slots).toContain('<SlotSymbol shape="cross" />{counters.givenUp}');
    expect(slots).not.toMatch(/formatTime|formatShortTime|formatDateTime/);
    for (const use of slots.matchAll(/\b(slotText|countSlotText)\(/g)) {
      expect(slots.slice(Math.max(0, use.index - 24), use.index)).toMatch(/\{@const text = $/);
    }
    expect(slots.match(/title=\{text\}\s*aria-label=\{text\}/g)).toHaveLength(3);
    expect(slots).not.toContain("tabindex");
    // Five shapes, drawn, not tinted apart: a hollow and a filled circle, the check, the
    // clock, the cross.
    const symbol = read("components/SlotSymbol.svelte");
    for (const shape of ["hollow", "filled", "check", "clock", "cross"]) {
      expect(symbol).toContain(`"${shape}"`);
    }
    expect(symbol).toContain('aria-hidden="true"');
    expect(css).toMatch(/^:root\[data-contrast="high"\] \.slot,[\s\S]*?color: var\(--ink\);/m);
    // High contrast keeps the shapes and drops the tints; the print block does the same.
    expect(css.slice(css.lastIndexOf("@media print"))).toMatch(
      /\.slot,[\s\S]*?color: var\(--ink\);/,
    );
  });

  it("Correct is one box with the current text under the row, its text hidden; the row reads the corrected text with a chip (P3-02)", () => {
    const timeline = read("components/Timeline.svelte");
    // The form: prefilled off the row's corrections, the target the row's own entry, Save on
    // the pure rule, the stored text with the fixed prefix put back.
    expect(timeline).toContain("buildCorrectionForm(entry, corrections)");
    expect(timeline).toContain("canSaveCorrection(correction, correctionBody)");
    expect(timeline).toContain("oncorrect(form.target, correctedText(form, correctionBody))");
    expect(timeline).toContain("field.setSelectionRange(field.value.length, field.value.length)");
    expect(timeline).toContain('<textarea\n          id="correction-text"');
    expect(timeline).toContain(
      '<label class="row-meta" for="correction-text">{t("journal.correction.text")}</label>',
    );
    expect(timeline).toContain("<span data-prefix>{correction.prefix.trimEnd()}</span>");
    expect(timeline).not.toContain('placeholder={t("journal.correction.text")}');
    // The row's own text is hidden while the form is open in the row's area (P3-04): one
    // copy on screen.
    expect(
      timeline.match(/<div class="row-body">\s*\{#if correcting !== entry\.id\}/g),
    ).toHaveLength(2);
    expect(
      timeline.match(/if correcting === entry\.id\}\s*\{@render correctionForm\(\)\}/g),
    ).toHaveLength(2);
    expect(timeline).toContain("{currentText(entry, view.corrections)}");
    expect(timeline).toContain("{currentText(entry, row.corrections)}");
    expect(timeline).not.toContain('{entry.text ?? ""}');
    // The chip after the time, the versions in the history, the 14 px line gone.
    expect(timeline).toContain("data-corrected={latest.id}");
    expect(timeline).toContain('<Icon name="edit" />{t("journal.correction.corrected")}');
    const history = read("components/RowHistory.svelte");
    expect(history).toContain("textVersions(entry, corrections)");
    expect(history).toContain('data-version={index === 0 ? "original" : "correction"}');
    expect(timeline).not.toContain("row-note");
    expect(read("styles/components.css")).not.toContain(".row-note");
    // Esc cancels through the shortcut dispatcher, like every row form.
    expect(timeline).toContain('onShortcut("cancel"');
    // Only a note, an incoming and an outgoing message are correctable (lib/rowActions.ts).
    const actions = read("lib/rowActions.ts");
    expect(actions).toContain('case "message_in":\n      return ["reply", "correct"];');
    expect(actions).toContain('case "note":\n      return ["correct"];');
    expect(actions).toContain('actions.push("correct");');
  });

  it("every screen reads a text through currentText (P3-02)", () => {
    expect(read("components/OpenItemsPanel.svelte")).toContain("{item.text}");
    expect(read("components/OpenItemsPanel.svelte")).not.toContain("item.message.text");
    const handover = read("pages/HandoverPage.svelte");
    expect(handover.match(/currentText\(view\.entry, view\.corrections\)/g)).toHaveLength(2);
    expect(handover).toContain("correctionsByTarget(entries)");
    expect(handover).toContain('<span class="row-body">{text(entry)}</span>');
    expect(handover).not.toContain('entry.text ?? ""}</span>');
  });

  it("the handover lists and the open-items card use the same column component (P3-03)", () => {
    const handover = read("pages/HandoverPage.svelte");
    expect(handover).toContain("<StatusSlots");
    expect(handover).toContain("inflightText={inflight(view.entry.id)}");
    expect(handover).not.toContain("stripChip");
    expect(handover).not.toContain("stripText");
    // The header labels on both lists of outgoing messages; the age after the time.
    expect(handover.match(/<StatusColumnHead \/>/g)).toHaveLength(2);
    expect(handover).toContain('<span class="row-meta age" title={t("handover.column.age")}');
    expect(handover).not.toContain('class="row-strip strip"');
    const open = read("components/OpenItemsPanel.svelte");
    expect(open).toContain("<StatusSlots strip={item.strip} transport={item.message.transport} />");
    expect(open).not.toContain("statusChip");
    // The queue's table keeps its chip, with the column's symbol in it instead of the dot
    // (the counter chips in the card's title keep theirs: nothing more changes there).
    const queue = read("pages/QueuePage.svelte");
    expect(queue).toContain("<SlotSymbol shape={queueRowShape(row.status)} />");
    expect(queue).not.toMatch(/<td class="state">[\s\S]*?chip-dot[\s\S]*?<\/td>/);
    // Print keeps the strip's words with their times.
    const print = read("pages/PrintPage.svelte");
    expect(print).toContain("stripText(item, null)");
    expect(print).not.toContain("StatusSlots");
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
