<script lang="ts">
  // Entries the operator types in by hand (P0-07): a note, or a message that came in from the
  // field on a non-mesh transport (phone, courier, verbal). Outgoing messages on any transport
  // go through the compose form; status changes and corrections are row actions in the
  // timeline. Keys (P1-09): A from anywhere puts the cursor in the text with "Note" chosen
  // (`onreveal` lets the parent show the form first — it sits under a tab in the journal's
  // compose card, P2-03); Ctrl+Enter inside the form adds the entry. One line of fields and
  // a 14 px meta line, like the compose form; the look is components.css's.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import { addMessageIn, addNote } from "../store/index.ts";
  import { NON_MESH_TRANSPORTS } from "../store/manual.ts";
  import type { RegisterEntry, Transport } from "../store/types.ts";
  import Icon from "./Icon.svelte";

  interface Props {
    incidentId: string;
    register: readonly RegisterEntry[];
    // Called after the entry is stored; the parent reloads.
    onadded: () => Promise<void>;
    // Called before the form takes the focus (A): the parent brings it into view.
    onreveal?: () => void;
  }
  let { incidentId, register, onadded, onreveal }: Props = $props();

  type Kind = "note" | "message_in";

  let kind: Kind = $state("note");
  let counterpartyId = $state("");
  let transport: Transport = $state("phone");
  let text = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);

  let form: HTMLFormElement | undefined = $state(undefined);
  let textField: HTMLTextAreaElement | undefined = $state(undefined);

  const canAdd = $derived(
    hasOperatorName() && !busy && text.trim() !== "" && (kind === "note" || counterpartyId !== ""),
  );

  // A: a note, the cursor in its text, from anywhere on the screen.
  export async function focusNote(): Promise<void> {
    kind = "note";
    error = null;
    onreveal?.();
    await tick();
    form?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    textField?.focus();
  }

  $effect(() =>
    onShortcut("addNote", () => {
      void focusNote();
      return true;
    }),
  );

  async function add() {
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

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await add();
  }

  // Ctrl+Enter adds, wherever in the form the focus is; preventDefault tells the window
  // listener the key was taken.
  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      void add();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="manual" bind:this={form} onsubmit={submit} {onkeydown}>
  <div class="line">
    <div class="field kind">
      <label for="manual-kind">{t("journal.add.kind")}</label>
      <select id="manual-kind" bind:value={kind}>
        <option value="note">{t("journal.add.kind.note")}</option>
        <option value="message_in">{t("journal.add.kind.message_in")}</option>
      </select>
    </div>

    {#if kind === "message_in"}
      <div class="field from">
        <label for="manual-from">{t("journal.add.counterparty")}</label>
        <select id="manual-from" bind:value={counterpartyId} disabled={register.length === 0}>
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

  {#if kind === "message_in" && register.length === 0}
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

  .kind {
    flex: 0 1 14rem;
  }

  .from {
    flex: 0 1 12rem;
  }

  .via {
    flex: 0 1 8rem;
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

  p {
    margin: 0;
  }
</style>
