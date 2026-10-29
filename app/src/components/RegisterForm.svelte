<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import type { PendingRegisterRow, RegisterEntry, RegisterOrigin } from "../store/types.ts";
  import { isValidPublicKey, normalizePublicKey, REGISTER_ORIGINS } from "../store/register.ts";
  import { DuplicatePublicKeyError, NoPendingRowError } from "../store/journalStore.ts";
  import { addRegisterEntry, bindPendingRegisterRow, saveRegisterEntry } from "../store/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import ContactPicker from "./ContactPicker.svelte";

  interface Props {
    // The entry being edited; absent for a new one.
    entry?: RegisterEntry;
    // The pending row being bound to a radio (P1-06): its fields seed the form, the key is
    // what is missing. Absent otherwise; never together with `entry`.
    pending?: PendingRegisterRow;
    // Everything in the register, for the duplicate-key check before the store is asked.
    existing: readonly RegisterEntry[];
    onsaved: (message: string) => void;
    oncancel: () => void;
  }
  let { entry, pending, existing, onsaved, oncancel }: Props = $props();

  // The entry (or pending row) as it was when the form opened. An edit form works on that
  // snapshot on purpose: the drafts below are seeded from it once, and RegisterPage
  // re-creates the form ({#key editing?.id}) when another entry is picked. untrack says so to
  // the compiler, which would otherwise warn that each draft only captures the initial value
  // (state_referenced_locally). The live `entry` is still read where it should be live: the
  // duplicate-key check, the title and save.
  const initial: RegisterEntry | PendingRegisterRow | undefined = untrack(() => entry ?? pending);

  // Drafts: edited here, written to the store on save.
  let label = $state(initial?.label ?? "");
  let person = $state(initial?.person ?? "");
  let street = $state(initial?.street ?? "");
  let role = $state(initial?.role ?? "");
  let origin: RegisterOrigin = $state(initial?.origin ?? "issued");
  let notes = $state(initial?.notes ?? "");
  // A pending row has no key: that is what the form is for.
  let publicKey = $state(untrack(() => entry?.publicKey ?? ""));

  let picking = $state(false);
  let busy = $state(false);
  let error: string | null = $state(null);

  const normalizedKey = $derived(normalizePublicKey(publicKey));
  const labelError = $derived(label.trim() === "" ? t("register.labelRequired") : null);
  const keyError = $derived(
    !isValidPublicKey(normalizedKey)
      ? t("register.publicKeyInvalid")
      : existing.some((other) => other.publicKey === normalizedKey && other.id !== entry?.id)
        ? t("register.publicKeyTaken")
        : null,
  );
  const canSave = $derived(labelError === null && keyError === null && !busy);

  const takenKeys = $derived(
    new Set(existing.filter((other) => other.id !== entry?.id).map((other) => other.publicKey)),
  );

  // Optional fields: empty means absent, so the stored object has no empty strings.
  function optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }

  function onpick(contact: Contact) {
    publicKey = contact.publicKey;
    picking = false;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    busy = true;
    error = null;
    try {
      const fields = {
        label: label.trim(),
        person: optional(person),
        street: optional(street),
        role: optional(role),
        origin,
        notes: optional(notes),
        publicKey: normalizedKey,
      };
      if (pending !== undefined) {
        await bindPendingRegisterRow(pending.id, fields);
        onsaved(t("register.bound"));
      } else if (entry === undefined) {
        await addRegisterEntry(fields);
        onsaved(t("register.saved"));
      } else {
        const result = await saveRegisterEntry({ ...entry, ...fields });
        onsaved(result.note === null ? t("register.saved") : t("register.savedWithNote"));
      }
    } catch (failure) {
      if (failure instanceof NoPendingRowError) {
        // Bound or gone meanwhile (another tab): back to the list, which is reloaded.
        onsaved(t("register.pendingGone"));
        return;
      }
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
  <h2>
    {#if pending !== undefined}
      {t("register.formTitle.bind", { label: pending.label })}
    {:else if entry === undefined}
      {t("register.formTitle.add")}
    {:else}
      {t("register.formTitle.edit", { label: entry.label })}
    {/if}
  </h2>

  <div class="field">
    <label for="register-label">{t("register.field.label")}</label>
    <input
      id="register-label"
      type="text"
      required
      bind:value={label}
      aria-invalid={labelError !== null}
    />
    <small>{t("register.labelHelp")}</small>
    {#if labelError}
      <small class="error">{labelError}</small>
    {/if}
  </div>

  <div class="field">
    <label for="register-person">{t("register.field.person")}</label>
    <input id="register-person" type="text" autocomplete="off" bind:value={person} />
  </div>

  <div class="field">
    <label for="register-street">{t("register.field.street")}</label>
    <input id="register-street" type="text" autocomplete="off" bind:value={street} />
  </div>

  <div class="field">
    <label for="register-role">{t("register.field.role")}</label>
    <input id="register-role" type="text" autocomplete="off" bind:value={role} />
  </div>

  <div class="field">
    <label for="register-origin">{t("register.field.origin")}</label>
    <select id="register-origin" bind:value={origin}>
      {#each REGISTER_ORIGINS as option (option)}
        <option value={option}>{t(`register.origin.${option}`)}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="register-public-key">{t("register.field.publicKey")}</label>
    <div class="key-row">
      <input
        id="register-public-key"
        type="text"
        class="key"
        autocomplete="off"
        spellcheck="false"
        maxlength="80"
        bind:value={publicKey}
        aria-invalid={keyError !== null}
      />
      <button type="button" class="secondary" onclick={() => (picking = !picking)}>
        {t("register.pick")}
      </button>
    </div>
    <small>{t("register.publicKeyHelp")}</small>
    {#if keyError && publicKey.trim() !== ""}
      <small class="error">{keyError}</small>
    {/if}
    {#if picking}
      <ContactPicker {takenKeys} {onpick} onclose={() => (picking = false)} />
    {/if}
  </div>

  <div class="field">
    <label for="register-notes">{t("register.field.notes")}</label>
    <textarea id="register-notes" rows="3" bind:value={notes}></textarea>
    <small>{t("register.notesHelp")}</small>
  </div>

  <div class="actions">
    <button type="submit" disabled={!canSave}>
      {pending === undefined ? t("register.save") : t("register.bind")}
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

  small {
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .key-row {
    display: flex;
    gap: 0.5rem;
  }

  .key {
    flex: 1;
    font-family: ui-monospace, Consolas, monospace;
  }

  textarea {
    font: inherit;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 4px;
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
