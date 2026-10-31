<script lang="ts">
  // Add or edit a register entry, or bind a pending row to a radio (P0-03, P1-06; on the
  // components in P2-04): the fields on `.field`, the key with Pick from radio beside it and
  // the contact picker under it, Save / Bind and Cancel. The register page puts this in a
  // card at the side (or inline under the toolbar on a narrow screen) and gives the title.
  import { untrack } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import type { PendingRegisterRow, RegisterEntry, RegisterOrigin } from "../store/types.ts";
  import { isValidPublicKey, normalizePublicKey, REGISTER_ORIGINS } from "../store/register.ts";
  import { DuplicatePublicKeyError, NoPendingRowError } from "../store/journalStore.ts";
  import { addRegisterEntry, bindPendingRegisterRow, saveRegisterEntry } from "../store/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import ContactPicker from "./ContactPicker.svelte";
  import Icon from "./Icon.svelte";

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
  // The label's error waits until the field has been left or a save was tried: an empty
  // form that has just opened is not wrong yet (P2-05's audit).
  let labelTouched = $state(false);

  const normalizedKey = $derived(normalizePublicKey(publicKey));
  const labelError = $derived(label.trim() === "" ? t("register.labelRequired") : null);
  const showLabelError = $derived(labelError !== null && labelTouched);
  const keyError = $derived(
    !isValidPublicKey(normalizedKey)
      ? t("register.publicKeyInvalid")
      : existing.some((other) => other.publicKey === normalizedKey && other.id !== entry?.id)
        ? t("register.publicKeyTaken")
        : null,
  );
  const showKeyError = $derived(keyError !== null && publicKey.trim() !== "");
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
    labelTouched = true;
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

<form class="register-form" onsubmit={save} aria-labelledby="register-form-heading">
  <h2 id="register-form-heading" class="card-title">
    {#if pending !== undefined}
      {t("register.formTitle.bind", { label: pending.label })}
    {:else if entry === undefined}
      {t("register.formTitle.add")}
    {:else}
      {t("register.formTitle.edit", { label: entry.label })}
    {/if}
  </h2>

  <div class="fields">
    <div class="field">
      <label for="register-label">{t("register.field.label")}</label>
      <input
        id="register-label"
        type="text"
        required
        bind:value={label}
        onblur={() => (labelTouched = true)}
        aria-invalid={showLabelError}
        aria-describedby="register-label-help"
      />
      <span class="field-help" id="register-label-help">{t("register.labelHelp")}</span>
      {#if showLabelError}
        <span class="field-error"><Icon name="warning" />{labelError}</span>
      {/if}
    </div>

    <div class="pair">
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
    </div>

    <div class="field field-mono">
      <label for="register-public-key">{t("register.field.publicKey")}</label>
      <div class="field-line">
        <input
          id="register-public-key"
          type="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="80"
          bind:value={publicKey}
          aria-invalid={showKeyError}
          aria-describedby="register-public-key-help"
        />
        <button
          type="button"
          class="btn"
          aria-expanded={picking}
          onclick={() => (picking = !picking)}
        >
          <Icon name="radio" />{t("register.pick")}
        </button>
      </div>
      <span class="field-help" id="register-public-key-help">{t("register.publicKeyHelp")}</span>
      {#if showKeyError}
        <span class="field-error" role="alert"><Icon name="warning" />{keyError}</span>
      {/if}
      {#if picking}
        <ContactPicker {takenKeys} {onpick} onclose={() => (picking = false)} />
      {/if}
    </div>

    <div class="field">
      <label for="register-notes">{t("register.field.notes")}</label>
      <textarea id="register-notes" rows="3" bind:value={notes}></textarea>
      <span class="field-help">{t("register.notesHelp")}</span>
    </div>
  </div>

  <div class="form-actions">
    <button type="submit" class="btn btn-primary" disabled={!canSave}>
      {pending === undefined ? t("register.save") : t("register.bind")}
    </button>
    <button type="button" class="btn" onclick={oncancel}>{t("register.cancel")}</button>
  </div>
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only: the fields stacked, the four short ones two to a line when there is room. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--s-4);
  }

  .msg {
    margin: var(--s-3) 0 0;
  }
</style>
