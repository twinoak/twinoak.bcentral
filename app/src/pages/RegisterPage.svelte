<script lang="ts">
  import { t, language } from "../i18n/index.svelte.ts";
  import type { RegisterEntry } from "../store/types.ts";
  import { listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import RegisterForm from "../components/RegisterForm.svelte";
  import AdhocBatchForm from "../components/AdhocBatchForm.svelte";

  type Mode = "list" | "add" | "edit" | "batch";

  let mode: Mode = $state("list");
  let editing: RegisterEntry | undefined = $state(undefined);
  let entries: RegisterEntry[] = $state([]);
  let loadError: string | null = $state(null);
  let status: string | null = $state(null);

  const sorted = $derived(sortedByLabel(entries, language()));

  async function reload() {
    try {
      entries = await listRegister();
      loadError = null;
    } catch (failure) {
      loadError = t("register.loadFailed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }
  void reload();

  function startAdd() {
    status = null;
    editing = undefined;
    mode = "add";
  }

  function startBatch() {
    status = null;
    editing = undefined;
    mode = "batch";
  }

  function startEdit(entry: RegisterEntry) {
    status = null;
    editing = entry;
    mode = "edit";
  }

  function cancel() {
    editing = undefined;
    mode = "list";
  }

  async function onsaved(message: string) {
    status = message;
    editing = undefined;
    mode = "list";
    await reload();
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
{:else if mode === "batch"}
  <AdhocBatchForm existing={entries} {onsaved} oncancel={cancel} />
{:else}
  <div class="actions">
    <button type="button" onclick={startAdd}>{t("register.add")}</button>
    <button type="button" class="secondary" onclick={startBatch}>{t("register.addBatch")}</button>
    {#if status}
      <span class="status" role="status">{status}</span>
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
    border-bottom: 1px solid var(--line);
  }

  .label {
    font-weight: 600;
  }

  .notes {
    white-space: pre-wrap;
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }

  .small {
    padding: 0.25rem 0.6rem;
  }
</style>
