<script lang="ts">
  // Entries the operator types in by hand (P0-07): a note, or a message that came in from the
  // field on a non-mesh transport (phone, courier, verbal). Outgoing messages on any transport
  // go through the compose form; status changes and corrections are row actions in the
  // timeline.
  import { t } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { addMessageIn, addNote } from "../store/index.ts";
  import { NON_MESH_TRANSPORTS } from "../store/manual.ts";
  import type { RegisterEntry, Transport } from "../store/types.ts";

  interface Props {
    incidentId: string;
    register: readonly RegisterEntry[];
    // Called after the entry is stored; the parent reloads.
    onadded: () => Promise<void>;
  }
  let { incidentId, register, onadded }: Props = $props();

  type Kind = "note" | "message_in";

  let kind: Kind = $state("note");
  let counterpartyId = $state("");
  let transport: Transport = $state("phone");
  let text = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);

  const canAdd = $derived(
    hasOperatorName() && !busy && text.trim() !== "" && (kind === "note" || counterpartyId !== ""),
  );

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canAdd) {
      return;
    }
    busy = true;
    error = null;
    try {
      if (kind === "note") {
        await addNote(incidentId, text);
      } else {
        await addMessageIn({ incidentId, counterpartyId, transport, text });
      }
      text = "";
      await onadded();
    } catch (failure) {
      error = t("journal.add.failed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      busy = false;
    }
  }
</script>

<form class="manual" onsubmit={submit}>
  <div class="row">
    <div class="field">
      <label for="manual-kind">{t("journal.add.kind")}</label>
      <select id="manual-kind" bind:value={kind}>
        <option value="note">{t("journal.add.kind.note")}</option>
        <option value="message_in">{t("journal.add.kind.message_in")}</option>
      </select>
    </div>

    {#if kind === "message_in"}
      <div class="field">
        <label for="manual-from">{t("journal.add.counterparty")}</label>
        <select id="manual-from" bind:value={counterpartyId} disabled={register.length === 0}>
          <option value="">{t("send.recipient.choose")}</option>
          {#each register as entry (entry.id)}
            <option value={entry.id}>{entry.label}</option>
          {/each}
        </select>
        {#if register.length === 0}
          <small class="error">{t("send.recipient.none")}</small>
        {/if}
      </div>

      <div class="field">
        <label for="manual-transport">{t("send.transport")}</label>
        <select id="manual-transport" bind:value={transport}>
          {#each NON_MESH_TRANSPORTS as option (option)}
            <option value={option}>{t(`send.transport.${option}`)}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="field">
    <label for="manual-text">{t("journal.add.text")}</label>
    <textarea id="manual-text" rows="2" bind:value={text}></textarea>
  </div>

  <div class="actions">
    <button type="submit" disabled={!canAdd}>{t("journal.add.save")}</button>
    {#if error}
      <span class="error" role="alert">{error}</span>
    {/if}
  </div>
</form>

<style>
  .manual {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 12rem;
    flex: 1;
  }

  label {
    font-weight: 600;
  }

  textarea {
    font: inherit;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
    color: var(--ink);
    resize: vertical;
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
