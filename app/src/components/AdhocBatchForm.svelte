<script lang="ts">
  // Several ad hoc radios at once (P0-03; on the components in P2-04): the first number and
  // how many, then one table row per radio with its label and a key field with Pick from
  // radio beside it. Every row has to be valid before Create. The register page puts this in
  // a card under the toolbar.
  import { t } from "../i18n/index.svelte.ts";
  import type { NewRegisterEntry, RegisterEntry } from "../store/types.ts";
  import { adhocLabels, isValidPublicKey, normalizePublicKey } from "../store/register.ts";
  import { DuplicatePublicKeyError } from "../store/journalStore.ts";
  import { addRegisterEntries } from "../store/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import ContactPicker from "./ContactPicker.svelte";
  import Icon from "./Icon.svelte";

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

  function typed(index: number): boolean {
    return (keys[index] ?? "").trim() !== "";
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

<form class="batch-form" onsubmit={save} aria-labelledby="batch-form-heading">
  <h2 id="batch-form-heading" class="card-title">{t("register.batch.title")}</h2>
  <p class="msg help">{t("register.batch.help")}</p>

  <div class="numbers">
    <div class="field">
      <label for="batch-first">{t("register.batch.first")}</label>
      <input id="batch-first" type="number" min="1" step="1" bind:value={first} />
    </div>
    <div class="field">
      <label for="batch-count">{t("register.batch.count")}</label>
      <input id="batch-count" type="number" min="1" max={MAX_COUNT} step="1" bind:value={count} />
    </div>
  </div>
  {#if !numbersValid}
    <p class="field-error" role="alert">
      <Icon name="warning" />{t("register.batch.numbersInvalid")}
    </p>
  {/if}

  {#if rows.length > 0}
    <div class="table-box rows-box-batch">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">{t("register.field.label")}</th>
            <th scope="col">{t("register.field.publicKey")}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.index)}
            <tr>
              <td class="label">
                {row.label}
                {#if row.labelError}
                  <span class="field-error"><Icon name="warning" />{row.labelError}</span>
                {/if}
              </td>
              <td>
                <div class="field field-mono">
                  <div class="field-line">
                    <input
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="80"
                      aria-label={t("register.field.publicKey")}
                      aria-invalid={row.keyError !== null && typed(row.index)}
                      value={keys[row.index] ?? ""}
                      oninput={(event) => setKey(row.index, event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="btn"
                      aria-expanded={pickingRow === row.index}
                      onclick={() => (pickingRow = pickingRow === row.index ? null : row.index)}
                    >
                      <Icon name="radio" />{t("register.pick")}
                    </button>
                  </div>
                  {#if row.keyError && typed(row.index)}
                    <span class="field-error"><Icon name="warning" />{row.keyError}</span>
                  {/if}
                  {#if pickingRow === row.index}
                    <ContactPicker {takenKeys} {onpick} onclose={() => (pickingRow = null)} />
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="form-actions">
    <button type="submit" class="btn btn-primary" disabled={!canSave}>
      {t("register.batch.create", { count: rows.length })}
    </button>
    <button type="button" class="btn" onclick={oncancel}>{t("register.cancel")}</button>
  </div>
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only. */
  .batch-form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .help {
    margin: calc(-1 * var(--s-2)) 0 0;
  }

  .numbers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-4);
  }

  .numbers .field {
    flex: 0 1 10rem;
  }

  .field-error {
    margin: 0;
  }

  .label .field-error {
    white-space: normal;
  }

  .rows-box-batch {
    max-height: 24rem;
  }

  .msg {
    margin: 0;
  }
</style>
