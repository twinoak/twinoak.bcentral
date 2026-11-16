<script lang="ts">
  // Add or edit a contact (P0-03, P3-06; on the components in P2-04): Label, Person, Street,
  // Role, Phone and Notes on `.field`, then the Radio section — the public key with Pick from
  // radio beside it and the contact picker under it, and Origin, enabled only while a key is
  // typed — and Save / Cancel. A contact without a radio leaves the key empty; the rule of
  // what is stored and what is wrong is lib/registerForm.ts (the key and the origin go
  // together or not at all, so the form cannot produce what the schema refuses). The
  // register page puts this in a card at the side (or inline under the toolbar on a narrow
  // screen) and gives the title.
  import { untrack } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { checkRegisterDrafts, registerFieldsFrom } from "../lib/registerForm.ts";
  import type { RegisterEntry, RegisterOrigin } from "../store/types.ts";
  import { REGISTER_ORIGINS, withoutRadio } from "../store/register.ts";
  import { DuplicatePublicKeyError } from "../store/journalStore.ts";
  import { addRegisterEntry, saveRegisterEntry } from "../store/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import ContactPicker from "./ContactPicker.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    // The entry being edited; absent for a new one.
    entry?: RegisterEntry;
    // Everything in the register, for the duplicate-key check before the store is asked.
    existing: readonly RegisterEntry[];
    onsaved: (message: string) => void;
    oncancel: () => void;
  }
  let { entry, existing, onsaved, oncancel }: Props = $props();

  // The entry as it was when the form opened. An edit form works on that snapshot on
  // purpose: the drafts below are seeded from it once, and RegisterPage re-creates the form
  // ({#key editing?.id}) when another entry is picked. untrack says so to the compiler,
  // which would otherwise warn that each draft only captures the initial value
  // (state_referenced_locally). The live `entry` is still read where it should be live: the
  // duplicate-key check, the title and save.
  const initial: RegisterEntry | undefined = untrack(() => entry);

  // Drafts: edited here, written to the store on save. The origin starts at issued so a
  // key typed later has one; it is disabled, and not stored, while the key is empty.
  let label = $state(initial?.label ?? "");
  let person = $state(initial?.person ?? "");
  let street = $state(initial?.street ?? "");
  let role = $state(initial?.role ?? "");
  let phone = $state(initial?.phone ?? "");
  let notes = $state(initial?.notes ?? "");
  let publicKey = $state(initial?.publicKey ?? "");
  let origin: RegisterOrigin | "" = $state(initial?.origin ?? "issued");

  let picking = $state(false);
  let busy = $state(false);
  let error: string | null = $state(null);
  // The label's error waits until the field has been left or a save was tried: an empty
  // form that has just opened is not wrong yet (P2-05's audit).
  let labelTouched = $state(false);

  const drafts = $derived({ label, person, street, role, phone, notes, publicKey, origin });
  const check = $derived(checkRegisterDrafts(drafts, existing, entry?.id));
  const labelError = $derived(check.labelError === null ? null : t("register.labelRequired"));
  const showLabelError = $derived(labelError !== null && labelTouched);
  const radioError = $derived(
    check.radioError === "keyInvalid"
      ? t("register.publicKeyInvalid")
      : check.radioError === "keyTaken"
        ? t("register.publicKeyTaken")
        : check.radioError === "originMissing"
          ? t("register.originRequired")
          : null,
  );
  const canSave = $derived(check.labelError === null && check.radioError === null && !busy);

  const takenKeys = $derived(
    new Set(
      existing
        .filter((other) => other.id !== entry?.id && other.publicKey !== undefined)
        .map((other) => other.publicKey ?? ""),
    ),
  );

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
      const fields = registerFieldsFrom(drafts, existing, entry?.id);
      if (entry === undefined) {
        await addRegisterEntry(fields);
        onsaved(t("register.saved"));
      } else {
        // The radio's two fields are replaced together: an entry that had a key and loses
        // it loses its origin with it (a spread over the entry would keep the old ones).
        const result = await saveRegisterEntry({ ...withoutRadio(entry), ...fields });
        onsaved(result.note === null ? t("register.saved") : t("register.savedWithNote"));
      }
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

<form class="register-form" onsubmit={save} aria-labelledby="register-form-heading">
  <h2 id="register-form-heading" class="card-title">
    {#if entry === undefined}
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
        <label for="register-phone">{t("register.field.phone")}</label>
        <input id="register-phone" type="tel" autocomplete="off" bind:value={phone} />
      </div>
    </div>

    <div class="field">
      <label for="register-notes">{t("register.field.notes")}</label>
      <textarea id="register-notes" rows="3" bind:value={notes}></textarea>
      <span class="field-help">{t("register.notesHelp")}</span>
    </div>

    <!-- The radio: the key, and with it the origin. Empty for a contact without one. -->
    <div class="radio" role="group" aria-labelledby="register-radio-heading" data-register-radio>
      <span class="field-label" id="register-radio-heading">{t("register.field.radio")}</span>
      <p class="field-help">{t("register.radioHelp")}</p>

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
            aria-invalid={check.radioError === "keyInvalid" || check.radioError === "keyTaken"}
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
        {#if picking}
          <ContactPicker {takenKeys} {onpick} onclose={() => (picking = false)} />
        {/if}
      </div>

      <div class="field">
        <label for="register-origin">{t("register.field.origin")}</label>
        <select
          id="register-origin"
          bind:value={origin}
          disabled={!check.hasRadio}
          aria-invalid={check.radioError === "originMissing"}
          aria-describedby="register-origin-help"
        >
          {#each REGISTER_ORIGINS as option (option)}
            <option value={option}>{t(`register.origin.${option}`)}</option>
          {/each}
        </select>
        <span class="field-help" id="register-origin-help">{t("register.originHelp")}</span>
      </div>

      {#if radioError !== null}
        <span class="field-error" role="alert"><Icon name="warning" />{radioError}</span>
      {/if}
    </div>
  </div>

  <div class="form-actions">
    <button type="submit" class="btn btn-primary" disabled={!canSave}>
      {t("register.save")}
    </button>
    <button type="button" class="btn" onclick={oncancel}>{t("register.cancel")}</button>
  </div>
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only: the fields stacked, the four short ones two to a line when there is room,
     the radio section a group with its own stack. */
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

  .radio {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;
  }

  .radio > .field-help {
    margin: 0;
  }

  .msg {
    margin: var(--s-3) 0 0;
  }
</style>
