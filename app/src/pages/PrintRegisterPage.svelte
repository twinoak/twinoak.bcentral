<script lang="ts">
  // The register as a document for the browser's print dialog (P1-06; on the design language
  // in P2-05): one line per radio with label, person, street, role and the key's first 12
  // characters, the rows not yet bound to a radio under their own heading, for the box. The
  // header carries the device id, the print time and the counts. A no-print toolbar on the
  // components over the `.doc` sheet (components.css), 12 pt black on white on paper, like
  // the journal's print view. Browser print().
  import { onMount } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { now } from "../lib/clock.svelte.ts";
  import { formatDateTime } from "../lib/journalText.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { listPendingRegister, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import type { PendingRegisterRow, RegisterEntry } from "../store/types.ts";
  import Icon from "../components/Icon.svelte";

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

{#snippet headerRow()}
  <thead>
    <tr>
      <th scope="col">{t("register.field.label")}</th>
      <th scope="col">{t("register.field.person")}</th>
      <th scope="col">{t("register.field.street")}</th>
      <th scope="col">{t("register.field.role")}</th>
      <th scope="col">{t("printRegister.keyPrefix")}</th>
    </tr>
  </thead>
{/snippet}

<div class="toolbar controls no-print">
  <a class="btn" href={hashFor("register")}>{t("printRegister.back")}</a>
  <span class="toolbar-end"></span>
  <button type="button" class="btn btn-primary" onclick={print} disabled={!loaded}>
    <Icon name="print" />{t("print.print")}
  </button>
</div>

{#if loadError}
  <p class="msg msg-danger no-print" role="alert"><Icon name="warning" />{loadError}</p>
{/if}

<article class="doc">
  <header class="doc-head">
    <h1>{t("printRegister.title")}</h1>
    <dl class="dl">
      <dt>{t("print.device")}</dt>
      <dd>{settings.deviceId}</dd>
      <dt>{t("print.printedAt")}</dt>
      <dd>{printedAt === "" ? "" : formatDateTime(printedAt)}</dd>
    </dl>
    <p class="doc-meta">
      {t("printRegister.count", { count: sorted.length, pending: sortedPending.length })}
    </p>
  </header>

  {#if loaded && sorted.length === 0 && sortedPending.length === 0}
    <p class="msg">{t("register.empty")}</p>
  {/if}

  {#if sorted.length > 0}
    <table class="table">
      {@render headerRow()}
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
    <table class="table">
      {@render headerRow()}
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
  /* Layout only: the toolbar's controls sit on one line above the sheet. */
  .controls {
    align-items: center;
    margin-bottom: var(--s-4);
  }
</style>
