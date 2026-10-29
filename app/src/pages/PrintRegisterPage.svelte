<script lang="ts">
  // The register as a document for the browser's print dialog (P1-06): one line per radio
  // with label, person, street, role and the key's first 12 characters, the rows not yet
  // bound to a radio under their own heading, for the box. The header carries the device id,
  // the print time and the counts. Browser print(), like the journal's print view.
  import { onMount } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { now } from "../lib/clock.svelte.ts";
  import { formatDateTime } from "../lib/journalText.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { listPendingRegister, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import type { PendingRegisterRow, RegisterEntry } from "../store/types.ts";

  let entries: RegisterEntry[] = $state([]);
  let pending: PendingRegisterRow[] = $state([]);
  let printedAt = $state("");
  let loaded = $state(false);
  let loadError: string | null = $state(null);

  const sorted = $derived(sortedByLabel(entries, language()));
  const sortedPending = $derived(sortedByLabel(pending, language()));

  async function load() {
    try {
      entries = await listRegister();
      pending = await listPendingRegister();
      printedAt = now().timestamp;
      loadError = null;
    } catch (failure) {
      loadError = t("register.loadFailed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    }
    loaded = true;
  }

  onMount(() => {
    void load();
  });

  function print() {
    const title = document.title;
    document.title = t("printRegister.pageTitle");
    try {
      window.print();
    } finally {
      document.title = title;
    }
  }
</script>

<div class="controls no-print">
  <a href={hashFor("register")}>{t("printRegister.back")}</a>
  <button type="button" onclick={print} disabled={!loaded}>{t("print.print")}</button>
</div>

{#if loadError}
  <p class="error no-print" role="alert">{loadError}</p>
{/if}

<article class="document">
  <header>
    <h1>{t("printRegister.title")}</h1>
    <dl>
      <dt>{t("print.device")}</dt>
      <dd>{settings.deviceId}</dd>
      <dt>{t("print.printedAt")}</dt>
      <dd>{printedAt === "" ? "" : formatDateTime(printedAt)}</dd>
    </dl>
    <p class="count">
      {t("printRegister.count", { count: sorted.length, pending: sortedPending.length })}
    </p>
  </header>

  {#if loaded && sorted.length === 0 && sortedPending.length === 0}
    <p class="muted">{t("register.empty")}</p>
  {/if}

  {#if sorted.length > 0}
    <table>
      <thead>
        <tr>
          <th scope="col">{t("register.field.label")}</th>
          <th scope="col">{t("register.field.person")}</th>
          <th scope="col">{t("register.field.street")}</th>
          <th scope="col">{t("register.field.role")}</th>
          <th scope="col">{t("printRegister.keyPrefix")}</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as entry (entry.id)}
          <tr>
            <td class="label">{entry.label}</td>
            <td>{entry.person ?? ""}</td>
            <td>{entry.street ?? ""}</td>
            <td>{entry.role ?? ""}</td>
            <td><code>{entry.publicKey.slice(0, 12)}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if sortedPending.length > 0}
    <h2>{t("register.pending.title")}</h2>
    <table>
      <thead>
        <tr>
          <th scope="col">{t("register.field.label")}</th>
          <th scope="col">{t("register.field.person")}</th>
          <th scope="col">{t("register.field.street")}</th>
          <th scope="col">{t("register.field.role")}</th>
          <th scope="col">{t("printRegister.keyPrefix")}</th>
        </tr>
      </thead>
      <tbody>
        {#each sortedPending as row (row.id)}
          <tr>
            <td class="label">{row.label}</td>
            <td>{row.person ?? ""}</td>
            <td>{row.street ?? ""}</td>
            <td>{row.role ?? ""}</td>
            <td></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</article>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
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
    background: #fff;
  }

  header h1 {
    margin: 0 0 0.5rem;
  }

  header dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.1rem 1rem;
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }

  header dt {
    font-weight: 600;
  }

  header dd {
    margin: 0;
  }

  .count {
    margin: 0 0 1rem;
    color: var(--muted);
  }

  h2 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.5rem;
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
    border-bottom: 1px solid var(--line);
  }

  thead th {
    border-bottom: 2px solid var(--ink);
  }

  tr {
    break-inside: avoid;
  }

  .label {
    font-weight: 600;
  }

  @media print {
    .document {
      padding: 0;
      border: none;
    }

    .count,
    .muted {
      color: #444;
    }
  }
</style>
