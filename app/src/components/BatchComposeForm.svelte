<script lang="ts">
  // Compose one text for many recipients (P0-08; on the components in P2-04): pick them in
  // a checklist table grouped by street (a street's own checkbox takes the whole street, All
  // and None take the register), type the text with the byte counter computed for the
  // longest "#n " prefix among the chosen, and send. On send one message_out per recipient
  // is stored, all before any is transmitted, and the batch is handed to the send queue.
  // Ctrl+Enter sends from anywhere in the form, as in the journal's compose form. The look
  // is components.css's `.field` / `.table` / `.btn` / `.msg`; this file lays out the two
  // columns and nothing else.
  import { t, language } from "../i18n/index.svelte.ts";
  import { groupByStreet, groupChoice } from "../lib/recipientGroups.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { composeBatch, lastSeqNos } from "../store/index.ts";
  import { BatchComposeError, MAX_MESSAGE_BYTES, batchPreview } from "../store/outgoing.ts";
  import type { JournalEntry, RegisterEntry } from "../store/types.ts";
  import { radio } from "../radio/index.ts";
  import Icon from "./Icon.svelte";

  interface Props {
    incidentId: string;
    // True in a drill incident (P1-05): the shown prefix and the byte counter carry the
    // ØVELSE prefix the store will put in front of every recipient's text.
    drill?: boolean;
    // The register, sorted as the parent wants it shown.
    register: readonly RegisterEntry[];
    // Called with the stored messages, in recipient order; the parent queues them. Called
    // with what was stored even when composing stopped part-way (the error is shown here).
    onstored: (messages: JournalEntry[]) => void;
  }
  let { incidentId, drill = false, register, onstored }: Props = $props();

  // Which register entries are chosen, by id. A plain object so Svelte tracks the keys.
  let chosen: Record<string, boolean> = $state({});
  let body = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);

  const chosenIds = $derived(
    register.filter((entry) => chosen[entry.id] === true).map((entry) => entry.id),
  );
  const groups = $derived(groupByStreet(register, language()));

  // Every recipient's last #n, re-read whenever the register changes or a batch was stored,
  // so the shown prefix is the one that will be reserved.
  let last: Map<string, number> = $state.raw(new Map());
  let lastLoadedFor: readonly RegisterEntry[] | null = $state.raw(null);
  async function loadLast(entries: readonly RegisterEntry[]) {
    const loaded = await lastSeqNos(entries.map((entry) => entry.id));
    if (register === entries) {
      last = loaded;
      lastLoadedFor = entries;
    }
  }
  $effect(() => {
    void loadLast(register);
  });

  const preview = $derived(
    batchPreview(
      chosenIds.map((id) => last.get(id) ?? 0),
      body,
      drill,
    ),
  );
  const radioReady = $derived(radio.state() === "connected" || radio.state() === "blind");
  const canSend = $derived(
    hasOperatorName() &&
      chosenIds.length > 0 &&
      lastLoadedFor === register &&
      !preview.empty &&
      !preview.tooLong &&
      radioReady &&
      !busy,
  );

  function isChosen(id: string): boolean {
    return chosen[id] === true;
  }

  function chooseAll() {
    const next: Record<string, boolean> = {};
    for (const entry of register) {
      next[entry.id] = true;
    }
    chosen = next;
  }

  function chooseNone() {
    chosen = {};
  }

  function toggle(id: string, on: boolean) {
    chosen[id] = on;
  }

  // A street's checkbox: every entry of the street on or off, the rest untouched.
  function toggleGroup(entries: readonly RegisterEntry[], on: boolean) {
    for (const entry of entries) {
      chosen[entry.id] = on;
    }
  }

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function send() {
    if (!canSend) {
      return;
    }
    busy = true;
    error = null;
    try {
      const composed = await composeBatch({ incidentId, counterpartyIds: chosenIds, body });
      body = "";
      onstored(composed.map((c) => c.message));
    } catch (failure) {
      if (failure instanceof BatchComposeError) {
        // What was stored before the failure is real; it goes to the queue like the rest.
        error = t("queue.compose.partial", {
          stored: failure.stored.length,
          chosen: chosenIds.length,
          error: describe(failure.cause),
        });
        if (failure.stored.length > 0) {
          onstored(failure.stored.map((c) => c.message));
        }
      } else {
        error = t("send.composeFailed", { error: describe(failure) });
      }
    } finally {
      busy = false;
      await loadLast(register);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await send();
  }

  // Ctrl+Enter sends, wherever in the form the focus is; preventDefault tells the window
  // listener (lib/shortcutDispatch.ts) the key was taken.
  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      void send();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="compose" onsubmit={submit} {onkeydown}>
  {#if !hasOperatorName()}
    <p class="msg msg-warn" role="alert"><Icon name="warning" />{t("send.noOperator")}</p>
  {/if}

  <div class="columns">
    <!-- The recipients: a checklist table grouped by street. -->
    <div class="field recipients">
      <span class="field-label" id="batch-recipients-label"
        >{t("queue.compose.recipients", { chosen: chosenIds.length, total: register.length })}</span
      >
      {#if register.length === 0}
        <p class="msg msg-warn"><Icon name="warning" />{t("send.recipient.none")}</p>
      {:else}
        <div class="toolbar">
          <button type="button" class="btn btn-compact" onclick={chooseAll}>
            {t("queue.compose.all")}
          </button>
          <button type="button" class="btn btn-compact" onclick={chooseNone}>
            {t("queue.compose.none")}
          </button>
        </div>
        <div class="table-box picker" role="group" aria-labelledby="batch-recipients-label">
          <table class="table">
            <thead>
              <tr>
                <th class="pick" scope="col"
                  ><span class="visually-hidden">{t("queue.compose.pickColumn")}</span></th
                >
                <th scope="col">{t("register.field.label")}</th>
                <th scope="col">{t("register.field.person")}</th>
                <th scope="col" class="num">{t("queue.item.seqNo")}</th>
              </tr>
            </thead>
            {#each groups as group (group.street ?? "")}
              {@const choice = groupChoice(group.entries, isChosen)}
              {@const streetName = group.street ?? t("queue.compose.noStreet")}
              <tbody>
                <tr>
                  <th class="pick" scope="rowgroup">
                    <input
                      type="checkbox"
                      checked={choice === "all"}
                      indeterminate={choice === "some"}
                      aria-label={t("queue.compose.streetAll", { street: streetName })}
                      onchange={(event) => toggleGroup(group.entries, event.currentTarget.checked)}
                    />
                  </th>
                  <th scope="rowgroup" colspan="3">{streetName}</th>
                </tr>
                {#each group.entries as entry (entry.id)}
                  <tr aria-selected={isChosen(entry.id)}>
                    <td class="pick">
                      <input
                        id="batch-pick-{entry.id}"
                        type="checkbox"
                        checked={isChosen(entry.id)}
                        onchange={(event) => toggle(entry.id, event.currentTarget.checked)}
                      />
                    </td>
                    <td
                      ><label class="pick-label" for="batch-pick-{entry.id}">{entry.label}</label
                      ></td
                    >
                    <td>{entry.person ?? ""}</td>
                    <td class="num">#{(last.get(entry.id) ?? 0) + 1}</td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
      {/if}
    </div>

    <!-- The text, its meta line and Send. -->
    <div class="message">
      <div class="field field-grow">
        <label for="batch-text">{t("send.text")}</label>
        <textarea
          id="batch-text"
          rows="2"
          bind:value={body}
          aria-invalid={preview.tooLong}
          aria-describedby="batch-meta"
        ></textarea>
      </div>
      <div class="meta field-help" id="batch-meta">
        <span>{t("queue.compose.textHelp", { prefix: preview.prefix })}</span>
        <span class="counter" class:field-error={preview.tooLong} role="status">
          {t("send.bytes", { bytes: preview.bytes, max: MAX_MESSAGE_BYTES })}
        </span>
        <span>{t("send.shortcut")}</span>
      </div>
      {#if preview.tooLong}
        <p class="field-error" role="alert">
          <Icon name="warning" />{t("send.tooLong", {
            bytes: preview.bytes,
            max: MAX_MESSAGE_BYTES,
          })}
        </p>
      {/if}
      {#if !radioReady}
        <p class="msg msg-danger" role="alert">
          <Icon name="warning" />{t("queue.compose.noRadio")}
        </p>
      {/if}
      {#if error}
        <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
      {/if}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled={!canSend}>
          <Icon name="send" />{t("queue.compose.send", { count: chosenIds.length })}
        </button>
      </div>
    </div>
  </div>
</form>

<style>
  /* Layout only: the recipients at the left, the text at the right; one column under 60 rem.
     The checklist scrolls in its box so the card keeps a fixed height. */
  .compose {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-4) var(--s-5);
    align-items: start;
  }

  .picker {
    max-height: 13rem;
  }

  .pick-label {
    display: block;
    cursor: pointer;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
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

  .form-actions {
    justify-content: flex-end;
  }

  p {
    margin: 0;
  }

  @media (max-width: 60rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
