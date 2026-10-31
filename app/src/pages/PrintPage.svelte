<script lang="ts">
  // The print view (P1-04): the current incident's journal as a document for the browser's
  // print dialog. One line per message with its status strip, a batch as one block with its
  // counters and one line per recipient, corrections under what they correct, oldest first
  // by default (a printed journal reads top-down). "Since last print" prints only the rows
  // with something newer than the previous print's time (store/printView.ts) and is the
  // routine: on by default when there was a previous print. The header carries the incident,
  // the device id, the operators and the print time; page numbers come from app.css / the
  // browser's own footer. Browser print(), no PDF library. The print time is taken when the
  // rows are loaded (what is on paper is what was loaded) and stored only after print().
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
  import type { MessageView } from "../store/journalView.ts";
  import { operatorsOf, printRows } from "../store/printView.ts";
  import type { Incident, JournalEntry } from "../store/types.ts";

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

  function stripLine(view: MessageView): string {
    return view.strip.map((item) => stripText(item, null)).join(" · ");
  }
</script>

<!-- The time, with the clock-trust mark as on the screen: "?" when the clock was not
     confirmed, "✓" when confirmed by hand, nothing for ntp. -->
{#snippet timeCell(entry: JournalEntry)}
  <td class="time">
    {formatRowTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
      >{/if}
  </td>
{/snippet}

{#snippet correctionRows(corrections: readonly JournalEntry[])}
  {#each corrections as correction (correction.id)}
    <tr class="child" data-type="correction">
      {@render timeCell(correction)}
      <td>{correction.operator}</td>
      <td>{t("journal.type.correction")}</td>
      <td></td>
      <td class="text indented">{correction.text ?? ""}</td>
      <td></td>
    </tr>
  {/each}
{/snippet}

<!-- An outgoing message: one line with its strip; a recipient inside a batch is indented and
     shows the label and the strip only (the text is the batch's). -->
{#snippet messageRow(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  <tr class:child={nested} data-type="message_out">
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
      {#if nested}
        <span class="strip">{stripLine(view)}</span>
      {:else}
        {entry.text ?? ""}
        <div class="strip">{stripLine(view)}</div>
      {/if}
    </td>
    <td class="status">{t(`journal.status.${view.status}`)}</td>
  </tr>
  {@render correctionRows(view.corrections)}
{/snippet}

<div class="controls no-print">
  <a href={hashFor("journal")}>{t("print.back")}</a>
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
    <span class="muted">{t("print.rows", { count: rows.length })}</span>
    <button type="button" onclick={print} disabled={!loaded}>{t("print.print")}</button>
  {/if}
</div>

{#if loadError}
  <p class="error no-print" role="alert">{loadError}</p>
{/if}
{#if printError}
  <p class="error no-print" role="alert">{printError}</p>
{/if}

{#if loaded && incident === null}
  <p class="no-print">
    {t("print.noIncident")} <a href={hashFor("journal")}>{t("nav.journal")}</a>
  </p>
{:else if incident !== null}
  <article class="document" data-drill={isDrill(incident) ? "true" : undefined}>
    <header>
      <h1>{t("print.title", { incident: incidentName(incident) })}</h1>
      {#if isDrill(incident)}
        <p class="drill">{t("print.drill")}</p>
      {/if}
      <dl>
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
      <p class="muted">{since === null ? t("journal.entries.empty") : t("print.empty")}</p>
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
                <td class="text">
                  {batchText(row.body, row.drill)}
                  <div class="strip">{countersText(row.counters)}</div>
                </td>
                <td class="status">{t(`journal.status.${row.status}`)}</td>
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
                <td></td>
              </tr>
              {@render correctionRows(row.corrections)}
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </article>
{/if}

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .document {
    padding: 1.5rem;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  header h1 {
    margin: 0 0 0.5rem;
  }

  header .drill {
    margin: 0 0 0.75rem;
    padding: 0.3rem 0.6rem;
    border: 2px solid var(--ink);
    font-weight: 700;
    letter-spacing: 0.05em;
    background: var(--drill-bg);
  }

  header dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.1rem 1rem;
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }

  header dt {
    font-weight: 600;
  }

  header dd {
    margin: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid var(--rule);
  }

  thead th {
    border-bottom: 2px solid var(--ink);
  }

  tr {
    break-inside: avoid;
  }

  .time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .trust {
    margin-left: 0.15rem;
    font-size: 0.8em;
    text-decoration: none;
  }

  .trust[data-trust="unknown"] {
    opacity: 0.6;
  }

  .label {
    font-weight: 600;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    width: 50%;
  }

  .strip {
    font-size: 0.85em;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .status {
    white-space: nowrap;
  }

  .indented {
    padding-left: 1.5rem;
  }

  tr.child td {
    border-bottom-style: dashed;
    font-size: 0.9em;
  }

  tr[data-type="batch"] td {
    background: var(--light);
  }

  @media print {
    .document {
      padding: 0;
      border: none;
    }

    .strip,
    .muted {
      color: #444;
    }

    tr[data-type="batch"] td {
      background: none;
      font-weight: 600;
    }
  }
</style>
