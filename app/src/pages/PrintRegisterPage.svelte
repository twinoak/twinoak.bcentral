<script lang="ts">
  // The register as a document for the browser's print dialog (P1-06; on the design language
  // in P2-05; a contact list since P3-06): one line per contact with label, person, street,
  // role, phone and the radio — the key's first 12 characters, or a dash for a contact
  // without one — for the box. The header carries the device id, the print time and the
  // counts. A no-print toolbar on the components over the `.doc` sheet (components.css),
  // 12 pt black on white on paper, like the journal's print view. Browser print().
  import { onMount } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { now } from "../lib/clock.svelte.ts";
  import { formatDateTime } from "../lib/journalText.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { listRegister } from "../store/index.ts";
  import { radioContacts, sortedByLabel } from "../store/register.ts";
  import type { RegisterEntry } from "../store/types.ts";
  import Icon from "../components/Icon.svelte";

  let entries: RegisterEntry[] = $state([]);
  let printedAt = $state("");
  let loaded = $state(false);
  let loadError: string | null = $state(null);

  const sorted = $derived(sortedByLabel(entries, language()));
  const radios = $derived(radioContacts(entries).length);

  async function load() {
    try {
      entries = await listRegister();
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
      {t("printRegister.count", { count: sorted.length, radios })}
    </p>
  </header>

  {#if loaded && sorted.length === 0}
    <p class="msg">{t("register.empty")}</p>
  {/if}

  {#if sorted.length > 0}
    <table class="table">
      <thead>
        <tr>
          <th scope="col">{t("register.field.label")}</th>
          <th scope="col">{t("register.field.person")}</th>
          <th scope="col">{t("register.field.street")}</th>
          <th scope="col">{t("register.field.role")}</th>
          <th scope="col">{t("register.field.phone")}</th>
          <th scope="col">{t("register.field.radio")}</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as entry (entry.id)}
          <tr data-radio={entry.publicKey === undefined ? "false" : "true"}>
            <td class="label">{entry.label}</td>
            <td>{entry.person ?? ""}</td>
            <td>{entry.street ?? ""}</td>
            <td>{entry.role ?? ""}</td>
            <td>{entry.phone ?? ""}</td>
            <td>
              {#if entry.publicKey === undefined}
                <span aria-label={t("register.radio.none")}>—</span>
              {:else}
                <code>{entry.publicKey.slice(0, 12)}</code>
              {/if}
            </td>
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
