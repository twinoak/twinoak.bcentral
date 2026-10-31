<script lang="ts">
  // The incident's journal as a list of message slips (P0-07, reshaped in P1-01, on the row
  // list in P2-03): one row per entry, newest on top, laid on the columns time | who | body |
  // strip. An outgoing message carries its status strip at the right — chips with a dot per
  // state, "sent 14:31 · delivered 14:32 · roger 14:35" — and its transitions are not rows
  // but a history the operator opens on the row (a 14 px list under it). Incoming and
  // outgoing are told apart by the glyph before the counterparty (→ out, ← in) and by the
  // counterparty itself. The messages of one send-to-all are one row with counter chips
  // that opens into one row per recipient. A correction is a 14 px line under the entry it
  // corrects. The view stays at the top unless the operator scrolled down; then new rows
  // arrive above without moving the viewport and a "N new" chip, stuck to the top of the
  // box, jumps back up.
  //
  // Row actions — Reply on an incoming message (P1-02), Retry / Send for a mesh message
  // nobody is sending, Mark (a manual status with a required reason), History, Correct —
  // are quiet buttons on a line under the row, shown while the pointer or the focus is on
  // the row and always on an expanded row. A reply carries "↳ answers ‹time›" after its
  // text and the incoming row "answered ‹time›", each a link to the other row.
  //
  // Keyboard (P1-09): one row is the current row (accent-weak); J / K move it (and the
  // focus) down and up, Enter opens or closes it (a batch's recipients, a message's history),
  // R replies to it when it is incoming, Esc closes an open row form. The rows are one tab
  // stop (roving tabindex): Tab lands on the current row, J / K walk. The look is
  // components.css's `.rows`; this file lays nothing out of its own.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { chipClass, counterChips, DIRECTION_GLYPH, stripChip } from "../lib/journalRows.ts";
  import {
    batchText,
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
  import Icon from "./Icon.svelte";

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
  // Which batch rows show their recipients and which messages show their history.
  let expanded: Record<string, boolean> = $state({});
  // The current row for the keyboard (an entry id, or a batch id), or null before J / K, a
  // focus or a jump from a side card set one.
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
    box
      ?.querySelector<HTMLElement>(`li[data-entry-id="${row.id}"]`)
      ?.focus({ preventScroll: true });
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

<!-- The time, with the clock-trust mark: a "?" for unknown, a "✓" for manual, nothing for
     ntp; the sentence from the settings as its tooltip. -->
{#snippet timeCell(entry: JournalEntry)}
  <span class="row-time" title={recordedBy(entry)}>
    {formatTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="row-trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
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

{#snippet correctButton(entry: JournalEntry)}
  <button type="button" class="btn btn-quiet" onclick={() => startCorrection(entry)}>
    {t("journal.action.correct")}
  </button>
{/snippet}

{#snippet correctionForm(entry: JournalEntry)}
  {#if correcting === entry.id}
    <form class="row-form" onsubmit={(event) => saveCorrection(entry, event)}>
      <div class="field">
        <input
          type="text"
          placeholder={t("journal.correction.text")}
          aria-label={t("journal.correction.text")}
          bind:value={correctionText}
        />
      </div>
      <button type="submit" class="btn btn-primary" disabled={busy || correctionText.trim() === ""}>
        {t("journal.action.save")}
      </button>
      <button type="button" class="btn" onclick={cancelForms}>{t("journal.action.cancel")}</button>
      {#if error}
        <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
      {/if}
    </form>
  {/if}
{/snippet}

<!-- A correction under the entry it corrects: a 14 px neutral line. -->
{#snippet correctionLines(corrections: readonly JournalEntry[])}
  {#each corrections as correction (correction.id)}
    <p class="msg row-note" data-entry-id={correction.id} title={recordedBy(correction)}>
      <span class="row-meta"
        >{t("journal.type.correction")} {formatShortTime(correction.timestamp)}</span
      >
      {correction.text ?? ""}
    </p>
  {/each}
{/snippet}

<!-- An outgoing message: the row with its strip, its actions, its forms, its history when
     open and its corrections. `nested` marks a recipient row inside a batch. -->
{#snippet messageRow(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  {@const inflightText = inflight(entry.id)}
  {@const open = expanded[entry.id] === true}
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
    {@render timeCell(entry)}
    {@render whoCell(entry, "out", label(entry))}
    <span class="row-body">
      {entry.text ?? ""}
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
    </span>
    <span class="row-strip strip">
      {#each view.strip as item, index (index)}
        {@const look = stripChip(item.kind)}
        <span
          class="chip {chipClass(look.tint)}"
          data-kind={item.kind}
          title={item.at === null ? undefined : formatDateTime(item.at)}
        >
          <span class="chip-dot" class:chip-dot-outline={look.dot === "outline"}></span>{stripText(
            item,
            inflightText,
          )}
        </span>
      {/each}
    </span>
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
      {#if view.history.length > 0}
        <button
          type="button"
          class="btn btn-quiet"
          aria-expanded={open}
          onclick={() => toggle(entry.id)}
        >
          <Icon name="history" />{open
            ? t("journal.action.hideHistory")
            : t("journal.action.history", { count: view.history.length })}
        </button>
      {/if}
      {@render correctButton(entry)}
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
    {@render correctionForm(entry)}

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
            {#each item.corrections as correction (correction.id)}
              <li data-entry-id={correction.id} title={recordedBy(correction)}>
                <span class="row-time">{formatTime(correction.timestamp)}</span>
                <span>{t("journal.type.correction")}: {correction.text ?? ""}</span>
                <span class="row-meta">{correction.operator}</span>
              </li>
            {/each}
          {/each}
        </ul>
      </div>
    {/if}
    {@render correctionLines(view.corrections)}
  </li>
{/snippet}

<div class="rows-box timeline" bind:this={box} {onscroll}>
  {#if newCount > 0}
    <div class="rows-top">
      <button type="button" class="chip chip-accent" onclick={jumpToTop}
        >{t("journal.timeline.newRows", { n: newCount })}</button
      >
    </div>
  {/if}
  {#if rows.length === 0}
    <div class="empty"><p>{t("journal.entries.empty")}</p></div>
  {:else}
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
            {@render timeCell(row.entry)}
            {@render whoCell(
              row.entry,
              "out",
              t("journal.batch.toAll", { count: row.counters.total }),
            )}
            <span class="row-body">{batchText(row.body, row.drill)}</span>
            <span class="row-strip strip">
              {#each counterChips(row.counters) as counter (counter.key)}
                <span class="chip {chipClass(counter.look.tint)}" data-kind={counter.key}>
                  <span class="chip-dot" class:chip-dot-outline={counter.look.dot === "outline"}
                  ></span>{t(`journal.batch.counter.${counter.key}`, { n: counter.n })}
                </span>
              {/each}
            </span>
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
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            data-type={entry.type}
            data-entry-id={entry.id}
            aria-current={cursor === entry.id ? "true" : undefined}
            tabindex={rowTabIndex(entry.id)}
            onfocus={() => (cursor = entry.id)}
          >
            {@render timeCell(entry)}
            {#if incoming}
              {@render whoCell(entry, "in", label(entry))}
            {:else}
              <span class="row-who">{entry.operator}</span>
            {/if}
            <span class="row-body">
              {#if entry.type === "status_change"}
                {t(`journal.status.${entry.newStatus ?? "pending"}`)}{#if entry.text}
                  · {entry.text}{/if}
              {:else}
                {entry.text ?? ""}
              {/if}
            </span>
            <span class="row-strip strip">
              {#if entry.type === "status_change"}
                <span class="chip" data-kind={entry.newStatus}
                  ><span class="chip-dot"></span>{t(
                    `journal.status.${entry.newStatus ?? "pending"}`,
                  )}</span
                >
              {/if}
              {#each row.answeredBy as reply (reply.id)}
                <span class="chip">
                  <button
                    type="button"
                    class="btn-link"
                    title={reply.text ?? ""}
                    onclick={() => scrollToEntry(reply.id)}
                  >
                    {t("journal.reply.answered", { time: formatShortTime(reply.timestamp) })}
                  </button>
                </span>
              {/each}
            </span>
            <span class="row-actions">
              {#if incoming}
                <button type="button" class="btn btn-quiet" onclick={() => onreply(entry)}>
                  <Icon name="reply" />{t("journal.action.reply")}
                </button>
              {/if}
              {@render correctButton(entry)}
            </span>
            {@render correctionForm(entry)}
            {@render correctionLines(row.corrections)}
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
