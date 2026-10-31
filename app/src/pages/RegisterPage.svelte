<script lang="ts">
  import { t, language } from "../i18n/index.svelte.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import type { PendingRegisterRow, RegisterEntry } from "../store/types.ts";
  import { exportRegisterCsv, listPendingRegister, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import RegisterForm from "../components/RegisterForm.svelte";
  import AdhocBatchForm from "../components/AdhocBatchForm.svelte";
  import RegisterImport from "../components/RegisterImport.svelte";

  // bind: a pending row (imported without a key, P1-06) gets its key and becomes an entry.
  type Mode = "list" | "add" | "edit" | "batch" | "import" | "bind";

  let mode: Mode = $state("list");
  let editing: RegisterEntry | undefined = $state(undefined);
  let binding: PendingRegisterRow | undefined = $state(undefined);
  let entries: RegisterEntry[] = $state([]);
  let pending: PendingRegisterRow[] = $state([]);
  let loadError: string | null = $state(null);
  let status: string | null = $state(null);
  let exportError: string | null = $state(null);
  let busy = $state(false);

  const sorted = $derived(sortedByLabel(entries, language()));
  const sortedPending = $derived(sortedByLabel(pending, language()));

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function reload() {
    try {
      entries = await listRegister();
      pending = await listPendingRegister();
      loadError = null;
    } catch (failure) {
      loadError = t("register.loadFailed", { error: describe(failure) });
    }
  }
  void reload();

  function start(next: Mode) {
    status = null;
    exportError = null;
    editing = undefined;
    binding = undefined;
    mode = next;
  }

  function startEdit(entry: RegisterEntry) {
    start("edit");
    editing = entry;
  }

  function startBind(row: PendingRegisterRow) {
    start("bind");
    binding = row;
  }

  function cancel() {
    editing = undefined;
    binding = undefined;
    mode = "list";
  }

  async function onsaved(message: string) {
    status = message;
    editing = undefined;
    binding = undefined;
    mode = "list";
    await reload();
  }

  async function exportCsv() {
    busy = true;
    status = null;
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
</script>

<h1>{t("register.title")}</h1>
<p class="intro">{t("register.intro")}</p>

{#if loadError}
  <p class="error" role="alert">{loadError}</p>
{/if}

{#if mode === "add" || mode === "edit"}
  {#key editing?.id}
    <RegisterForm entry={editing} existing={entries} {onsaved} oncancel={cancel} />
  {/key}
{:else if mode === "bind"}
  {#key binding?.id}
    <RegisterForm pending={binding} existing={entries} {onsaved} oncancel={cancel} />
  {/key}
{:else if mode === "batch"}
  <AdhocBatchForm existing={entries} {onsaved} oncancel={cancel} />
{:else if mode === "import"}
  <RegisterImport existing={entries} onimported={onsaved} oncancel={cancel} />
{:else}
  <div class="actions">
    <button type="button" onclick={() => start("add")}>{t("register.add")}</button>
    <button type="button" class="secondary" onclick={() => start("batch")}
      >{t("register.addBatch")}</button
    >
    <button type="button" class="secondary" onclick={() => start("import")}
      >{t("register.import")}</button
    >
    <button type="button" class="secondary" onclick={exportCsv} disabled={busy}
      >{t("register.export")}</button
    >
    <a class="button secondary" href={hashFor("printRegister")}>{t("register.print")}</a>
    {#if status}
      <span class="status" role="status">{status}</span>
    {/if}
    {#if exportError}
      <span class="error" role="alert">{exportError}</span>
    {/if}
  </div>

  {#if sorted.length === 0}
    <p class="muted">{t("register.empty")}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">{t("register.field.label")}</th>
          <th scope="col">{t("register.field.person")}</th>
          <th scope="col">{t("register.field.street")}</th>
          <th scope="col">{t("register.field.role")}</th>
          <th scope="col">{t("register.field.origin")}</th>
          <th scope="col">{t("register.field.publicKey")}</th>
          <th scope="col">{t("register.field.notes")}</th>
          <th scope="col"><span class="visually-hidden">{t("register.edit")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as entry (entry.id)}
          <tr>
            <td class="label">{entry.label}</td>
            <td>{entry.person ?? ""}</td>
            <td>{entry.street ?? ""}</td>
            <td>{entry.role ?? ""}</td>
            <td>{t(`register.origin.${entry.origin}`)}</td>
            <td><code title={entry.publicKey}>{entry.publicKey.slice(0, 12)}…</code></td>
            <td class="notes">{entry.notes ?? ""}</td>
            <td>
              <button type="button" class="secondary small" onclick={() => startEdit(entry)}>
                {t("register.edit")}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- Rows imported without a key (P1-06): listed apart until a key is bound to them. -->
  {#if sortedPending.length > 0}
    <section class="pending" aria-labelledby="pending-heading">
      <h2 id="pending-heading">{t("register.pending.title")}</h2>
      <p class="muted">{t("register.pending.help")}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("register.field.label")}</th>
            <th scope="col">{t("register.field.person")}</th>
            <th scope="col">{t("register.field.street")}</th>
            <th scope="col">{t("register.field.role")}</th>
            <th scope="col">{t("register.field.origin")}</th>
            <th scope="col">{t("register.field.notes")}</th>
            <th scope="col"><span class="visually-hidden">{t("register.pending.bind")}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each sortedPending as row (row.id)}
            <tr>
              <td class="label">{row.label}</td>
              <td>{row.person ?? ""}</td>
              <td>{row.street ?? ""}</td>
              <td>{row.role ?? ""}</td>
              <td>{t(`register.origin.${row.origin}`)}</td>
              <td class="notes">{row.notes ?? ""}</td>
              <td>
                <button type="button" class="secondary small" onclick={() => startBind(row)}>
                  {t("register.pending.bind")}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
{/if}

<style>
  .intro,
  .muted {
    color: var(--muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .status {
    color: var(--ok);
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
    border-bottom: 1px solid var(--rule);
  }

  thead th {
    border-bottom-color: var(--line);
  }

  .label {
    font-weight: 600;
  }

  .notes {
    white-space: pre-wrap;
  }

  .pending {
    margin-top: 2rem;
  }

  .pending h2 {
    font-size: 1.2rem;
    margin: 0 0 0.25rem;
  }

  .pending p {
    margin: 0 0 0.75rem;
  }
</style>
