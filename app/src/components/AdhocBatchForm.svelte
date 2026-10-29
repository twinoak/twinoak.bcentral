<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import type { NewRegisterEntry, RegisterEntry } from "../store/types.ts";
  import { adhocLabels, isValidPublicKey, normalizePublicKey } from "../store/register.ts";
  import { DuplicatePublicKeyError } from "../store/journalStore.ts";
  import { addRegisterEntries } from "../store/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import ContactPicker from "./ContactPicker.svelte";

  interface Props {
    existing: readonly RegisterEntry[];
    onsaved: (message: string) => void;
    oncancel: () => void;
  }
  let { existing, onsaved, oncancel }: Props = $props();

  const MAX_COUNT = 100;

  // The number inputs yield undefined when empty.
  let first: number | undefined = $state(1);
  let count: number | undefined = $state(5);
  // One key per row, as typed; rows beyond the current count keep their text in case the
  // count goes back up.
  let keys: string[] = $state([]);
  let pickingRow: number | null = $state(null);
  let busy = $state(false);
  let error: string | null = $state(null);

  const numbersValid = $derived(
    first !== undefined &&
      Number.isInteger(first) &&
      first >= 1 &&
      count !== undefined &&
      Number.isInteger(count) &&
      count >= 1 &&
      count <= MAX_COUNT,
  );

  const labels = $derived(
    numbersValid && first !== undefined && count !== undefined ? adhocLabels(first, count) : [],
  );

  const existingLabels = $derived(new Set(existing.map((entry) => entry.label)));
  const existingKeys = $derived(new Set(existing.map((entry) => entry.publicKey)));

  interface Row {
    index: number;
    label: string;
    key: string;
    labelError: string | null;
    keyError: string | null;
  }

  const rows: Row[] = $derived.by(() => {
    const normalized = labels.map((_, index) => normalizePublicKey(keys[index] ?? ""));
    return labels.map((label, index) => {
      const key = normalized[index] ?? "";
      let keyError: string | null = null;
      if (!isValidPublicKey(key)) {
        keyError = t("register.publicKeyInvalid");
      } else if (existingKeys.has(key)) {
        keyError = t("register.publicKeyTaken");
      } else if (normalized.some((other, otherIndex) => other === key && otherIndex !== index)) {
        keyError = t("register.batch.keyRepeated");
      }
      return {
        index,
        label,
        key,
        labelError: existingLabels.has(label) ? t("register.batch.labelTaken", { label }) : null,
        keyError,
      };
    });
  });

  const canSave = $derived(
    numbersValid &&
      rows.length > 0 &&
      rows.every((row) => row.labelError === null && row.keyError === null) &&
      !busy,
  );

  // Keys the picker must not offer for this row: in the register, or typed into another row.
  const takenKeys = $derived(
    new Set([
      ...existingKeys,
      ...rows.filter((row) => row.index !== pickingRow).map((row) => row.key),
    ]),
  );

  function setKey(index: number, value: string) {
    keys[index] = value;
  }

  function onpick(contact: Contact) {
    if (pickingRow !== null) {
      setKey(pickingRow, contact.publicKey);
    }
    pickingRow = null;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    busy = true;
    error = null;
    try {
      const inputs: NewRegisterEntry[] = rows.map((row) => ({
        label: row.label,
        origin: "adhoc",
        publicKey: row.key,
      }));
      const created = await addRegisterEntries(inputs);
      onsaved(t("register.batch.created", { count: created.length }));
    } catch (failure) {
      error =
        failure instanceof DuplicatePublicKeyError
          ? t("register.publicKeyTaken")
          : t("register.saveFailed", {
              error: failure instanceof Error ? failure.message : String(failure),
            });
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={save}>
  <h2>{t("register.batch.title")}</h2>
  <p class="help">{t("register.batch.help")}</p>

  <div class="numbers">
    <div class="field">
      <label for="batch-first">{t("register.batch.first")}</label>
      <input id="batch-first" type="number" min="1" step="1" bind:value={first} />
    </div>
    <div class="field">
      <label for="batch-count">{t("register.batch.count")}</label>
      <input
        id="batch-count"
        type="number"
        min="1"
        max={MAX_COUNT}
        step="1"
        bind:value={count}
      />
    </div>
  </div>
  {#if !numbersValid}
    <p class="error">{t("register.batch.numbersInvalid")}</p>
  {/if}

  {#if rows.length > 0}
    <table>
      <thead>
        <tr>
          <th scope="col">{t("register.field.label")}</th>
          <th scope="col">{t("register.field.publicKey")}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.index)}
          <tr>
            <td>
              {row.label}
              {#if row.labelError}
                <small class="error">{row.labelError}</small>
              {/if}
            </td>
            <td>
              <div class="key-row">
                <input
                  type="text"
                  class="key"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="80"
                  aria-label={t("register.field.publicKey")}
                  aria-invalid={row.keyError !== null}
                  value={keys[row.index] ?? ""}
                  oninput={(event) => setKey(row.index, event.currentTarget.value)}
                />
                <button
                  type="button"
                  class="secondary"
                  onclick={() => (pickingRow = pickingRow === row.index ? null : row.index)}
                >
                  {t("register.pick")}
                </button>
              </div>
              {#if row.keyError && (keys[row.index] ?? "").trim() !== ""}
                <small class="error">{row.keyError}</small>
              {/if}
              {#if pickingRow === row.index}
                <ContactPicker {takenKeys} {onpick} onclose={() => (pickingRow = null)} />
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <div class="actions">
    <button type="submit" disabled={!canSave}>
      {t("register.batch.create", { count: rows.length })}
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

  .help {
    color: var(--muted);
    margin: 0 0 1rem;
  }

  .numbers {
    display: flex;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    max-width: 10rem;
  }

  label {
    font-weight: 600;
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
    border-bottom: 1px solid var(--rule);
  }

  .key-row {
    display: flex;
    gap: 0.5rem;
  }

  .key {
    flex: 1;
    font-family: ui-monospace, Consolas, monospace;
  }

  small {
    display: block;
  }

  .error {
    color: var(--error);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
</style>
