<script lang="ts">
  // The incident's journal as a list of message slips (P0-07, reshaped in P1-01, on the row
  // list in P2-03): one row per entry, newest on top, laid on the columns time | who | body |
  // status. An outgoing message carries its status in the fixed column at the right (P3-03,
  // StatusSlots.svelte): three slots — sent · delivered · confirmed — one symbol each under
  // the header's labels, the times in the slots' tooltips and nowhere else in the list; its
  // transitions are not rows but a history the operator opens on the row (a 14 px list
  // under it, with the times). Incoming and outgoing are told apart by the glyph before the
  // counterparty (→ out, ← in) and by the counterparty itself; an incoming row, a note and
  // a correction leave the column empty. The messages of one send-to-all are one row with
  // a count per slot that opens into one row per recipient. A corrected entry reads its
  // latest correction's text as its text, with a "corrected" chip after the time; its
  // history lists the original and every correction (P3-02). The view stays at the top
  // unless the operator scrolled down; then new rows arrive above without moving the
  // viewport and a "N new" chip, on the column header stuck to the top of the box, jumps
  // back up.
  //
  // Row actions — Reply on an incoming message (P1-02), Retry / Send for a mesh message
  // nobody is sending, Mark (a manual status with a required reason), History, Correct —
  // are quiet buttons on a line under the row, shown while the pointer or the focus is on
  // the row and always on an expanded row. A reply carries "↳ answers ‹time›" after its
  // text and the incoming row "answered ‹time›", each a link to the other row. Correct
  // (P3-02) hides the row's text and opens one box under the row holding the current text
  // (the "#n " of a message fixed in front of it); Save appends a correction referring to
  // the original entry (lib/correctionForm.ts), and the row shows the corrected text.
  //
  // Keyboard (P1-09): one row is the current row (accent-weak); J / K move it (and the
  // focus) down and up, Enter opens or closes it (a batch's recipients, a message's history),
  // R replies to it when it is incoming, Esc closes an open row form. The rows are one tab
  // stop (roving tabindex): Tab lands on the current row, J / K walk. The look is
  // components.css's `.rows`; this file lays nothing out of its own.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import {
    canSaveCorrection,
    correctedText,
    correctionForm as buildCorrectionForm,
    type CorrectionForm,
  } from "../lib/correctionForm.ts";
  import { DIRECTION_GLYPH } from "../lib/journalRows.ts";
  import {
    batchText,
    formatDateTime,
    formatShortTime,
    formatTime,
    historyDetail as historyDetailOf,
    rogerSource as rogerSourceOf,
  } from "../lib/journalText.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import {
    countNewRows,
    currentText,
    findRow,
    textVersions,
    type MessageView,
    type TimelineRow,
  } from "../store/journalView.ts";
  import { manualStatusesFor } from "../store/outgoing.ts";
  import type { JournalEntry, Status } from "../store/types.ts";
  import Icon from "./Icon.svelte";
  import StatusColumnHead from "./StatusColumnHead.svelte";
  import StatusSlots from "./StatusSlots.svelte";

  interface Props {
    rows: readonly TimelineRow[];
    // Register entry id -> label.
    labels: ReadonlyMap<string, string>;
    // Every entry of the incident by id, to resolve a roger's text (the incoming entry's id).
    byId: ReadonlyMap<string, JournalEntry>;
    // What the outbox or the queue is doing with a message right now, or null when neither
    // holds it.
    inflight: (messageId: string) => string | null;
    canRetry: (message: JournalEntry) => boolean;
    onretry: (message: JournalEntry) => void;
    onmanual: (message: JournalEntry, status: Status, reason: string) => Promise<void>;
    // A correction of `entry` (always the original entry of a row) with the whole corrected
    // text.
    oncorrect: (entry: JournalEntry, text: string) => Promise<void>;
    // Reply to an incoming message: the parent hands it to the compose form.
    onreply: (entry: JournalEntry) => void;
  }
  let { rows, labels, byId, inflight, canRetry, onretry, onmanual, oncorrect, onreply }: Props =
    $props();

  let box: HTMLDivElement | undefined = $state(undefined);
  // True while the view is at the top; a scroll down turns it off, a scroll back up on.
  let stickToTop = $state(true);
  // The row ids on the timeline when the operator scrolled down; rows not in it are new.
  let seen: ReadonlySet<string> | null = $state.raw(null);
  // Which batch rows show their recipients and which rows show their history.
  let expanded: Record<string, boolean> = $state({});
  // The current row for the keyboard (an entry id, or a batch id), or null before J / K, a
  // focus or a jump from a side card set one.
  let cursor: string | null = $state(null);

  // Which row has its correction form or its status form open, and the texts typed in them.
  // The correction form: what the box opened with (the prefix and the current text) and the
  // body as typed.
  let correcting: string | null = $state(null);
  let correction: CorrectionForm | null = $state.raw(null);
  let correctionBody = $state("");
  let correctionField: HTMLTextAreaElement | undefined = $state(undefined);
  let changingStatus: string | null = $state(null);
  let reason = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);

  const AT_TOP_SLACK_PX = 8;

  const newCount = $derived(seen === null ? 0 : countNewRows(rows, seen));
  // Save is disabled while the text is unchanged or empty.
  const canSave = $derived(correction !== null && canSaveCorrection(correction, correctionBody));

  // The rows Enter can open or close: a batch (its recipients), a message with a history and
  // any row with corrections (its versions).
  const toggleable = $derived.by(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.kind === "batch") {
        ids.add(row.id);
        for (const view of row.messages) {
          if (view.history.length > 0 || view.corrections.length > 0) {
            ids.add(view.entry.id);
          }
        }
      } else if (row.kind === "message") {
        if (row.message.history.length > 0 || row.message.corrections.length > 0) {
          ids.add(row.id);
        }
      } else if (row.corrections.length > 0) {
        ids.add(row.id);
      }
    }
    return ids;
  });

  function onscroll() {
    if (box === undefined) {
      return;
    }
    if (box.scrollTop <= AT_TOP_SLACK_PX) {
      stickToTop = true;
      seen = null;
    } else if (stickToTop) {
      stickToTop = false;
      seen = new Set(rows.map((row) => row.id));
    }
  }

  function jumpToTop() {
    stickToTop = true;
    seen = null;
    if (box !== undefined) {
      box.scrollTop = 0;
    }
  }

  function focusRow(id: string) {
    box?.querySelector<HTMLElement>(`li[data-entry-id="${id}"]`)?.focus({ preventScroll: true });
  }

  // A jump from a side card or a reply mark: the row that shows the entry becomes the
  // current row (opened when it is a batch) and the entry is scrolled into the middle.
  export async function scrollToEntry(id: string): Promise<void> {
    const row = findRow(rows, id);
    if (row === undefined) {
      return;
    }
    if (row.kind === "batch") {
      expanded[row.id] = true;
    }
    cursor = row.id;
    await tick();
    const target = box?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
    target?.scrollIntoView({ block: "center" });
    focusRow(row.id);
  }

  function toggle(id: string) {
    expanded[id] = expanded[id] !== true;
  }

  // --- the keyboard cursor ------------------------------------------------------------------

  function rowElements(): HTMLLIElement[] {
    return box === undefined ? [] : [...box.querySelectorAll<HTMLLIElement>("li[data-entry-id]")];
  }

  // The first row is the tab stop until a cursor is set.
  function rowTabIndex(id: string): number {
    const firstId = rows[0]?.id;
    return (cursor ?? firstId) === id ? 0 : -1;
  }

  // The row the keys act on: the focused row when the focus is on one, else the cursor row.
  function currentRowId(): string | null {
    const active = document.activeElement;
    if (box !== undefined && active instanceof HTMLElement && box.contains(active)) {
      const row = active.closest<HTMLLIElement>("li[data-entry-id]");
      if (row !== null && active === row) {
        return row.dataset["entryId"] ?? null;
      }
    }
    return cursor;
  }

  function move(delta: number): boolean {
    const elements = rowElements();
    if (elements.length === 0) {
      return false;
    }
    const index = elements.findIndex((row) => row.dataset["entryId"] === cursor);
    const next = index === -1 ? 0 : Math.min(elements.length - 1, Math.max(0, index + delta));
    const row = elements[next];
    if (row === undefined) {
      return false;
    }
    cursor = row.dataset["entryId"] ?? null;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
    return true;
  }

  function expandCurrent(): boolean {
    const id = currentRowId();
    // Enter with the focus elsewhere (a button, a link) is that element's own.
    if (id === null || document.activeElement?.getAttribute("data-entry-id") !== id) {
      return false;
    }
    if (!toggleable.has(id)) {
      return false;
    }
    toggle(id);
    return true;
  }

  function replyCurrent(): boolean {
    const id = currentRowId();
    const entry = id === null ? undefined : byId.get(id);
    if (entry === undefined || entry.type !== "message_in") {
      return false;
    }
    onreply(entry);
    return true;
  }

  $effect(() => {
    const offs = [
      onShortcut("nextRow", () => move(1)),
      onShortcut("previousRow", () => move(-1)),
      onShortcut("expandRow", expandCurrent),
      onShortcut("reply", replyCurrent),
      onShortcut("cancel", () => {
        if (correcting === null && changingStatus === null) {
          return false;
        }
        cancelForms();
        return true;
      }),
    ];
    return () => {
      for (const off of offs) {
        off();
      }
    };
  });

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  // The words of a row (strip, counters, history) live in lib/journalText.ts, shared with
  // the print view (P1-04); only the incident's entries are bound here.
  function historyDetail(entry: JournalEntry): string {
    return historyDetailOf(entry, byId);
  }

  function rogerSource(entry: JournalEntry): JournalEntry | undefined {
    return rogerSourceOf(entry, byId);
  }

  // The time cell's tooltip: the full date and time, and who recorded the entry (the
  // operator has no column of its own on a slip; the print view keeps one).
  function recordedBy(entry: JournalEntry): string {
    return `${formatDateTime(entry.timestamp)} · ${entry.operator}`;
  }

  function label(entry: JournalEntry): string {
    return labels.get(entry.counterpartyId ?? "") ?? "";
  }

  // The entries whose text can be corrected: a note, an incoming and an outgoing message.
  function correctable(entry: JournalEntry): boolean {
    return entry.type === "note" || entry.type === "message_in" || entry.type === "message_out";
  }

  // The latest correction of an entry, for the chip's tooltip; undefined when none.
  function latestCorrection(
    entry: JournalEntry,
    corrections: readonly JournalEntry[],
  ): JournalEntry | undefined {
    const versions = textVersions(entry, corrections);
    return versions.length > 1 ? versions[versions.length - 1] : undefined;
  }

  // Correct: the row's text becomes the box, prefilled with the current text, the cursor at
  // its end. The row's own entry is the target, also when it was corrected before.
  async function startCorrection(entry: JournalEntry, corrections: readonly JournalEntry[]) {
    error = null;
    changingStatus = null;
    correction = buildCorrectionForm(entry, corrections);
    correctionBody = correction.body;
    correcting = entry.id;
    await tick();
    const field = correctionField;
    if (field !== undefined) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }

  function startStatus(entry: JournalEntry) {
    error = null;
    correcting = null;
    correction = null;
    changingStatus = entry.id;
    reason = "";
  }

  function cancelForms() {
    const rowId = correcting ?? changingStatus;
    correcting = null;
    correction = null;
    changingStatus = null;
    error = null;
    if (rowId !== null) {
      void tick().then(() => focusRow(rowId));
    }
  }

  async function saveCorrection(event: SubmitEvent) {
    event.preventDefault();
    const form = correction;
    if (form === null || !canSave || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await oncorrect(form.target, correctedText(form, correctionBody));
      correcting = null;
      correction = null;
      correctionBody = "";
      await tick();
      focusRow(form.target.id);
    } catch (failure) {
      error = t("journal.correction.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function saveStatus(message: JournalEntry, status: Status) {
    if (reason.trim() === "" || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await onmanual(message, status, reason);
      changingStatus = null;
      reason = "";
    } catch (failure) {
      error = t("send.manual.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function canChangeStatus(view: MessageView): boolean {
    return (
      view.status !== "roger" &&
      view.entry.transport !== undefined &&
      inflight(view.entry.id) === null
    );
  }
</script>

<!-- The time, with the clock-trust mark: a "?" for unknown, a "✓" for manual, nothing for
     ntp; the sentence from the settings as its tooltip. After it, on a corrected entry, the
     "corrected" chip with the latest correction's time and operator as its tooltip. -->
{#snippet timeCell(entry: JournalEntry, corrections: readonly JournalEntry[])}
  {@const latest = latestCorrection(entry, corrections)}
  <span class="row-time" title={recordedBy(entry)}>
    {formatTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="row-trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
      >{/if}{#if latest !== undefined}<span
        class="chip"
        data-corrected={latest.id}
        title={t("journal.correction.correctedBy", {
          time: formatShortTime(latest.timestamp),
          operator: latest.operator,
        })}><Icon name="edit" />{t("journal.correction.corrected")}</span
      >{/if}
  </span>
{/snippet}

<!-- The counterparty with the direction glyph in front; the transport after it when it is
     not the radio. -->
{#snippet whoCell(entry: JournalEntry, direction: "out" | "in", name: string)}
  <span class="row-who">
    <span class="row-dir" aria-hidden="true">{DIRECTION_GLYPH[direction]}</span><span
      class="visually-hidden"
      >{t(`journal.type.message_${direction}`)}
    </span>{name}
    {#if entry.transport !== undefined && entry.transport !== "mesh"}
      <span class="row-meta">· {t(`send.transport.${entry.transport}`)}</span>
    {/if}
  </span>
{/snippet}

{#snippet correctButton(entry: JournalEntry, corrections: readonly JournalEntry[])}
  {#if correctable(entry)}
    <button
      type="button"
      class="btn btn-quiet"
      aria-expanded={correcting === entry.id}
      onclick={() => startCorrection(entry, corrections)}
    >
      {t("journal.action.correct")}
    </button>
  {/if}
{/snippet}

<!-- The correction form, on the line under the row while the row's own text is hidden (one
     copy on screen): the label, the fixed "#n " of a message, the one box with the current
     text taking the width, Save (disabled while the text is unchanged or empty), Cancel;
     Esc cancels. -->
{#snippet correctionForm()}
  {#if correction !== null}
    <form class="row-form" onsubmit={saveCorrection}>
      <label class="row-meta" for="correction-text">{t("journal.correction.text")}</label>
      {#if correction.prefix !== ""}
        <span data-prefix>{correction.prefix.trimEnd()}</span>
      {/if}
      <div class="field field-grow">
        <textarea
          id="correction-text"
          rows="1"
          bind:this={correctionField}
          bind:value={correctionBody}
        ></textarea>
      </div>
      <button type="submit" class="btn btn-primary" disabled={busy || !canSave}>
        {t("journal.action.save")}
      </button>
      <button type="button" class="btn" onclick={cancelForms}>{t("journal.action.cancel")}</button>
      {#if error}
        <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
      {/if}
    </form>
  {/if}
{/snippet}

<!-- The versions of a corrected entry's text in a row's history: the original, then every
     correction, each with its time and operator. Nothing when the entry was never corrected. -->
{#snippet versionLines(entry: JournalEntry, corrections: readonly JournalEntry[])}
  {#each textVersions(entry, corrections) as version, index (version.id)}
    <li
      data-entry-id={index === 0 ? undefined : version.id}
      data-version={index === 0 ? "original" : "correction"}
      title={recordedBy(version)}
    >
      <span class="row-time">{formatTime(version.timestamp)}</span>
      <span
        >{index === 0 ? t("journal.correction.original") : t("journal.type.correction")}: {version.text ??
          ""}</span
      >
      <span class="row-meta">{version.operator}</span>
    </li>
  {/each}
{/snippet}

<!-- An outgoing message: the row with its status slots, its actions, its forms and its
     history (the transitions, then the text's versions) when open. `nested` marks a
     recipient row inside a batch. -->
{#snippet messageRow(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  {@const inflightText = inflight(entry.id)}
  {@const open = expanded[entry.id] === true}
  {@const lines = view.history.length + textVersions(entry, view.corrections).length}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <li
    data-type="message_out"
    data-entry-id={entry.id}
    data-nested={nested ? "true" : undefined}
    data-expanded={open ? "true" : undefined}
    aria-current={cursor === entry.id ? "true" : undefined}
    tabindex={rowTabIndex(entry.id)}
    onfocus={() => (cursor = entry.id)}
  >
    {@render timeCell(entry, view.corrections)}
    {@render whoCell(entry, "out", label(entry))}
    <div class="row-body">
      {#if correcting !== entry.id}
        {currentText(entry, view.corrections)}
        {#if view.answers !== null}
          {@const answers = view.answers}
          <button
            type="button"
            class="btn-link"
            title={answers.text ?? ""}
            onclick={() => scrollToEntry(answers.id)}
          >
            {t("journal.reply.answers", { time: formatShortTime(answers.timestamp) })}
          </button>
        {/if}
      {/if}
    </div>
    <StatusSlots strip={view.strip} transport={entry.transport} {inflightText} />
    <span class="row-actions">
      {#if canRetry(entry)}
        <button type="button" class="btn btn-quiet" onclick={() => onretry(entry)}>
          <Icon name="retry" />{view.status === "given_up" ? t("send.retry") : t("send.sendNow")}
        </button>
      {/if}
      {#if canChangeStatus(view)}
        <button type="button" class="btn btn-quiet" onclick={() => startStatus(entry)}>
          <Icon name="check" />{t("journal.action.status")}
        </button>
      {/if}
      {#if lines > 0}
        <button
          type="button"
          class="btn btn-quiet"
          aria-expanded={open}
          onclick={() => toggle(entry.id)}
        >
          <Icon name="history" />{open
            ? t("journal.action.hideHistory")
            : t("journal.action.history", { count: lines })}
        </button>
      {/if}
      {@render correctButton(entry, view.corrections)}
    </span>

    {#if changingStatus === entry.id && entry.transport !== undefined}
      <div class="row-form">
        <div class="field">
          <input
            type="text"
            placeholder={t("journal.manual.reason")}
            aria-label={t("journal.manual.reason")}
            bind:value={reason}
          />
        </div>
        {#each manualStatusesFor(entry.transport) as next (next)}
          <button
            type="button"
            class="btn"
            disabled={busy || reason.trim() === ""}
            onclick={() => saveStatus(entry, next)}
          >
            {t(`send.manual.${next}`)}
          </button>
        {/each}
        <button type="button" class="btn btn-quiet" onclick={cancelForms}
          >{t("journal.action.cancel")}</button
        >
        {#if error}
          <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
        {/if}
      </div>
    {/if}
    {#if correcting === entry.id}
      {@render correctionForm()}
    {/if}

    {#if open}
      <div class="row-detail">
        <ul>
          {#each view.history as item (item.entry.id)}
            {@const source = rogerSource(item.entry)}
            <li data-entry-id={item.entry.id}>
              <span class="row-time" title={formatDateTime(item.entry.timestamp)}
                >{formatTime(item.entry.timestamp)}</span
              >
              <span>
                {historyDetail(item.entry)}
                {#if source !== undefined}
                  <button type="button" class="btn-link" onclick={() => scrollToEntry(source.id)}>
                    {formatTime(source.timestamp)}
                  </button>
                {/if}
              </span>
              <span class="row-meta">{item.entry.operator}</span>
            </li>
            {#each item.corrections as correctionOfItem (correctionOfItem.id)}
              <li data-entry-id={correctionOfItem.id} title={recordedBy(correctionOfItem)}>
                <span class="row-time">{formatTime(correctionOfItem.timestamp)}</span>
                <span>{t("journal.type.correction")}: {correctionOfItem.text ?? ""}</span>
                <span class="row-meta">{correctionOfItem.operator}</span>
              </li>
            {/each}
          {/each}
          {@render versionLines(entry, view.corrections)}
        </ul>
      </div>
    {/if}
  </li>
{/snippet}

<div class="rows-box timeline" bind:this={box} {onscroll}>
  {#if rows.length === 0}
    <div class="empty"><p>{t("journal.entries.empty")}</p></div>
  {:else}
    <!-- The column header stuck to the top of the box; the "N new" chip at its left. -->
    <StatusColumnHead>
      {#if newCount > 0}
        <button type="button" class="chip chip-accent" onclick={jumpToTop}
          >{t("journal.timeline.newRows", { n: newCount })}</button
        >
      {/if}
    </StatusColumnHead>
    <ol class="rows">
      {#each rows as row (row.id)}
        {#if row.kind === "message"}
          {@render messageRow(row.message, false)}
        {:else if row.kind === "batch"}
          {@const open = expanded[row.id] === true}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            data-type="batch"
            data-entry-id={row.id}
            data-expanded={open ? "true" : undefined}
            aria-current={cursor === row.id ? "true" : undefined}
            tabindex={rowTabIndex(row.id)}
            onfocus={() => (cursor = row.id)}
          >
            {@render timeCell(row.entry, [])}
            {@render whoCell(
              row.entry,
              "out",
              t("journal.batch.toAll", { count: row.counters.total }),
            )}
            <span class="row-body">{batchText(row.body, row.drill)}</span>
            <StatusSlots counters={row.counters} />
            <span class="row-actions">
              <button
                type="button"
                class="btn btn-quiet"
                aria-expanded={open}
                onclick={() => toggle(row.id)}
              >
                <Icon name="chevron" />{open
                  ? t("journal.batch.collapse")
                  : t("journal.batch.expand", { count: row.counters.total })}
              </button>
            </span>
          </li>
          {#if open}
            {#each row.messages as view (view.entry.id)}
              {@render messageRow(view, true)}
            {/each}
          {/if}
        {:else}
          {@const entry = row.entry}
          {@const incoming = entry.type === "message_in"}
          {@const open = expanded[entry.id] === true}
          {@const lines = textVersions(entry, row.corrections).length}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            data-type={entry.type}
            data-entry-id={entry.id}
            data-expanded={open ? "true" : undefined}
            aria-current={cursor === entry.id ? "true" : undefined}
            tabindex={rowTabIndex(entry.id)}
            onfocus={() => (cursor = entry.id)}
          >
            {@render timeCell(entry, row.corrections)}
            {#if incoming}
              {@render whoCell(entry, "in", label(entry))}
            {:else}
              <span class="row-who">{entry.operator}</span>
            {/if}
            <!-- The column at the right stays empty: an incoming message, a note, the
                 incident's own status and a correction have no delivery status. The
                 "answered" marks sit after the text, as a reply's "answers" mark does. -->
            <div class="row-body">
              {#if correcting !== entry.id}
                {#if entry.type === "status_change"}
                  {t(`journal.status.${entry.newStatus ?? "pending"}`)}{#if entry.text}
                    · {currentText(entry, row.corrections)}{/if}
                {:else}
                  {currentText(entry, row.corrections)}
                {/if}
                {#each row.answeredBy as reply (reply.id)}
                  <button
                    type="button"
                    class="btn-link"
                    title={reply.text ?? ""}
                    onclick={() => scrollToEntry(reply.id)}
                  >
                    {t("journal.reply.answered", { time: formatShortTime(reply.timestamp) })}
                  </button>
                {/each}
              {/if}
            </div>
            <span class="row-actions">
              {#if incoming}
                <button type="button" class="btn btn-quiet" onclick={() => onreply(entry)}>
                  <Icon name="reply" />{t("journal.action.reply")}
                </button>
              {/if}
              {#if lines > 0}
                <button
                  type="button"
                  class="btn btn-quiet"
                  aria-expanded={open}
                  onclick={() => toggle(entry.id)}
                >
                  <Icon name="history" />{open
                    ? t("journal.action.hideHistory")
                    : t("journal.action.history", { count: lines })}
                </button>
              {/if}
              {@render correctButton(entry, row.corrections)}
            </span>
            {#if correcting === entry.id}
              {@render correctionForm()}
            {/if}
            {#if open}
              <div class="row-detail">
                <ul>
                  {@render versionLines(entry, row.corrections)}
                </ul>
              </div>
            {/if}
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* Layout only: the box fills what the column leaves it (JournalPage.svelte sizes the
     column) and scrolls inside. */
  .timeline {
    flex: 1 1 auto;
  }
</style>
