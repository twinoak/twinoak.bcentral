<script lang="ts">
  // The print view (P1-04; on the design language in P2-05): the current incident's journal
  // as a document for the browser's print dialog. One line per message, a radio message's
  // with its status strip and status word (a message by phone, courier or verbal has none,
  // P3-07), a batch as one block with its counters and one line per recipient, a corrected
  // entry with its corrected text marked "(corrected ‹time› · ‹operator›)" and the earlier
  // versions as footnote lines beneath (P3-02), oldest first by default (a printed journal
  // reads top-down); then the points as a block at the end (P3-05): the open ones, then the
  // closed ones with their reasons, each with the line it was opened from.
  // "Since last print" prints only the rows with something newer than the previous print's
  // time (store/printView.ts) and is the routine: on by default when there was a previous
  // print. The controls are a no-print toolbar on the components; the document is `.doc`
  // (components.css): a sheet on screen, on paper 12 pt black on white with status words
  // (styles/base.css, the paper rules at the end of components.css). The header carries the
  // incident, the device id, the operators and the print time; page numbers come from
  // base.css / the browser's own footer. Browser print(), no PDF library. The print time is
  // taken when the rows are loaded (what is on paper is what was loaded) and stored only
  // after print().
  import { onMount } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { now } from "../lib/clock.svelte.ts";
  import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
  import {
    batchText,
    countersText,
    formatDateTime,
    formatTime,
    incidentName,
    stripText,
  } from "../lib/journalText.ts";
  import { openPopover } from "../lib/popover.svelte.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import { isDrill } from "../store/incidents.ts";
  import {
    entriesForIncident,
    lastPrintAt,
    listIncidents,
    listRegister,
    recordPrint,
  } from "../store/index.ts";
  import { DIRECTION_GLYPH } from "../lib/journalRows.ts";
  import {
    correctionsByTarget,
    currentText,
    textVersions,
    type MessageView,
    type PointView,
  } from "../store/journalView.ts";
  import { operatorsOf, printPoints, printRows } from "../store/printView.ts";
  import type { Incident, JournalEntry } from "../store/types.ts";
  import Icon from "../components/Icon.svelte";

  let incident: Incident | null = $state(null);
  let entries: JournalEntry[] = $state([]);
  let labels: Map<string, string> = $state(new Map());
  // The stored time of the previous print when this view was opened; what "since" means.
  let previousPrint: string | null = $state(null);
  // When the rows were loaded: the header's print time, stored after a print.
  let printedAt = $state("");
  let sinceMode = $state(false);
  let oldestFirst = $state(true);
  let loaded = $state(false);
  let loadError: string | null = $state(null);
  let printError: string | null = $state(null);

  const since = $derived(sinceMode ? previousPrint : null);
  const rows = $derived(printRows(entries, { since, oldestFirst }));
  // The points block (P3-05): whole, or since the last print only what changed; the block
  // is left out of a "since" print when nothing changed.
  const points = $derived(printPoints(entries, since));
  const showPoints = $derived(since === null || points.open.length + points.closed.length > 0);
  // Every correction by the entry it corrects: a point's origin line reads its current text.
  const corrections = $derived(correctionsByTarget(entries));
  const operators = $derived(incident === null ? [] : operatorsOf(incident, entries));
  // Dates on every time when the incident spans more than one day; the time alone otherwise.
  const multiDay = $derived(
    new Set(entries.map((entry) => new Date(entry.timestamp).toLocaleDateString(language()))).size >
      1,
  );

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function formatRowTime(timestamp: string): string {
    return multiDay
      ? new Date(timestamp).toLocaleString(language(), { dateStyle: "short", timeStyle: "medium" })
      : formatTime(timestamp);
  }

  async function load() {
    const id = currentIncidentId();
    try {
      incident = id === null ? null : ((await listIncidents()).find((i) => i.id === id) ?? null);
      if (incident === null) {
        loaded = true;
        return;
      }
      labels = new Map((await listRegister()).map((entry) => [entry.id, entry.label]));
      entries = await entriesForIncident(incident.id);
      previousPrint = await lastPrintAt();
      sinceMode = previousPrint !== null;
      printedAt = now().timestamp;
      loadError = null;
    } catch (failure) {
      loadError = t("journal.loadFailed", { error: describe(failure) });
    }
    loaded = true;
  }

  onMount(() => {
    void load();
  });

  // The document title is the browser's print header; put the incident there while printing.
  // print() returns when the dialog closes; the time is recorded after it, whatever the
  // operator chose in the dialog (the browser does not say).
  async function print() {
    if (incident === null) {
      return;
    }
    const title = document.title;
    document.title = t("print.pageTitle", { incident: incidentName(incident) });
    try {
      window.print();
    } finally {
      document.title = title;
    }
    try {
      await recordPrint(printedAt);
      printError = null;
      // The confirmation is the toast (P2-02); the error stays on the page.
      showToast(t("print.printed", { time: formatDateTime(printedAt) }));
    } catch (failure) {
      printError = t("print.failed", { error: describe(failure) });
    }
  }

  // The strip sentence of a radio message; a message without a chain has none (P3-07).
  function stripLine(view: MessageView): string | null {
    return view.status === null
      ? null
      : view.strip.map((item) => stripText(item, null)).join(" · ");
  }

  // The line a point was opened from: its time, the counterparty of a message with the
  // direction glyph or the operator of a note, then its text as it reads now.
  function originLine(view: PointView): string {
    const origin = view.origin;
    if (origin === undefined) {
      return "";
    }
    const who =
      origin.type === "message_in" || origin.type === "message_out"
        ? `${DIRECTION_GLYPH[origin.type === "message_in" ? "in" : "out"]} ${labels.get(origin.counterpartyId ?? "") ?? ""}`
        : origin.operator;
    const text = currentText(origin, corrections.get(origin.id) ?? []);
    return `${formatRowTime(origin.timestamp)} · ${who}: ${text}`;
  }
</script>

<!-- The time, with the clock-trust mark as on the screen: "?" when the clock was not
     confirmed, "✓" when confirmed by hand, nothing for ntp. -->
{#snippet timeCell(entry: JournalEntry)}
  <td class="doc-time">
    {formatRowTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="row-trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
      >{/if}
  </td>
{/snippet}

<!-- An entry's text as it reads now: the latest correction's when it was corrected, marked
     with the correction's time and operator, and the earlier versions (the original, then
     any superseded correction) as footnote lines beneath, each with its time and operator. -->
{#snippet docText(entry: JournalEntry, corrections: readonly JournalEntry[])}
  {@const versions = textVersions(entry, corrections)}
  {@const latest = versions[versions.length - 1]}
  {currentText(entry, corrections)}
  {#if latest !== undefined}
    <span class="doc-meta" data-corrected={latest.id}>
      {t("print.corrected", { time: formatRowTime(latest.timestamp), operator: latest.operator })}
    </span>
    {#each versions.slice(0, -1) as version, index (version.id)}
      <div class="doc-meta" data-version={index === 0 ? "original" : "correction"}>
        {index === 0 ? t("journal.correction.original") : t("journal.type.correction")}
        {formatRowTime(version.timestamp)} · {version.operator}: {version.text ?? ""}
      </div>
    {/each}
  {/if}
{/snippet}

<!-- An outgoing message: one line, with its strip and status word when it is a radio message;
     a recipient inside a batch is indented and shows the label and the strip only (the text
     is the batch's), unless its own record was corrected. -->
{#snippet messageRow(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  {@const strip = stripLine(view)}
  <tr data-nested={nested ? "true" : undefined} data-type="message_out">
    {@render timeCell(entry)}
    <td>{entry.operator}</td>
    <td>
      {t("journal.type.message_out")}
      {#if entry.transport !== undefined && entry.transport !== "mesh"}
        <span class="doc-meta">{t(`send.transport.${entry.transport}`)}</span>
      {/if}
    </td>
    <td class="label">{labels.get(entry.counterpartyId ?? "") ?? ""}</td>
    <td class="doc-text" class:doc-indent={nested}>
      {#if nested && view.corrections.length === 0}
        <span class="doc-meta">{strip ?? ""}</span>
      {:else}
        {@render docText(entry, view.corrections)}
        {#if strip !== null}
          <div class="doc-meta">{strip}</div>
        {/if}
      {/if}
    </td>
    <td class="doc-status">{view.status === null ? "" : t(`journal.status.${view.status}`)}</td>
  </tr>
{/snippet}

<div class="toolbar controls no-print">
  <a class="btn" href={hashFor("journal")}>{t("print.back")}</a>
  {#if incident !== null}
    <label class="check">
      <input type="checkbox" bind:checked={sinceMode} disabled={previousPrint === null} />
      {#if previousPrint === null}
        {t("print.sinceNever")}
      {:else}
        {t("print.sinceOption", { time: formatDateTime(previousPrint) })}
      {/if}
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={oldestFirst} />
      {t("print.oldestFirst")}
    </label>
    <span class="chip" role="status">{t("print.rows", { count: rows.length })}</span>
    <span class="toolbar-end"></span>
    <button type="button" class="btn btn-primary" onclick={print} disabled={!loaded}>
      <Icon name="print" />{t("print.print")}
    </button>
  {/if}
</div>

{#if loadError}
  <p class="msg msg-danger no-print" role="alert"><Icon name="warning" />{loadError}</p>
{/if}
{#if printError}
  <p class="msg msg-danger no-print" role="alert"><Icon name="warning" />{printError}</p>
{/if}

{#if loaded && incident === null}
  <div class="empty no-print">
    <p>{t("print.noIncident")}</p>
    <button type="button" class="btn btn-primary" onclick={() => openPopover("incident")}>
      {t("journal.incident.choose")}
    </button>
  </div>
{:else if incident !== null}
  <article class="doc" data-drill={isDrill(incident) ? "true" : undefined}>
    <header class="doc-head">
      <h1>{t("print.title", { incident: incidentName(incident) })}</h1>
      {#if isDrill(incident)}
        <p class="msg msg-drill doc-drill"><Icon name="drill" />{t("print.drill")}</p>
      {/if}
      <dl class="dl">
        <dt>{t("print.device")}</dt>
        <dd>{settings.deviceId}</dd>
        <dt>{t("print.operators")}</dt>
        <dd>{operators.join(", ")}</dd>
        <dt>{t("print.printedAt")}</dt>
        <dd>{printedAt === "" ? "" : formatDateTime(printedAt)}</dd>
        <dt>{t("print.range")}</dt>
        <dd>
          {#if since === null}
            {t("print.rangeAll")}
          {:else}
            {t("print.rangeSince", { time: formatDateTime(since) })}
          {/if}
        </dd>
      </dl>
    </header>

    {#if rows.length === 0}
      <p class="msg">{since === null ? t("journal.entries.empty") : t("print.empty")}</p>
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th scope="col">{t("journal.entries.time")}</th>
            <th scope="col">{t("journal.timeline.operator")}</th>
            <th scope="col">{t("journal.entries.type")}</th>
            <th scope="col">{t("journal.entries.counterparty")}</th>
            <th scope="col">{t("journal.entries.text")}</th>
            <th scope="col">{t("journal.timeline.status")}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            {#if row.kind === "message"}
              {@render messageRow(row.message, false)}
            {:else if row.kind === "batch"}
              <tr data-type="batch">
                {@render timeCell(row.entry)}
                <td>{row.entry.operator}</td>
                <td>{t("journal.type.message_out")}</td>
                <td class="label">{t("journal.batch.toAll", { count: row.counters.total })}</td>
                <td class="doc-text">
                  {batchText(row.body, row.drill)}
                  <div class="doc-meta">{countersText(row.counters)}</div>
                </td>
                <td class="doc-status">{t(`journal.status.${row.status}`)}</td>
              </tr>
              {#each row.messages as view (view.entry.id)}
                {@render messageRow(view, true)}
              {/each}
            {:else}
              {@const entry = row.entry}
              <tr data-type={entry.type}>
                {@render timeCell(entry)}
                <td>{entry.operator}</td>
                <td>
                  {t(`journal.type.${entry.type}`)}
                  {#if entry.transport !== undefined && entry.transport !== "mesh"}
                    <span class="doc-meta">{t(`send.transport.${entry.transport}`)}</span>
                  {/if}
                </td>
                <td class="label">{labels.get(entry.counterpartyId ?? "") ?? ""}</td>
                <td class="doc-text">
                  {#if entry.type === "status_change"}
                    {t(`journal.status.${entry.newStatus ?? "pending"}`)}{#if entry.text}
                      · {@render docText(entry, row.corrections)}{/if}
                  {:else}
                    {@render docText(entry, row.corrections)}
                  {/if}
                </td>
                <td></td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}

    <!-- The points at the end (P3-05): the open ones oldest first, then the closed ones
         newest closed first with their reasons; each with the line it was opened from. -->
    {#if showPoints}
      <section class="doc-points" aria-labelledby="print-points-heading" data-points>
        <h2 id="print-points-heading">{t("print.points.title")}</h2>
        {#if points.open.length === 0 && points.closed.length === 0}
          <p class="msg">{t("print.points.none")}</p>
        {:else}
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{t("print.points.title")}</th>
                <th scope="col">{t("journal.timeline.status")}</th>
                <th scope="col">{t("print.points.origin")}</th>
              </tr>
            </thead>
            <tbody>
              {#each points.open as view (view.point.id)}
                <tr data-point-state="open">
                  <td class="doc-text">{view.title}</td>
                  <td>
                    {t("print.points.open")}
                    <div class="doc-meta">
                      {t("print.points.opened", {
                        time: formatRowTime(view.openedAt),
                        operator: view.point.operator,
                      })}
                    </div>
                  </td>
                  <td class="doc-meta">{originLine(view)}</td>
                </tr>
              {/each}
              {#each points.closed as view (view.point.id)}
                <tr data-point-state="closed">
                  <td class="doc-text">{view.title}</td>
                  <td>
                    {t("print.points.closed")}
                    <div class="doc-meta">
                      {t("journal.points.closedAt", {
                        time: formatRowTime(view.closedAt ?? view.point.timestamp),
                        operator: view.closedBy ?? view.point.operator,
                        reason: view.reason ?? "",
                      })}
                    </div>
                  </td>
                  <td class="doc-meta">{originLine(view)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}
  </article>
{/if}

<style>
  /* Layout only: the toolbar's controls sit on one line above the sheet. */
  .controls {
    align-items: center;
    margin-bottom: var(--s-4);
  }
</style>
