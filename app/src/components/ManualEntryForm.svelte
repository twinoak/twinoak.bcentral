<script lang="ts">
  // The New record tab (P3-01; P0-07's manual-entry form): everything the operator writes
  // into the journal by hand. A Type select with three kinds — a note; an incoming message
  // (a phone call, a courier's note, something said across the room); an outgoing message
  // on a non-radio transport — and for the two message kinds the other end (From / To) and
  // Via with phone, courier and verbal only: the radio is the MeshCore tab (ComposeForm).
  // The other end is any contact in the register, with a radio or without (P3-06): a caller
  // without a radio is recorded here, and only here.
  // An outgoing record is a plain record (P3-07): the text as typed, no number, no status —
  // the call was the delivery; what needs following up gets a point from the row. No byte
  // counter and no #n preview: nothing of the radio's applies here, and the one button says
  // "Add to journal" for all three kinds.
  //
  // Prefilled by the parent (lib/composePrefill.ts): Reply on an incoming message by phone,
  // courier or verbal opens this tab as an outgoing message on the same transport to the
  // sender, with "Replying to: …" as an inline message and a ✕ that drops the link (the
  // record is stored with refersTo = the incoming entry's id); "Send by courier" on a
  // given-up radio message (P1-08) opens it as an outgoing courier message with the
  // original's text, and adding it opens a point on the record and closes the original
  // (store/handover.ts). Keys (P1-09): A from anywhere puts the cursor in the text
  // (`onreveal` lets the parent show the form first — it sits under a tab in the journal's
  // compose card, P2-03); Esc drops the reply link; Ctrl+Enter inside the form adds the
  // entry. One line of fields and a 14 px meta line, like the MeshCore form; the look is
  // components.css's.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import type { RecordPrefill } from "../lib/composePrefill.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import { sendActions } from "../radio/index.ts";
  import { recordByHand } from "../store/index.ts";
  import { NON_MESH_TRANSPORTS } from "../store/manual.ts";
  import { RECORD_TYPES, type RecordType } from "../store/record.ts";
  import { replySnippet } from "../store/outgoing.ts";
  import type { JournalEntry, RegisterEntry, Transport } from "../store/types.ts";
  import Icon from "./Icon.svelte";

  // What one Add to journal stored: the entry, and the status_change that closed a given-up
  // radio message when the record replaced it ("send by courier"; the point opened on the
  // record then is the journal's to show), else null.
  export interface Recorded {
    entry: JournalEntry;
    closed: JournalEntry | null;
  }

  interface Props {
    incidentId: string;
    register: readonly RegisterEntry[];
    // Called after the entry is stored; the parent reloads.
    onadded: (recorded: Recorded) => Promise<void>;
    // Called before the form takes the focus (A, a prefill): the parent brings it into view.
    onreveal?: () => void;
  }
  let { incidentId, register, onadded, onreveal }: Props = $props();

  let kind: RecordType = $state("note");
  let counterpartyId = $state("");
  let transport: Transport = $state("phone");
  let text = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);
  // The incoming message an outgoing record answers, or null when it answers nothing.
  let replying: JournalEntry | null = $state(null);
  // The given-up message an outgoing record replaces, closed once it is recorded; or null.
  let closes: JournalEntry | null = $state(null);

  let form: HTMLFormElement | undefined = $state(undefined);
  let textField: HTMLTextAreaElement | undefined = $state(undefined);

  const isMessage = $derived(kind !== "note");
  const canAdd = $derived(
    hasOperatorName() && !busy && text.trim() !== "" && (!isMessage || counterpartyId !== ""),
  );

  async function focusText() {
    error = null;
    onreveal?.();
    await tick();
    form?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    textField?.focus();
  }

  // A: the cursor in the text, from anywhere on the screen; the type stays as chosen.
  $effect(() =>
    onShortcut("addNote", () => {
      void focusText();
      return true;
    }),
  );

  // A reply or a courier resend: the fields as the action decided them, the text field
  // with the cursor, the form in view.
  export async function prefill(intent: RecordPrefill): Promise<void> {
    kind = intent.type;
    counterpartyId = intent.counterpartyId;
    transport = intent.transport;
    text = intent.text;
    replying = intent.replyTo;
    closes = intent.closes;
    await focusText();
  }

  function dropReply() {
    replying = null;
  }

  // Changing the type away from an outgoing message drops what only it carries.
  $effect(() => {
    if (kind !== "message_out") {
      replying = null;
      closes = null;
    }
  });

  async function add() {
    if (!canAdd) {
      return;
    }
    busy = true;
    error = null;
    try {
      let recorded: Recorded;
      if (kind === "message_out" && closes !== null) {
        const { copy, closed } = await sendActions.resendByHand(closes, { transport, body: text });
        recorded = { entry: copy, closed };
      } else {
        const entry = await recordByHand({
          incidentId,
          type: kind,
          counterpartyId,
          transport,
          text,
          refersTo: kind === "message_out" ? replying?.id : undefined,
        });
        recorded = { entry, closed: null };
      }
      text = "";
      replying = null;
      closes = null;
      await onadded(recorded);
    } catch (failure) {
      error = t("journal.add.failed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      busy = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await add();
  }

  // Esc drops the reply link (and nothing else); Ctrl+Enter records, wherever in the form
  // the focus is. preventDefault tells the window listener the key was taken.
  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && replying !== null) {
      event.preventDefault();
      dropReply();
      return;
    }
    if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      void add();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="manual" bind:this={form} onsubmit={submit} {onkeydown}>
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

  {#if closes !== null}
    <p class="msg" role="status" data-closes={closes.id}>
      <Icon name="send" />{t("journal.add.resend", { n: closes.seqNo ?? 0 })}
    </p>
  {/if}

  <div class="line">
    <div class="field kind">
      <label for="manual-kind">{t("journal.add.kind")}</label>
      <select id="manual-kind" bind:value={kind}>
        {#each RECORD_TYPES as option (option)}
          <option value={option}>{t(`journal.add.kind.${option}`)}</option>
        {/each}
      </select>
    </div>

    {#if isMessage}
      <div class="field from">
        <label for="manual-counterparty">
          {kind === "message_in" ? t("journal.add.counterparty") : t("journal.add.recipient")}
        </label>
        <select
          id="manual-counterparty"
          bind:value={counterpartyId}
          disabled={register.length === 0}
        >
          <option value="">{t("send.recipient.choose")}</option>
          {#each register as entry (entry.id)}
            <option value={entry.id}>{entry.label}</option>
          {/each}
        </select>
      </div>

      <div class="field via">
        <label for="manual-transport">{t("send.transport")}</label>
        <select id="manual-transport" bind:value={transport}>
          {#each NON_MESH_TRANSPORTS as option (option)}
            <option value={option}>{t(`send.transport.${option}`)}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="field field-grow text">
      <label for="manual-text">{t("journal.add.text")}</label>
      <textarea id="manual-text" rows="1" bind:this={textField} bind:value={text}></textarea>
    </div>

    <button type="submit" class="btn btn-primary" disabled={!canAdd}>{t("journal.add.save")}</button
    >
  </div>

  <div class="meta field-help">
    <span>{t("journal.add.shortcut")}</span>
  </div>

  {#if isMessage && register.length === 0}
    <p class="msg msg-warn"><Icon name="warning" />{t("send.recipient.none")}</p>
  {/if}
  {#if error}
    <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
  {/if}
</form>

<style>
  /* Layout only. */
  .manual {
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

  /* Four fields and the button on one line at 1280 px, where the card's inside is 837 px:
     12 + 12 + 7.5 + 10 rem, three gaps and Record are 820 px; the text takes what is left
     and grows in rows as it is typed. The selects' widths hold their longest option. */
  .kind {
    flex: 0 1 12rem;
  }

  .from {
    flex: 0 1 12rem;
  }

  .via {
    flex: 0 1 7.5rem;
  }

  .text {
    flex: 1 1 10rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-4);
    margin: 0;
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
