<script lang="ts">
  // Compose one outgoing message (P0-05): recipient, transport, text. Shows the predicted
  // "#n " prefix and the byte count against the 160-byte limit; Send is disabled over it.
  // On send the message is stored with its reserved #n; a mesh message is then handed to
  // the outbox, whose progress the parent shows.
  import { t } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import type { JournalEntry, RegisterEntry, Transport } from "../store/types.ts";
  import { composeMessage, lastSeqNo } from "../store/index.ts";
  import { MAX_MESSAGE_BYTES, previewText } from "../store/outgoing.ts";
  import { radio } from "../radio/index.ts";

  interface Props {
    incidentId: string;
    // The register, sorted as the parent wants it shown.
    register: readonly RegisterEntry[];
    // Called with the stored message_out; the parent sends mesh messages and reloads its list.
    onsent: (message: JournalEntry) => void;
  }
  let { incidentId, register, onsent }: Props = $props();

  const TRANSPORTS: readonly Transport[] = ["mesh", "phone", "courier", "verbal"];

  let counterpartyId = $state("");
  let transport: Transport = $state("mesh");
  let body = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);

  // The recipient's last #n from the store, re-read whenever the recipient changes or a
  // message was sent, so the shown prefix is the one that will be reserved.
  let last = $state(0);
  let lastLoadedFor = $state("");
  async function loadLast(id: string) {
    if (id === "") {
      last = 0;
      lastLoadedFor = "";
      return;
    }
    const n = await lastSeqNo(id);
    if (counterpartyId === id) {
      last = n;
      lastLoadedFor = id;
    }
  }
  $effect(() => {
    void loadLast(counterpartyId);
  });

  const preview = $derived(previewText(last, body));
  const radioReady = $derived(radio.state() === "connected" || radio.state() === "blind");
  const radioBlocks = $derived(transport === "mesh" && !radioReady);
  const canSend = $derived(
    hasOperatorName() &&
      counterpartyId !== "" &&
      lastLoadedFor === counterpartyId &&
      !preview.empty &&
      !preview.tooLong &&
      !radioBlocks &&
      !busy,
  );

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    busy = true;
    error = null;
    try {
      const { message } = await composeMessage({ incidentId, counterpartyId, transport, body });
      body = "";
      await loadLast(counterpartyId);
      onsent(message);
    } catch (failure) {
      error = t("send.failed", { error: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<form class="compose" onsubmit={submit}>
  {#if !hasOperatorName()}
    <p class="error" role="alert">{t("send.noOperator")}</p>
  {/if}

  <div class="row">
    <div class="field">
      <label for="send-transport">{t("send.transport")}</label>
      <select id="send-transport" bind:value={transport}>
        {#each TRANSPORTS as option (option)}
          <option value={option}>{t(`send.transport.${option}`)}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="send-recipient">{t("send.recipient")}</label>
      <select id="send-recipient" bind:value={counterpartyId} disabled={register.length === 0}>
        <option value="">{t("send.recipient.choose")}</option>
        {#each register as entry (entry.id)}
          <option value={entry.id}>{entry.label}</option>
        {/each}
      </select>
      {#if register.length === 0}
        <small class="error">{t("send.recipient.none")}</small>
      {/if}
    </div>
  </div>

  <div class="field">
    <label for="send-text">{t("send.text")}</label>
    <textarea id="send-text" rows="3" bind:value={body} aria-invalid={preview.tooLong}></textarea>
    <div class="meta">
      <small>{t("send.textHelp", { prefix: preview.prefix })}</small>
      <small class:error={preview.tooLong} role="status">
        {t("send.bytes", { bytes: preview.bytes, max: MAX_MESSAGE_BYTES })}
      </small>
    </div>
    {#if preview.tooLong}
      <small class="error" role="alert">
        {t("send.tooLong", { bytes: preview.bytes, max: MAX_MESSAGE_BYTES })}
      </small>
    {/if}
  </div>

  {#if radioBlocks}
    <p class="error" role="alert">{t("send.noRadio")}</p>
  {/if}

  <div class="actions">
    <button type="submit" disabled={!canSend}>
      {transport === "mesh" ? t("send.send") : t("send.record")}
    </button>
    {#if error}
      <span class="error" role="alert">{error}</span>
    {/if}
  </div>
</form>

<style>
  .compose {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
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
    min-width: 14rem;
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

  textarea[aria-invalid="true"] {
    border-color: var(--error);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  small {
    color: var(--muted);
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
