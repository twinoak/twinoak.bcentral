<script lang="ts">
  // Compose one outgoing message (P0-05): recipient, transport, text. Shows the predicted
  // "#n " prefix and the byte count against the 160-byte limit; Send is disabled over it.
  // On send the message is stored with its reserved #n; a mesh message is then handed to
  // the outbox, whose progress the parent shows.
  //
  // Reply from the row (P1-02): the parent calls replyTo(entry) with an incoming message; the
  // form takes the recipient and transport from it, focuses the text, scrolls itself into
  // view and shows "Replying to: …" with a ✕ that drops the link. The message is then stored
  // with refersTo = the incoming entry's id. Keys inside the form: Esc drops the link,
  // Ctrl+Enter sends. The N shortcut (P1-09) puts the cursor in the text from anywhere.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import type { JournalEntry, RegisterEntry, Transport } from "../store/types.ts";
  import { composeMessage, lastSeqNo } from "../store/index.ts";
  import { MAX_MESSAGE_BYTES, previewText, replySnippet } from "../store/outgoing.ts";
  import { radio } from "../radio/index.ts";

  interface Props {
    incidentId: string;
    // True in a drill incident (P1-05): the shown prefix and the byte counter carry the
    // ØVELSE prefix the store will put in front of the text.
    drill?: boolean;
    // The register, sorted as the parent wants it shown.
    register: readonly RegisterEntry[];
    // Called with the stored message_out; the parent sends mesh messages and reloads its list.
    onsent: (message: JournalEntry) => void;
  }
  let { incidentId, drill = false, register, onsent }: Props = $props();

  const TRANSPORTS: readonly Transport[] = ["mesh", "phone", "courier", "verbal"];

  let counterpartyId = $state("");
  let transport: Transport = $state("mesh");
  let body = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);
  // The incoming message the next send answers, or null when it answers nothing.
  let replying: JournalEntry | null = $state(null);

  let form: HTMLFormElement | undefined = $state(undefined);
  let textField: HTMLTextAreaElement | undefined = $state(undefined);

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

  const preview = $derived(previewText(last, body, drill));
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

  function focusText() {
    form?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    textField?.focus();
  }

  // N: the cursor goes to the message text, from anywhere on the screen.
  $effect(() =>
    onShortcut("newMessage", () => {
      focusText();
      return true;
    }),
  );

  // Answer an incoming message: its sender becomes the recipient, its transport the transport
  // (a courier note is answered by courier unless the operator changes it), the text field
  // gets the cursor and the form comes into view. The incoming entry's register entry has to
  // be in the register the form shows; it always is, since the inbox creates one for every
  // sender (P0-06) and the manual form picks from the register.
  export async function replyTo(entry: JournalEntry): Promise<void> {
    if (entry.type !== "message_in" || entry.counterpartyId === undefined) {
      return;
    }
    counterpartyId = entry.counterpartyId;
    if (entry.transport !== undefined) {
      transport = entry.transport;
    }
    replying = entry;
    error = null;
    await tick();
    focusText();
  }

  function dropReply() {
    replying = null;
  }

  async function send() {
    if (!canSend) {
      return;
    }
    busy = true;
    error = null;
    try {
      const { message } = await composeMessage({
        incidentId,
        counterpartyId,
        transport,
        body,
        refersTo: replying?.id,
      });
      body = "";
      replying = null;
      await loadLast(counterpartyId);
      onsent(message);
    } catch (failure) {
      error = t("send.composeFailed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      busy = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await send();
  }

  // Esc drops the reply link (and nothing else: the fields keep what they have); Ctrl+Enter
  // sends. Both only while the focus is inside this form. preventDefault tells the window
  // listener (lib/shortcutDispatch.ts) the key was taken.
  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && replying !== null) {
      event.preventDefault();
      dropReply();
      return;
    }
    if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      void send();
    }
  }
</script>

<!-- The keys are the form's, not one field's: Esc drops the reply link and Ctrl+Enter sends
     wherever in the form the focus is (the text, the recipient, the ✕). -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="compose" bind:this={form} onsubmit={submit} {onkeydown}>
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

  {#if replying !== null}
    <div class="replying" role="status" data-replying-to={replying.id}>
      <small>{t("send.replyingTo", { text: replySnippet(replying.text ?? "") })}</small>
      <button
        type="button"
        class="drop"
        aria-label={t("send.dropReply")}
        title={t("send.dropReply")}
        onclick={dropReply}>✕</button
      >
    </div>
  {/if}

  <div class="field">
    <label for="send-text">{t("send.text")}</label>
    <textarea
      id="send-text"
      rows="3"
      bind:this={textField}
      bind:value={body}
      aria-invalid={preview.tooLong}
    ></textarea>
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
    <small>{t("send.shortcut")}</small>
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

  .replying {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.6rem;
    border-left: 4px solid var(--navy);
    background: var(--surface-in);
    border-radius: 4px;
  }

  .replying small {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
  }

  .drop {
    min-width: 2.5rem;
    padding: 0 0.4rem;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.4;
    cursor: pointer;
  }

  .drop:hover,
  .drop:focus-visible {
    color: var(--ink);
  }
</style>
