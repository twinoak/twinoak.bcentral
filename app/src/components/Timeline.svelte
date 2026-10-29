<script lang="ts">
  // The incident's journal as a stack of message slips (P0-07, reshaped in P1-01): one row
  // per entry, newest on top. An outgoing message carries its status strip ("sent 14:31 ·
  // delivered 14:32 · roger 14:35") under its text; its transitions are not rows but a
  // history the operator opens on the row. The messages of one send-to-all are one row with
  // counters that opens into one row per recipient. Corrections show under the entry they
  // correct. The view stays at the top unless the operator scrolled down; then new rows
  // arrive above without moving the viewport and a "N new" pill jumps back to the top.
  // Row actions: a correction of any entry, a manual status change on an outgoing message
  // (with a required reason), Retry / Send for a mesh message nobody is sending, and Reply on
  // an incoming message (P1-02). A reply carries "↳ answers ‹time›" under its text and the
  // incoming row "answered ‹time›", each a link to the other row.
  //
  // Keyboard (P1-09): one row is the current row, marked with a bar at its left edge; J / K
  // move it (and the focus) down and up, Enter opens or closes it (a batch's recipients, a
  // message's history), R replies to it when it is incoming, Esc closes an open row form.
  // The rows are one tab stop (roving tabindex): Tab lands on the current row, J / K walk.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import {
    batchText,
    countersText,
    formatDateTime,
    formatShortTime,
    formatTime,
    historyDetail as historyDetailOf,
    rogerSource as rogerSourceOf,
    stripText,
  } from "../lib/journalText.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import {
    countNewRows,
    findRow,
    type MessageView,
    type TimelineRow,
  } from "../store/journalView.ts";
  import { manualStatusesFor } from "../store/outgoing.ts";
  import type { JournalEntry, Status } from "../store/types.ts";

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
  let highlighted: string | null = $state(null);
  // Which batch rows show their recipients and which messages show their history.
  let expanded: Record<string, boolean> = $state({});
  // The current row for the keyboard (an entry id, or a batch id), or null before J / K or
  // a focus set one.
  let cursor: string | null = $state(null);

  // Which row has its correction form or its status form open, and the texts typed in them.
  let correcting: string | null = $state(null);
  let correctionText = $state("");
  let changingStatus: string | null = $state(null);
  let reason = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);

  const AT_TOP_SLACK_PX = 8;

  const newCount = $derived(seen === null ? 0 : countNewRows(rows, seen));

  // The rows Enter can open or close: a batch (its recipients) and a message with a history.
  const toggleable = $derived.by(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.kind === "batch") {
        ids.add(row.id);
        for (const view of row.messages) {
          if (view.history.length > 0) {
            ids.add(view.entry.id);
          }
        }
      } else if (row.kind === "message" && row.message.history.length > 0) {
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

  export async function scrollToEntry(id: string): Promise<void> {
    const row = findRow(rows, id);
    if (row?.kind === "batch") {
      expanded[row.id] = true;
    }
    await tick();
    const target = box?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
    if (target === undefined || target === null) {
      return;
    }
    target.scrollIntoView({ block: "center" });
    highlighted = id;
  }

  function toggle(id: string) {
    expanded[id] = expanded[id] !== true;
  }

  // --- the keyboard cursor ------------------------------------------------------------------

  function rowElements(): HTMLTableRowElement[] {
    return box === undefined
      ? []
      : [...box.querySelectorAll<HTMLTableRowElement>("tr[data-entry-id]")];
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
      const row = active.closest<HTMLTableRowElement>("tr[data-entry-id]");
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

  function startCorrection(entry: JournalEntry) {
    error = null;
    changingStatus = null;
    correcting = entry.id;
    correctionText = "";
  }

  function startStatus(entry: JournalEntry) {
    error = null;
    correcting = null;
    changingStatus = entry.id;
    reason = "";
  }

  function cancelForms() {
    correcting = null;
    changingStatus = null;
    error = null;
  }

  async function saveCorrection(entry: JournalEntry, event: SubmitEvent) {
    event.preventDefault();
    if (correctionText.trim() === "" || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await oncorrect(entry, correctionText);
      correcting = null;
      correctionText = "";
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

<!-- The time, with the clock-trust mark: a dimmed "?" for unknown, a small "✓" for manual,
     nothing for ntp; the sentence from the settings as its tooltip. The top bar says once
     that the session's clock is unconfirmed, so the mark here can be quiet. -->
{#snippet timeCell(entry: JournalEntry)}
  <td class="time" title={formatDateTime(entry.timestamp)}>
    {formatTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
      >{/if}
  </td>
{/snippet}

{#snippet correctButton(entry: JournalEntry)}
  <button type="button" class="secondary small" onclick={() => startCorrection(entry)}>
    {t("journal.action.correct")}
  </button>
{/snippet}

{#snippet correctionForm(entry: JournalEntry)}
  {#if correcting === entry.id}
    <tr class="form">
      <td colspan="7">
        <form class="inline" onsubmit={(event) => saveCorrection(entry, event)}>
          <input
            type="text"
            placeholder={t("journal.correction.text")}
            aria-label={t("journal.correction.text")}
            bind:value={correctionText}
          />
          <button type="submit" class="small" disabled={busy || correctionText.trim() === ""}>
            {t("journal.action.save")}
          </button>
          <button type="button" class="secondary small" onclick={cancelForms}
            >{t("journal.action.cancel")}</button
          >
        </form>
      </td>
    </tr>
  {/if}
{/snippet}

{#snippet correctionRows(corrections: readonly JournalEntry[])}
  {#each corrections as correction (correction.id)}
    <tr
      class="child"
      data-type="correction"
      data-entry-id={correction.id}
      class:highlighted={highlighted === correction.id}
      class:cursor={cursor === correction.id}
      tabindex={rowTabIndex(correction.id)}
      onfocus={() => (cursor = correction.id)}
    >
      {@render timeCell(correction)}
      <td>{correction.operator}</td>
      <td>{t("journal.type.correction")}</td>
      <td></td>
      <td class="text indented" colspan="2">{correction.text ?? ""}</td>
      <td class="actions">{@render correctButton(correction)}</td>
    </tr>
    {@render correctionForm(correction)}
  {/each}
{/snippet}

<!-- An outgoing message: its row with the strip, then (when open) its history, its
     corrections and the forms. `nested` marks a recipient row inside a batch. -->
{#snippet messageRows(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  {@const inflightText = inflight(entry.id)}
  <tr
    class:child={nested}
    data-type="message_out"
    data-entry-id={entry.id}
    class:highlighted={highlighted === entry.id}
    class:cursor={cursor === entry.id}
    tabindex={rowTabIndex(entry.id)}
    onfocus={() => (cursor = entry.id)}
  >
    {@render timeCell(entry)}
    <td>{entry.operator}</td>
    <td>
      {t("journal.type.message_out")}
      {#if entry.transport !== undefined && entry.transport !== "mesh"}
        <small class="muted">{t(`send.transport.${entry.transport}`)}</small>
      {/if}
    </td>
    <td class="label">{labels.get(entry.counterpartyId ?? "") ?? ""}</td>
    <td class="text" class:indented={nested}>
      {entry.text ?? ""}
      {#if view.answers !== null}
        {@const answers = view.answers}
        <div class="reply-mark">
          <button
            type="button"
            class="link"
            title={answers.text ?? ""}
            onclick={() => scrollToEntry(answers.id)}
          >
            {t("journal.reply.answers", { time: formatShortTime(answers.timestamp) })}
          </button>
        </div>
      {/if}
      <div class="strip">
        {#each view.strip as item, index (index)}
          {#if index > 0}<span class="dot">·</span>{/if}
          <span data-kind={item.kind} title={item.at === null ? undefined : formatDateTime(item.at)}
            >{stripText(item, inflightText)}</span
          >
        {/each}
      </div>
    </td>
    <td>
      <span class="chip" data-status={view.status}>{t(`journal.status.${view.status}`)}</span>
    </td>
    <td class="actions">
      {#if canRetry(entry)}
        <button type="button" class="secondary small" onclick={() => onretry(entry)}>
          {view.status === "given_up" ? t("send.retry") : t("send.sendNow")}
        </button>
      {/if}
      {#if canChangeStatus(view)}
        <button type="button" class="secondary small" onclick={() => startStatus(entry)}>
          {t("journal.action.status")}
        </button>
      {/if}
      {#if view.history.length > 0}
        <button
          type="button"
          class="secondary small"
          aria-expanded={expanded[entry.id] === true}
          onclick={() => toggle(entry.id)}
        >
          {expanded[entry.id] === true
            ? t("journal.action.hideHistory")
            : t("journal.action.history", { count: view.history.length })}
        </button>
      {/if}
      {@render correctButton(entry)}
    </td>
  </tr>

  {#if changingStatus === entry.id && entry.transport !== undefined}
    <tr class="form">
      <td colspan="7">
        <div class="inline">
          <input
            type="text"
            placeholder={t("journal.manual.reason")}
            aria-label={t("journal.manual.reason")}
            bind:value={reason}
          />
          {#each manualStatusesFor(entry.transport) as next (next)}
            <button
              type="button"
              class="small"
              disabled={busy || reason.trim() === ""}
              onclick={() => saveStatus(entry, next)}
            >
              {t(`send.manual.${next}`)}
            </button>
          {/each}
          <button type="button" class="secondary small" onclick={cancelForms}
            >{t("journal.action.cancel")}</button
          >
        </div>
      </td>
    </tr>
  {/if}
  {@render correctionForm(entry)}

  {#if expanded[entry.id] === true}
    {#each view.history as item (item.entry.id)}
      {@const source = rogerSource(item.entry)}
      <tr
        class="child history"
        data-type={item.entry.type}
        data-entry-id={item.entry.id}
        class:highlighted={highlighted === item.entry.id}
        class:cursor={cursor === item.entry.id}
        tabindex={rowTabIndex(item.entry.id)}
        onfocus={() => (cursor = item.entry.id)}
      >
        {@render timeCell(item.entry)}
        <td>{item.entry.operator}</td>
        <td>{t(`journal.type.${item.entry.type}`)}</td>
        <td></td>
        <td class="text indented" colspan="2">
          {historyDetail(item.entry)}
          {#if source !== undefined}
            <button type="button" class="link" onclick={() => scrollToEntry(source.id)}>
              {formatTime(source.timestamp)}
            </button>
          {/if}
        </td>
        <td class="actions">{@render correctButton(item.entry)}</td>
      </tr>
      {@render correctionForm(item.entry)}
      {@render correctionRows(item.corrections)}
    {/each}
  {/if}
  {@render correctionRows(view.corrections)}
{/snippet}

<div class="timeline" bind:this={box} {onscroll}>
  {#if rows.length === 0}
    <p class="muted">{t("journal.entries.empty")}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">{t("journal.entries.time")}</th>
          <th scope="col">{t("journal.timeline.operator")}</th>
          <th scope="col">{t("journal.entries.type")}</th>
          <th scope="col">{t("journal.entries.counterparty")}</th>
          <th scope="col">{t("journal.entries.text")}</th>
          <th scope="col">{t("journal.timeline.status")}</th>
          <th scope="col"><span class="visually-hidden">{t("journal.timeline.actions")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          {#if row.kind === "message"}
            {@render messageRows(row.message, false)}
          {:else if row.kind === "batch"}
            <tr
              data-type="batch"
              data-entry-id={row.id}
              class:highlighted={highlighted === row.id}
              class:cursor={cursor === row.id}
              tabindex={rowTabIndex(row.id)}
              onfocus={() => (cursor = row.id)}
            >
              {@render timeCell(row.entry)}
              <td>{row.entry.operator}</td>
              <td>{t("journal.type.message_out")}</td>
              <td class="label">{t("journal.batch.toAll", { count: row.counters.total })}</td>
              <td class="text">
                {batchText(row.body, row.drill)}
                <div class="strip">{countersText(row.counters)}</div>
              </td>
              <td>
                <span class="chip" data-status={row.status}
                  >{t(`journal.status.${row.status}`)}</span
                >
              </td>
              <td class="actions">
                <button
                  type="button"
                  class="secondary small"
                  aria-expanded={expanded[row.id] === true}
                  onclick={() => toggle(row.id)}
                >
                  {expanded[row.id] === true
                    ? t("journal.batch.collapse")
                    : t("journal.batch.expand", { count: row.counters.total })}
                </button>
              </td>
            </tr>
            {#if expanded[row.id] === true}
              {#each row.messages as view (view.entry.id)}
                {@render messageRows(view, true)}
              {/each}
            {/if}
          {:else}
            {@const entry = row.entry}
            {@const incoming = entry.type === "message_in"}
            <tr
              data-type={entry.type}
              data-entry-id={entry.id}
              class:highlighted={highlighted === entry.id}
              class:cursor={cursor === entry.id}
              tabindex={rowTabIndex(entry.id)}
              onfocus={() => (cursor = entry.id)}
            >
              {@render timeCell(entry)}
              <td>{entry.operator}</td>
              <td>
                {t(`journal.type.${entry.type}`)}
                {#if entry.transport !== undefined && entry.transport !== "mesh"}
                  <small class="muted">{t(`send.transport.${entry.transport}`)}</small>
                {/if}
              </td>
              <td class="label">{labels.get(entry.counterpartyId ?? "") ?? ""}</td>
              <td class="text">
                {#if entry.type === "status_change"}
                  {t(`journal.status.${entry.newStatus ?? "pending"}`)}{#if entry.text}
                    · {entry.text}{/if}
                {:else}
                  {entry.text ?? ""}
                {/if}
                {#if row.answeredBy.length > 0}
                  <div class="strip">
                    {#each row.answeredBy as reply, index (reply.id)}
                      {#if index > 0}<span class="dot">·</span>{/if}
                      <button
                        type="button"
                        class="link"
                        title={reply.text ?? ""}
                        onclick={() => scrollToEntry(reply.id)}
                      >
                        {t("journal.reply.answered", { time: formatShortTime(reply.timestamp) })}
                      </button>
                    {/each}
                  </div>
                {/if}
              </td>
              <td></td>
              <td class="actions">
                {#if incoming}
                  <button type="button" class="small" onclick={() => onreply(entry)}>
                    {t("journal.action.reply")}
                  </button>
                {/if}
                {@render correctButton(entry)}
              </td>
            </tr>
            {@render correctionForm(entry)}
            {@render correctionRows(row.corrections)}
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="footer">
  {#if error}
    <span class="error" role="alert">{error}</span>
  {/if}
  {#if newCount > 0}
    <button type="button" class="pill" onclick={jumpToTop}
      >{t("journal.timeline.newRows", { n: newCount })}</button
    >
  {/if}
</div>

<style>
  .timeline {
    /* At 1280×720 and the 18 px base this is the rest of the viewport under the incident
       bar: ten one-line rows and the header (P1-09). */
    max-height: 60vh;
    overflow-y: auto;
    /* Rows inserted above the viewport must not move what the operator is reading. */
    overflow-anchor: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    min-height: 2rem;
    margin-top: 0.25rem;
  }

  .muted {
    color: var(--muted);
    padding: 0.75rem;
  }

  .error {
    color: var(--error);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--rule);
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--light);
    border-bottom-color: var(--line);
  }

  .time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .trust {
    margin-left: 0.15rem;
    font-size: 0.8em;
    color: var(--muted);
    text-decoration: none;
    cursor: help;
  }

  .trust[data-trust="unknown"] {
    opacity: 0.6;
  }

  .trust[data-trust="manual"] {
    color: var(--ok);
  }

  .label {
    font-weight: 600;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    width: 40%;
  }

  .strip {
    margin-top: 0.15rem;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .strip .dot {
    margin: 0 0.3rem;
  }

  .strip [data-kind="delivered"],
  .strip [data-kind="roger"] {
    color: var(--ok);
  }

  .strip [data-kind="given_up"] {
    color: var(--error);
  }

  .indented {
    padding-left: 1.5rem;
  }

  tr.child td {
    border-bottom-style: dashed;
    font-size: 0.9rem;
  }

  tr.history td {
    color: var(--muted);
  }

  tr[data-type="message_in"] {
    background: var(--surface-in);
  }

  .reply-mark {
    margin-top: 0.15rem;
    font-size: 0.85rem;
  }

  tr[data-type="batch"] td {
    background: var(--light);
  }

  /* The focus ring on a row sits inside the row: the box clips anything outside. */
  tr[data-entry-id]:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: -3px;
  }

  /* The current row for J / K / Enter / R: a bar at its left edge, kept when the focus moves
     on (into the reply form, say). */
  tr.cursor td:first-child {
    box-shadow: inset 0.3rem 0 0 var(--navy);
  }

  tr.highlighted {
    outline: 3px solid var(--navy);
    outline-offset: -3px;
  }

  tr.form td {
    background: var(--light);
  }

  /* The row buttons wrap instead of widening the table past the box. */
  .actions {
    min-width: 10rem;
  }

  .actions button {
    margin: 0 0.25rem 0.25rem 0;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .inline input {
    flex: 1;
    min-width: 12rem;
  }

  .pill {
    padding: 0.2rem 0.8rem;
    border-radius: 999px;
  }
</style>
