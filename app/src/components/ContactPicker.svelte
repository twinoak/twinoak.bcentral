<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { contactSource, contactSourceIsPlaceholder } from "../radio/index.ts";
  import type { Contact } from "../radio/contactSource.ts";

  interface Props {
    // Keys already bound to a register entry: shown, but not pickable.
    takenKeys: ReadonlySet<string>;
    onpick: (contact: Contact) => void;
    onclose: () => void;
  }
  let { takenKeys, onpick, onclose }: Props = $props();

  let contacts: Contact[] | null = $state(null);
  let error: string | null = $state(null);

  async function load() {
    try {
      contacts = await contactSource.listContacts();
    } catch (failure) {
      error = t("register.picker.failed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }
  void load();
</script>

<section class="picker" aria-labelledby="picker-heading">
  <h3 id="picker-heading">{t("register.picker.title")}</h3>
  {#if contactSourceIsPlaceholder}
    <p class="muted">{t("register.picker.placeholder")}</p>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if contacts === null}
    <p class="muted">{t("register.picker.loading")}</p>
  {:else if contacts.length === 0}
    <p class="muted">{t("register.picker.empty")}</p>
  {:else}
    <ul>
      {#each contacts as contact (contact.publicKey)}
        <li>
          <button
            type="button"
            class="contact"
            disabled={takenKeys.has(contact.publicKey)}
            onclick={() => onpick(contact)}
          >
            <span class="name">{contact.name}</span>
            <code title={contact.publicKey}>{contact.publicKey.slice(0, 12)}…</code>
            {#if takenKeys.has(contact.publicKey)}
              <span class="muted">{t("register.picker.taken")}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <button type="button" class="secondary" onclick={onclose}>{t("register.picker.close")}</button>
</section>

<style>
  .picker {
    margin: 0.5rem 0 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
  }

  h3 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }

  ul {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
  }

  li + li {
    margin-top: 0.25rem;
  }

  .contact {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    width: 100%;
    text-align: left;
    background: var(--light);
    color: var(--ink);
    border-color: var(--line);
  }

  .contact:disabled {
    opacity: 0.6;
  }

  .name {
    font-weight: 600;
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }
</style>
