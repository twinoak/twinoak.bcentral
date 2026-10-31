<script lang="ts">
  // The radio's contact list as a picker (P0-03; on the components in P2-04): a small card
  // under the public-key field with one row per contact — the name, the key's prefix and
  // Pick, or a chip when the key is already in the register. Closed by its own button or by
  // a pick.
  import { t } from "../i18n/index.svelte.ts";
  import { contactSource } from "../radio/index.ts";
  import type { Contact } from "../radio/contactSource.ts";
  import Icon from "./Icon.svelte";

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

<section class="card picker" aria-labelledby="picker-heading">
  <h3 id="picker-heading" class="card-title">
    <span>{t("register.picker.title")}</span>
    <button
      type="button"
      class="btn btn-quiet btn-icon"
      aria-label={t("register.picker.close")}
      title={t("register.picker.close")}
      onclick={onclose}><Icon name="close" /></button
    >
  </h3>

  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {:else if contacts === null}
    <p class="msg">{t("register.picker.loading")}</p>
  {:else if contacts.length === 0}
    <p class="msg">{t("register.picker.empty")}</p>
  {:else}
    <div class="table-box list">
      <table class="table">
        <tbody>
          {#each contacts as contact (contact.publicKey)}
            {@const taken = takenKeys.has(contact.publicKey)}
            <tr>
              <td class="label">{contact.name}</td>
              <td><code title={contact.publicKey}>{contact.publicKey.slice(0, 12)}…</code></td>
              <td class="action">
                {#if taken}
                  <span class="chip">{t("register.picker.taken")}</span>
                {:else}
                  <button
                    type="button"
                    class="btn btn-quiet btn-compact"
                    onclick={() => onpick(contact)}
                  >
                    {t("register.picker.pick")}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  /* Layout only: a compact card under the field, the list scrolling in its box. */
  .picker {
    margin-top: var(--s-2);
    padding: var(--s-3) var(--s-4);
  }

  .picker .card-title {
    margin-bottom: var(--s-2);
  }

  .list {
    max-height: 14rem;
  }

  .action {
    width: 1px;
    white-space: nowrap;
    text-align: right;
  }

  .msg {
    margin: 0;
  }
</style>
