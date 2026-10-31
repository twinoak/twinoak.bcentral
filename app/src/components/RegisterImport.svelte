<script lang="ts">
  // The CSV import (P1-06; on the components in P2-04): pick a file, see every row and every
  // error before anything is written, then import all of it in one go. The rules are
  // store/registerCsv.ts's; this component only shows the preview — a table in the card the
  // register page gives it, one chip per row for add / not yet bound / error — and asks for
  // the commit. There is no editing here: a file with an error is fixed where it came from
  // and picked again.
  import { t } from "../i18n/index.svelte.ts";
  import { chipClass, type ChipTint } from "../lib/journalRows.ts";
  import type { RegisterEntry } from "../store/types.ts";
  import {
    csvErrorText,
    previewRegisterImport,
    type CsvRow,
    type RegisterImportPreview,
  } from "../store/registerCsv.ts";
  import { importRegisterPreview } from "../store/index.ts";
  import { DuplicatePublicKeyError } from "../store/journalStore.ts";
  import Icon from "./Icon.svelte";

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

  type RowStatus = "error" | "add" | "pending";

  function rowStatus(row: CsvRow): RowStatus {
    if (row.errors.length > 0) {
      return "error";
    }
    return row.publicKey === "" ? "pending" : "add";
  }

  // The row's chip: ok for a row that is added, grey for one that waits for its key, danger
  // for one with an error (the words tell them apart as well).
  const ROW_TINT: Readonly<Record<RowStatus, ChipTint>> = {
    add: "ok",
    pending: "neutral",
    error: "danger",
  };

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

<form class="import-form" onsubmit={commit} aria-labelledby="import-form-heading">
  <h2 id="import-form-heading" class="card-title">{t("register.import.title")}</h2>
  <p class="msg help">{t("register.import.help")}</p>

  <div class="field file">
    <label for="register-import-file">{t("register.import.file")}</label>
    <input id="register-import-file" type="file" accept=".csv,text/csv" onchange={onfile} />
  </div>

  {#if readError}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{readError}</p>
  {/if}

  {#if preview !== null && counts !== null}
    <p class="msg" role="status">
      <Icon name="import" />{t("register.import.summary", {
        file: fileName,
        add: counts.add,
        pending: counts.pending,
        errors: counts.errors,
      })}
    </p>

    {#if preview.errors.length > 0}
      <div class="msg msg-danger" role="alert">
        <Icon name="warning" />
        <div>
          <p class="errors-title">{t("register.import.errors")}</p>
          <ul class="errors">
            {#each preview.errors as csvError, index (index)}
              <li>{csvErrorText(csvError)}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}

    {#if preview.rows.length === 0}
      {#if preview.errors.length === 0}
        <p class="msg">{t("register.import.noRows")}</p>
      {/if}
    {:else}
      <div class="table-box preview">
        <table class="table">
          <thead>
            <tr>
              <th scope="col" class="num">{t("register.import.line")}</th>
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
                <td class="num">{row.line}</td>
                <td class="label">{row.label}</td>
                <td>{row.person ?? ""}</td>
                <td>{row.street ?? ""}</td>
                <td>{row.role ?? ""}</td>
                <td>{t(`register.origin.short.${row.origin}`)}</td>
                <td>
                  {#if row.publicKey !== ""}
                    <code title={row.publicKey}>{row.publicKey.slice(0, 12)}…</code>
                  {/if}
                </td>
                <td class="notes">{row.notes ?? ""}</td>
                <td class="status">
                  <span class="chip {chipClass(ROW_TINT[status])}">
                    <span class="chip-dot" class:chip-dot-outline={status === "pending"}></span>{t(
                      `register.import.row.${status}`,
                    )}
                  </span>
                  {#if status === "error"}
                    <ul class="row-errors">
                      {#each row.errors as csvError, index (index)}
                        <li class="field-error"><Icon name="warning" />{csvErrorText(csvError)}</li>
                      {/each}
                    </ul>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <div class="form-actions">
    <button type="submit" class="btn btn-primary" disabled={!canImport}>
      <Icon name="import" />{t("register.import.commit", { count: preview?.rows.length ?? 0 })}
    </button>
    <button type="button" class="btn" onclick={oncancel}>{t("register.cancel")}</button>
  </div>
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only. */
  .import-form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .help {
    margin: calc(-1 * var(--s-2)) 0 0;
  }

  .file {
    max-width: 28rem;
  }

  .msg {
    margin: 0;
  }

  .errors-title,
  .errors {
    margin: 0;
  }

  .errors {
    padding-left: var(--s-4);
  }

  .preview {
    max-height: 60vh;
  }

  .notes {
    white-space: pre-wrap;
  }

  .status {
    white-space: nowrap;
  }

  .row-errors {
    list-style: none;
    margin: var(--s-1) 0 0;
    padding: 0;
    white-space: normal;
  }
</style>
