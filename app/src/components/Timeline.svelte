<script lang="ts">
  // The incident's journal in time order (P0-07): one row per entry, newest at the bottom,
  // with status changes and corrections indented under the entry they refer to. Auto-scrolls
  // to the newest entry unless the operator has scrolled up. Row actions: a correction of
  // any entry, a manual status change on an outgoing message (with a required reason), and
  // Retry / Send for a mesh message the outbox is not holding.
  import { tick } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import type { TimelineRow } from "../store/journalView.ts";
  import { manualStatusesFor } from "../store/outgoing.ts";
  import type { JournalEntry, Status } from "../store/types.ts";

  interface Props {
    rows: readonly TimelineRow[];
    // Register entry id -> label.
    labels: ReadonlyMap<string, string>;
    // Every entry of the incident by id, to resolve a roger's text (the incoming entry's id).
    byId: ReadonlyMap<string, JournalEntry>;
    // What the outbox is doing with a message right now, or null when it does not hold it.
    inflight: (messageId: string) => string | null;
    canRetry: (message: JournalEntry) => boolean;
    onretry: (message: JournalEntry) => void;
    onmanual: (message: JournalEntry, status: Status, reason: string) => Promise<void>;
    oncorrect: (entry: JournalEntry, text: string) => Promise<void>;
  }
  let { rows, labels, byId, inflight, canRetry, onretry, onmanual, oncorrect }: Props = $props();

  let box: HTMLDivElement | undefined = $state(undefined);
  // True while the view is at the bottom; a scroll up turns it off, a scroll back down on.
  let stickToBottom = $state(true);
  let highlighted: string | null = $state(null);

  // Which row has its correction form or its status form open, and the texts typed in them.
  let correcting: string | null = $state(null);
  let correctionText = $state("");
  let changingStatus: string | null = $state(null);
  let reason = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);

  const AT_BOTTOM_SLACK_PX = 8;

  function onscroll() {
    if (box === undefined) {
      return;
    }
    stickToBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - AT_BOTTOM_SLACK_PX;
  }

  // After every change to the rows (new entries, new children), follow the bottom unless the
  // operator scrolled up. $effect runs after the DOM has been updated.
  $effect(() => {
    void rows;
    if (box !== undefined && stickToBottom) {
      box.scrollTop = box.scrollHeight;
    }
  });

  export async function scrollToEntry(id: string): Promise<void> {
    await tick();
    const target = box?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
    if (target === undefined || target === null) {
      return;
    }
    stickToBottom = false;
    target.scrollIntoView({ block: "center" });
    highlighted = id;
  }

  function jumpToLatest() {
    stickToBottom = true;
    if (box !== undefined) {
      box.scrollTop = box.scrollHeight;
    }
  }

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "medium" });
  }

  function formatDateTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString(language(), {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  }

  // What a child row says: for a status change the status, then its text; a roger's text is
  // the id of the incoming entry that caused it, shown as that entry's text when it is in
  // this incident. For a correction, the correction's text.
  function childDetail(child: JournalEntry): string {
    if (child.type === "correction") {
      return child.text ?? "";
    }
    const status = t(`journal.status.${child.newStatus ?? "pending"}`);
    if (child.text === undefined) {
      return status;
    }
    const referenced = child.newStatus === "roger" ? byId.get(child.text) : undefined;
    if (referenced !== undefined) {
      return `${status} · ${t("journal.rogerFrom", { text: referenced.text ?? "" })}`;
    }
    return `${status} · ${child.text}`;
  }

  function rogerSource(child: JournalEntry): JournalEntry | undefined {
    if (child.type !== "status_change" || child.newStatus !== "roger" || child.text === undefined) {
      return undefined;
    }
    return byId.get(child.text);
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

  function canChangeStatus(row: TimelineRow): boolean {
    return (
      row.entry.type === "message_out" &&
      row.status !== "roger" &&
      row.entry.transport !== undefined &&
      inflight(row.entry.id) === null
    );
  }
</script>

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
        {#each rows as row (row.entry.id)}
          {@const entry = row.entry}
          {@const inflightText = entry.type === "message_out" ? inflight(entry.id) : null}
          <tr
            data-type={entry.type}
            data-entry-id={entry.id}
            class:highlighted={highlighted === entry.id}
          >
            <td class="time" title={formatDateTime(entry.timestamp)}>
              {formatTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
                  class="trust"
                  title={t(`settings.clockTrust.${entry.clockTrust}`)}
                  >{t(`journal.trust.${entry.clockTrust}`)}</abbr
                >{/if}
            </td>
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
            </td>
            <td>
              {#if row.status !== null}
                <span class="chip" data-status={row.status}>
                  {inflightText ?? t(`journal.status.${row.status}`)}
                </span>
              {/if}
            </td>
            <td class="actions">
              {#if entry.type === "message_out" && canRetry(entry)}
                <button type="button" class="secondary small" onclick={() => onretry(entry)}>
                  {row.status === "given_up" ? t("send.retry") : t("send.sendNow")}
                </button>
              {/if}
              {#if canChangeStatus(row)}
                <button type="button" class="secondary small" onclick={() => startStatus(entry)}>
                  {t("journal.action.status")}
                </button>
              {/if}
              <button type="button" class="secondary small" onclick={() => startCorrection(entry)}>
                {t("journal.action.correct")}
              </button>
            </td>
          </tr>

          {#each row.children as child (child.id)}
            {@const source = rogerSource(child)}
            <tr
              class="child"
              data-type={child.type}
              data-entry-id={child.id}
              class:highlighted={highlighted === child.id}
            >
              <td class="time" title={formatDateTime(child.timestamp)}>
                {formatTime(child.timestamp)}{#if child.clockTrust !== "ntp"}<abbr
                    class="trust"
                    title={t(`settings.clockTrust.${child.clockTrust}`)}
                    >{t(`journal.trust.${child.clockTrust}`)}</abbr
                  >{/if}
              </td>
              <td>{child.operator}</td>
              <td>{t(`journal.type.${child.type}`)}</td>
              <td></td>
              <td class="text indented" colspan="2">
                {childDetail(child)}
                {#if source !== undefined}
                  <button type="button" class="link" onclick={() => scrollToEntry(source.id)}>
                    {formatTime(source.timestamp)}
                  </button>
                {/if}
              </td>
              <td class="actions">
                <button
                  type="button"
                  class="secondary small"
                  onclick={() => startCorrection(child)}
                >
                  {t("journal.action.correct")}
                </button>
              </td>
            </tr>
            {#if correcting === child.id}
              <tr class="form">
                <td colspan="7">
                  <form class="inline" onsubmit={(event) => saveCorrection(child, event)}>
                    <input
                      type="text"
                      placeholder={t("journal.correction.text")}
                      aria-label={t("journal.correction.text")}
                      bind:value={correctionText}
                    />
                    <button
                      type="submit"
                      class="small"
                      disabled={busy || correctionText.trim() === ""}
                    >
                      {t("journal.action.save")}
                    </button>
                    <button type="button" class="secondary small" onclick={cancelForms}
                      >{t("journal.action.cancel")}</button
                    >
                  </form>
                </td>
              </tr>
            {/if}
          {/each}

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
                  <button
                    type="submit"
                    class="small"
                    disabled={busy || correctionText.trim() === ""}
                  >
                    {t("journal.action.save")}
                  </button>
                  <button type="button" class="secondary small" onclick={cancelForms}
                    >{t("journal.action.cancel")}</button
                  >
                </form>
              </td>
            </tr>
          {/if}

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
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="footer">
  {#if error}
    <span class="error" role="alert">{error}</span>
  {/if}
  {#if !stickToBottom}
    <button type="button" class="secondary small" onclick={jumpToLatest}
      >{t("journal.timeline.jumpToLatest")}</button
    >
  {/if}
</div>

<style>
  .timeline {
    max-height: 60vh;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
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
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--light);
  }

  .time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .trust {
    margin-left: 0.15rem;
    color: var(--muted);
    text-decoration: none;
    cursor: help;
  }

  .label {
    font-weight: 600;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    width: 45%;
  }

  .indented {
    padding-left: 1.5rem;
    color: var(--muted);
  }

  tr.child td {
    border-bottom-style: dashed;
    font-size: 0.9rem;
  }

  tr[data-type="message_in"] {
    background: #eef4fb;
  }

  tr.highlighted {
    outline: 2px solid var(--navy);
    outline-offset: -2px;
  }

  tr.form td {
    background: var(--light);
  }

  .chip {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    background: var(--light);
    color: var(--muted);
  }

  .chip[data-status="sent"] {
    color: var(--navy);
  }

  .chip[data-status="delivered"],
  .chip[data-status="roger"] {
    color: var(--ok);
  }

  .chip[data-status="given_up"] {
    color: var(--error);
  }

  .actions {
    white-space: nowrap;
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

  .secondary {
    background: #fff;
    color: var(--navy);
  }

  .small {
    padding: 0.25rem 0.6rem;
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--navy);
    text-decoration: underline;
    font-size: inherit;
  }
</style>
