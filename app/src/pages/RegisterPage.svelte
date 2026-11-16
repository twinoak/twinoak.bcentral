<script lang="ts">
  // The register (P0-03, P1-06, P3-06; on the design language in P2-04): a contact list. A
  // toolbar — the search field, the radio filter (All / Has radio / No radio), the count,
  // Import CSV, Export CSV, Print, Add several, Add contact — above the table of contacts
  // (label, person, street, role, phone, radio — the glyph and the key's prefix, or a dash —
  // last heard, Edit). Add and edit open in a card that slides in at the right at 60 rem
  // and up, inline under the toolbar below that; the ad hoc batch and the CSV import open
  // as a card under the toolbar at every width, since they hold tables of their own. Saved,
  // created and imported are toasts (P2-02's rule for confirmations); the errors stay in
  // the form.
  import { t, language } from "../i18n/index.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { formatDateTime } from "../lib/journalText.ts";
  import {
    filterByRadio,
    filterRegister,
    RADIO_FILTERS,
    type RadioFilter,
  } from "../lib/registerFilter.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import type { RegisterEntry } from "../store/types.ts";
  import { exportRegisterCsv, lastHeardByCounterparty, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import AdhocBatchForm from "../components/AdhocBatchForm.svelte";
  import Icon from "../components/Icon.svelte";
  import RegisterForm from "../components/RegisterForm.svelte";
  import RegisterImport from "../components/RegisterImport.svelte";

  type Mode = "list" | "add" | "edit" | "batch" | "import";

  let mode = $state<Mode>("list");
  let editing: RegisterEntry | undefined = $state(undefined);
  let entries: RegisterEntry[] = $state([]);
  let heard: Map<string, string> = $state(new Map());
  let loadError: string | null = $state(null);
  let exportError: string | null = $state(null);
  let busy = $state(false);
  let query = $state("");
  let radioFilter: RadioFilter = $state("all");
  // Ticks every ten seconds: the "last heard" ages move without a reload.
  let nowMs = $state(Date.now());

  const sorted = $derived(sortedByLabel(entries, language()));
  const shown = $derived(filterByRadio(filterRegister(sorted, query), radioFilter));
  const searching = $derived(query.trim() !== "" || radioFilter !== "all");
  // The form card at the side: add or edit.
  const formOpen = $derived(mode === "add" || mode === "edit");

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function reload() {
    try {
      entries = await listRegister();
      heard = await lastHeardByCounterparty();
      loadError = null;
    } catch (failure) {
      loadError = t("register.loadFailed", { error: describe(failure) });
    }
  }
  void reload();

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 10_000);
    return () => clearInterval(timer);
  });

  function start(next: Mode) {
    exportError = null;
    editing = undefined;
    mode = next;
  }

  function startEdit(entry: RegisterEntry) {
    start("edit");
    editing = entry;
  }

  function cancel() {
    editing = undefined;
    mode = "list";
  }

  async function onsaved(message: string) {
    showToast(message);
    editing = undefined;
    mode = "list";
    await reload();
  }

  async function exportCsv() {
    busy = true;
    exportError = null;
    try {
      const filename = await exportRegisterCsv();
      // The confirmation is the toast (P2-02); the error stays next to the buttons.
      showToast(t("register.exported", { filename }));
    } catch (failure) {
      exportError = t("register.exportFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function heardText(entry: RegisterEntry): string {
    const at = heard.get(entry.id);
    if (at === undefined) {
      return t("journal.heard.never");
    }
    return t("journal.heard.ago", { elapsed: formatElapsed(nowMs - Date.parse(at)) });
  }

  function heardTitle(entry: RegisterEntry): string | undefined {
    const at = heard.get(entry.id);
    return at === undefined ? undefined : formatDateTime(at);
  }

  // The radio cell's tooltip: the origin and the whole key.
  function radioTitle(entry: RegisterEntry): string {
    return `${t(`register.origin.${entry.origin ?? "issued"}`)} · ${entry.publicKey ?? ""}`;
  }
</script>

<!-- The page heading is for assistive technology; the bar's navigation names the screen. -->
<h1 class="visually-hidden">{t("register.title")}</h1>

{#if loadError}
  <p class="msg msg-danger" role="alert"><Icon name="warning" />{loadError}</p>
{/if}

<div class="layout" class:with-side={formOpen}>
  <div class="toolbar no-print">
    <div class="field">
      <label for="register-search" class="visually-hidden">{t("register.search")}</label>
      <input
        id="register-search"
        type="search"
        placeholder={t("register.search")}
        autocomplete="off"
        bind:value={query}
      />
    </div>
    <div class="field">
      <label for="register-radio-filter" class="visually-hidden">{t("register.filter")}</label>
      <select id="register-radio-filter" bind:value={radioFilter} data-register-filter>
        {#each RADIO_FILTERS as option (option)}
          <option value={option}>{t(`register.filter.${option}`)}</option>
        {/each}
      </select>
    </div>
    <span class="chip" role="status" data-register-count>
      {searching
        ? t("register.filtered", { shown: shown.length, count: sorted.length })
        : t("register.count", { count: sorted.length })}
    </span>
    <span class="toolbar-end"></span>
    <button type="button" class="btn" onclick={() => start("import")}>
      <Icon name="import" />{t("register.import")}
    </button>
    <button type="button" class="btn" onclick={exportCsv} disabled={busy}>
      <Icon name="export" />{t("register.export")}
    </button>
    <a
      class="btn btn-icon"
      href={hashFor("printRegister")}
      aria-label={t("register.print")}
      title={t("register.print")}><Icon name="print" /></a
    >
    <button type="button" class="btn" onclick={() => start("batch")}>
      {t("register.addBatch")}
    </button>
    <button type="button" class="btn btn-primary" onclick={() => start("add")}>
      {t("register.add")}
    </button>
  </div>

  {#if formOpen}
    <aside class="side">
      <section class="card form-card" data-register-form>
        {#key editing?.id}
          <RegisterForm entry={editing} existing={entries} {onsaved} oncancel={cancel} />
        {/key}
      </section>
    </aside>
  {/if}

  <div class="list">
    {#if exportError}
      <p class="msg msg-danger" role="alert"><Icon name="warning" />{exportError}</p>
    {/if}

    {#if mode === "batch"}
      <section class="card">
        <AdhocBatchForm existing={entries} {onsaved} oncancel={cancel} />
      </section>
    {:else if mode === "import"}
      <section class="card">
        <RegisterImport existing={entries} onimported={onsaved} oncancel={cancel} />
      </section>
    {/if}

    {#if sorted.length === 0}
      <div class="empty">
        <p>{t("register.empty")}</p>
        <button type="button" class="btn btn-primary" onclick={() => start("add")}>
          {t("register.add")}
        </button>
      </div>
    {:else if shown.length === 0}
      <p class="msg">{t("register.search.none", { query: query.trim() })}</p>
    {:else}
      <div class="table-box register-box">
        <table class="table" aria-label={t("register.title")}>
          <thead>
            <tr>
              <th scope="col">{t("register.field.label")}</th>
              <th scope="col">{t("register.field.person")}</th>
              <th scope="col">{t("register.field.street")}</th>
              <th scope="col">{t("register.field.role")}</th>
              <th scope="col">{t("register.field.phone")}</th>
              <th scope="col">{t("register.field.radio")}</th>
              <th scope="col">{t("handover.column.lastHeard")}</th>
              <th scope="col"><span class="visually-hidden">{t("register.edit")}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each shown as entry (entry.id)}
              <tr
                aria-selected={editing?.id === entry.id ? "true" : undefined}
                data-radio={entry.publicKey === undefined ? "false" : "true"}
              >
                <td class="label">{entry.label}</td>
                <td>{entry.person ?? ""}</td>
                <td>{entry.street ?? ""}</td>
                <td>{entry.role ?? ""}</td>
                <td class="phone">{entry.phone ?? ""}</td>
                <td class="radio">
                  {#if entry.publicKey === undefined}
                    <span class="row-meta" aria-label={t("register.radio.none")}>—</span>
                  {:else}
                    <span class="radio-cell" title={radioTitle(entry)}>
                      <Icon name="radio" /><code>{entry.publicKey.slice(0, 12)}…</code>
                    </span>
                  {/if}
                </td>
                <td class="heard" title={heardTitle(entry)}>{heardText(entry)}</td>
                <td class="actions">
                  <button
                    type="button"
                    class="btn btn-quiet btn-compact"
                    onclick={() => startEdit(entry)}
                  >
                    {t("register.edit")}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Layout only: the toolbar, then the list; with the form open a 22.5 rem card at the right
     from 60 rem up (it slides in), inline between the toolbar and the list below that. The
     list is as tall as the viewport leaves, so the table scrolls under its sticky header and
     the page does not. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "toolbar"
      "list";
    gap: var(--s-3) var(--s-5);
    height: calc(100vh - 3.5rem - 2 * var(--s-5));
    min-height: 24rem;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .layout.with-side {
    grid-template-columns: minmax(0, 1fr) 22.5rem;
    grid-template-areas:
      "toolbar side"
      "list side";
  }

  .toolbar {
    grid-area: toolbar;
  }

  .side {
    grid-area: side;
    min-height: 0;
    overflow-y: auto;
    animation: slide-in 160ms ease-out;
  }

  @keyframes slide-in {
    from {
      transform: translateX(var(--s-4));
    }
  }

  .list {
    grid-area: list;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    min-height: 0;
  }

  .register-box {
    flex: 0 1 auto;
  }

  .heard,
  .phone,
  .radio {
    white-space: nowrap;
  }

  .radio-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
  }

  .actions {
    width: 1px;
    white-space: nowrap;
  }

  .msg {
    margin: 0;
  }

  @media (max-width: 60rem) {
    .layout,
    .layout.with-side {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "toolbar"
        "side"
        "list";
      grid-template-rows: auto;
      height: auto;
    }

    .side {
      overflow: visible;
      animation: none;
    }

    .register-box {
      max-height: 60vh;
    }
  }
</style>
