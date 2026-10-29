<script lang="ts">
  // The CSV import (P1-06): pick a file, see every row and every error before anything is
  // written, then import all of it in one go. The rules are store/registerCsv.ts's; this
  // component only shows the preview and asks for the commit. There is no editing here: a
  // file with an error is fixed where it came from and picked again.
  import { t } from "../i18n/index.svelte.ts";
  import type { RegisterEntry } from "../store/types.ts";
  import {
    csvErrorText,
    previewRegisterImport,
    type CsvRow,
    type RegisterImportPreview,
  } from "../store/registerCsv.ts";
  import { importRegisterPreview } from "../store/index.ts";
  import { DuplicatePublicKeyError } from "../store/journalStore.ts";

  interface Props {
    // Everything in the register, for the duplicate-key check before the store is asked.
    existing: readonly RegisterEntry[];
    onimported: (message: string) => void;
    oncancel: () => void;
  }
  let { existing, onimported, oncancel }: Props = $props();

  let fileName = $state("");
  let preview: RegisterImportPreview | null = $state(null);
  let readError: string | null = $state(null);
  let busy = $state(false);
  let error: string | null = $state(null);

  // What the summary line says: the rows that would be added or kept pending, and the errors.
  const counts = $derived.by(() => {
    const current = preview;
    if (current === null) {
      return null;
    }
    const clean = current.rows.filter((row) => row.errors.length === 0);
    return {
      add: clean.filter((row) => row.publicKey !== "").length,
      pending: clean.filter((row) => row.publicKey === "").length,
      errors: current.errors.length,
    };
  });
  const canImport = $derived.by(() => {
    const current = preview;
    return current !== null && current.errors.length === 0 && current.rows.length > 0 && !busy;
  });

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function rowStatus(row: CsvRow): "error" | "add" | "pending" {
    if (row.errors.length > 0) {
      return "error";
    }
    return row.publicKey === "" ? "pending" : "add";
  }

  async function onfile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    preview = null;
    error = null;
    readError = null;
    if (file === undefined) {
      fileName = "";
      return;
    }
    fileName = file.name;
    try {
      const text = await file.text();
      preview = previewRegisterImport(text, existing);
    } catch (failure) {
      readError = t("register.import.readFailed", { error: describe(failure) });
    }
  }

  async function commit(event: SubmitEvent) {
    event.preventDefault();
    if (preview === null || !canImport) {
      return;
    }
    busy = true;
    error = null;
    try {
      const result = await importRegisterPreview(preview, fileName);
      onimported(
        t(result.note === null ? "register.import.imported" : "register.import.importedWithNote", {
          entries: result.entries.length,
          pending: result.pending.length,
          file: fileName,
        }),
      );
    } catch (failure) {
      error =
        failure instanceof DuplicatePublicKeyError
          ? t("register.publicKeyTaken")
          : t("register.import.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={commit}>
  <h2>{t("register.import.title")}</h2>
  <p class="help">{t("register.import.help")}</p>

  <div class="field">
    <label for="register-import-file">{t("register.import.file")}</label>
    <input id="register-import-file" type="file" accept=".csv,text/csv" onchange={onfile} />
  </div>

  {#if readError}
    <p class="error" role="alert">{readError}</p>
  {/if}

  {#if preview !== null && counts !== null}
    <p class="summary" role="status">
      {t("register.import.summary", {
        file: fileName,
        add: counts.add,
        pending: counts.pending,
        errors: counts.errors,
      })}
    </p>

    {#if preview.errors.length > 0}
      <section class="errors" aria-labelledby="import-errors-heading">
        <h3 id="import-errors-heading">{t("register.import.errors")}</h3>
        <ul>
          {#each preview.errors as csvError, index (index)}
            <li>{csvErrorText(csvError)}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if preview.rows.length === 0}
      {#if preview.errors.length === 0}
        <p class="muted">{t("register.import.noRows")}</p>
      {/if}
    {:else}
      <table>
        <thead>
          <tr>
            <th scope="col">{t("register.import.line")}</th>
            <th scope="col">{t("register.field.label")}</th>
            <th scope="col">{t("register.field.person")}</th>
            <th scope="col">{t("register.field.street")}</th>
            <th scope="col">{t("register.field.role")}</th>
            <th scope="col">{t("register.field.origin")}</th>
            <th scope="col">{t("register.field.publicKey")}</th>
            <th scope="col">{t("register.field.notes")}</th>
            <th scope="col">{t("register.import.status")}</th>
          </tr>
        </thead>
        <tbody>
          {#each preview.rows as row (row.line)}
            {@const status = rowStatus(row)}
            <tr data-status={status}>
              <td class="line">{row.line}</td>
              <td class="label">{row.label}</td>
              <td>{row.person ?? ""}</td>
              <td>{row.street ?? ""}</td>
              <td>{row.role ?? ""}</td>
              <td>{t(`register.origin.${row.origin}`)}</td>
              <td>
                {#if row.publicKey !== ""}
                  <code title={row.publicKey}>{row.publicKey.slice(0, 12)}…</code>
                {/if}
              </td>
              <td class="notes">{row.notes ?? ""}</td>
              <td class="status">
                {t(`register.import.row.${status}`)}
                {#if status === "error"}
                  <ul class="row-errors">
                    {#each row.errors as csvError, index (index)}
                      <li>{csvErrorText(csvError)}</li>
                    {/each}
                  </ul>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}

  <div class="actions">
    <button type="submit" disabled={!canImport}>
      {t("register.import.commit", { count: preview?.rows.length ?? 0 })}
    </button>
    <button type="button" class="secondary" onclick={oncancel}>{t("register.cancel")}</button>
    {#if error}
      <span class="error" role="alert">{error}</span>
    {/if}
  </div>
</form>

<style>
  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.5rem;
  }

  h3 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
  }

  .help,
  .muted {
    color: var(--muted);
    margin: 0 0 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    max-width: 40rem;
  }

  label {
    font-weight: 600;
  }

  .summary {
    font-weight: 600;
    margin: 0 0 0.75rem;
  }

  .errors {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--error);
    border-radius: 4px;
    background: #fff;
  }

  .errors ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .error {
    color: var(--error);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }

  .line {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .label {
    font-weight: 600;
  }

  .notes {
    white-space: pre-wrap;
  }

  .status {
    white-space: nowrap;
  }

  tr[data-status="error"] .status {
    color: var(--error);
    white-space: normal;
  }

  tr[data-status="pending"] .status {
    color: var(--muted);
  }

  .row-errors {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
    font-size: 0.9em;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }
</style>
