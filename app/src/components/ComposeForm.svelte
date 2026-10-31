<script lang="ts">
  // Compose one outgoing message (P0-05): recipient, transport, text. Shows the predicted
  // "#n " prefix and the byte count against the 160-byte limit; Send is disabled over it.
  // On send the message is stored with its reserved #n; a mesh message is then handed to
  // the outbox, whose progress the parent shows.
  //
  // Reply from the row (P1-02): the parent calls replyTo(entry) with an incoming message; the
  // form takes the recipient and transport from it, focuses the text, scrolls itself into
  // view and shows "Replying to: …" as an inline message with a ✕ that drops the link. The
  // message is then stored with refersTo = the incoming entry's id. Keys inside the form:
  // Esc drops the link, Ctrl+Enter sends. The N shortcut (P1-09) puts the cursor in the
  // text from anywhere; `onreveal` lets the parent show the form first (it sits under a tab
  // in the journal's compose card, P2-03).
  //
  // One line of fields (via, recipient, the text that grows as it is typed, Send) and a
  // 14 px meta line under it: the compose card sits above the journal's rows, and the rows
  // are what the screen is for. The look is components.css's `.field` / `.btn` / `.msg`;
  // this file lays nothing out of its own but the line.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import type { JournalEntry, RegisterEntry, Transport } from "../store/types.ts";
  import { composeMessage, lastSeqNo } from "../store/index.ts";
  import { MAX_MESSAGE_BYTES, previewText, replySnippet } from "../store/outgoing.ts";
  import { radio } from "../radio/index.ts";
  import Icon from "./Icon.svelte";

  interface Props {
    incidentId: string;
    // True in a drill incident (P1-05): the shown prefix and the byte counter carry the
    // ØVELSE prefix the store will put in front of the text.
    drill?: boolean;
    // The register, sorted as the parent wants it shown.
    register: readonly RegisterEntry[];
    // Called with the stored message_out; the parent sends mesh messages and reloads its list.
    onsent: (message: JournalEntry) => void;
    // Called before the form takes the focus (N, a reply): the parent brings it into view —
    // the journal switches to its tab.
    onreveal?: () => void;
  }
  let { incidentId, drill = false, register, onsent, onreveal }: Props = $props();

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

  async function focusText() {
    onreveal?.();
    await tick();
    form?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    textField?.focus();
  }

  // N: the cursor goes to the message text, from anywhere on the screen.
  $effect(() =>
    onShortcut("newMessage", () => {
      void focusText();
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
    await focusText();
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
    <p class="msg msg-warn" role="alert"><Icon name="warning" />{t("send.noOperator")}</p>
  {/if}

  {#if replying !== null}
    <p class="msg replying" role="status" data-replying-to={replying.id}>
      <Icon name="reply" />
      <span class="replying-text"
        >{t("send.replyingTo", { text: replySnippet(replying.text ?? "") })}</span
      >
      <button
        type="button"
        class="btn btn-quiet btn-icon drop"
        aria-label={t("send.dropReply")}
        title={t("send.dropReply")}
        onclick={dropReply}><Icon name="close" /></button
      >
    </p>
  {/if}

  <div class="line">
    <div class="field via">
      <label for="send-transport">{t("send.transport")}</label>
      <select id="send-transport" bind:value={transport}>
        {#each TRANSPORTS as option (option)}
          <option value={option}>{t(`send.transport.${option}`)}</option>
        {/each}
      </select>
    </div>

    <div class="field recipient">
      <label for="send-recipient">{t("send.recipient")}</label>
      <select id="send-recipient" bind:value={counterpartyId} disabled={register.length === 0}>
        <option value="">{t("send.recipient.choose")}</option>
        {#each register as entry (entry.id)}
          <option value={entry.id}>{entry.label}</option>
        {/each}
      </select>
    </div>

    <div class="field field-grow text">
      <label for="send-text">{t("send.text")}</label>
      <textarea
        id="send-text"
        rows="1"
        bind:this={textField}
        bind:value={body}
        aria-invalid={preview.tooLong}
        aria-describedby="send-meta"
      ></textarea>
    </div>

    <button type="submit" class="btn btn-primary" disabled={!canSend}>
      <Icon name="send" />{transport === "mesh" ? t("send.send") : t("send.record")}
    </button>
  </div>

  <!-- The meta line: the prefix the message goes out with, the byte counter, the key. -->
  <div class="meta field-help" id="send-meta">
    <span>{t("send.textHelp", { prefix: preview.prefix })}</span>
    <span class="counter" class:field-error={preview.tooLong} role="status">
      {t("send.bytes", { bytes: preview.bytes, max: MAX_MESSAGE_BYTES })}
    </span>
    <span>{t("send.shortcut")}</span>
  </div>

  {#if preview.tooLong}
    <p class="field-error" role="alert">
      <Icon name="warning" />{t("send.tooLong", { bytes: preview.bytes, max: MAX_MESSAGE_BYTES })}
    </p>
  {/if}
  {#if register.length === 0}
    <p class="msg msg-warn"><Icon name="warning" />{t("send.recipient.none")}</p>
  {/if}
  {#if radioBlocks}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{t("send.noRadio")}</p>
  {/if}
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only. */
  .compose {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--s-3);
  }

  .via {
    flex: 0 1 10rem;
  }

  .recipient {
    flex: 0 1 14rem;
  }

  .text {
    flex: 1 1 18rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-4);
    margin: 0;
  }

  .counter {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .replying {
    align-items: center;
  }

  .replying-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drop {
    width: 1.75rem;
    min-height: 1.75rem;
  }

  p {
    margin: 0;
  }
</style>
