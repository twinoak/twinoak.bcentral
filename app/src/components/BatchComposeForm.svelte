<script lang="ts">
  // Compose one text for many recipients (P0-08): pick them (all / by street / by hand),
  // type the text with the byte counter computed for the longest "#n " prefix among the
  // chosen, and send. On send one message_out per recipient is stored, all before any is
  // transmitted, and the batch is handed to the send queue.
  import { t, language } from "../i18n/index.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
  import { composeBatch, lastSeqNos } from "../store/index.ts";
  import { BatchComposeError, MAX_MESSAGE_BYTES, batchPreview } from "../store/outgoing.ts";
  import type { JournalEntry, RegisterEntry } from "../store/types.ts";
  import { radio } from "../radio/index.ts";

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
  let street = $state("");
  let body = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);

  const chosenIds = $derived(
    register.filter((entry) => chosen[entry.id] === true).map((entry) => entry.id),
  );

  const streets = $derived.by(() => {
    const collator = new Intl.Collator(language(), { numeric: true, sensitivity: "base" });
    const distinct = new Set<string>();
    for (const entry of register) {
      if (entry.street !== undefined && entry.street.trim() !== "") {
        distinct.add(entry.street.trim());
      }
    }
    return [...distinct].sort((a, b) => collator.compare(a, b));
  });

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

  function chooseAll() {
    const next: Record<string, boolean> = {};
    for (const entry of register) {
      next[entry.id] = true;
    }
    chosen = next;
    street = "";
  }

  function chooseNone() {
    chosen = {};
    street = "";
  }

  // Exactly the entries of that street, replacing the choice so far.
  function chooseStreet(name: string) {
    street = name;
    if (name === "") {
      return;
    }
    const next: Record<string, boolean> = {};
    for (const entry of register) {
      if (entry.street !== undefined && entry.street.trim() === name) {
        next[entry.id] = true;
      }
    }
    chosen = next;
  }

  function toggle(id: string, on: boolean) {
    chosen[id] = on;
    street = "";
  }

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
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
</script>

<form class="compose" onsubmit={submit}>
  {#if !hasOperatorName()}
    <p class="error" role="alert">{t("send.noOperator")}</p>
  {/if}

  <fieldset class="recipients">
    <legend
      >{t("queue.compose.recipients", { chosen: chosenIds.length, total: register.length })}</legend
    >
    {#if register.length === 0}
      <small class="error">{t("send.recipient.none")}</small>
    {:else}
      <div class="pick">
        <button type="button" class="secondary small" onclick={chooseAll}>
          {t("queue.compose.all")}
        </button>
        <button type="button" class="secondary small" onclick={chooseNone}>
          {t("queue.compose.none")}
        </button>
        <label class="street">
          {t("queue.compose.byStreet")}
          <select
            value={street}
            disabled={streets.length === 0}
            onchange={(event) => chooseStreet(event.currentTarget.value)}
          >
            <option value="">{t("queue.compose.chooseStreet")}</option>
            {#each streets as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
      </div>
      <ul class="list">
        {#each register as entry (entry.id)}
          <li>
            <label>
              <input
                type="checkbox"
                checked={chosen[entry.id] === true}
                onchange={(event) => toggle(entry.id, event.currentTarget.checked)}
              />
              <span class="label">{entry.label}</span>
              {#if entry.street}
                <small class="muted">{entry.street}</small>
              {/if}
              <small class="muted">#{(last.get(entry.id) ?? 0) + 1}</small>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
  </fieldset>

  <div class="field">
    <label for="batch-text">{t("send.text")}</label>
    <textarea id="batch-text" rows="3" bind:value={body} aria-invalid={preview.tooLong}></textarea>
    <div class="meta">
      <small>{t("queue.compose.textHelp", { prefix: preview.prefix })}</small>
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

  {#if !radioReady}
    <p class="error" role="alert">{t("queue.compose.noRadio")}</p>
  {/if}

  <div class="actions">
    <button type="submit" disabled={!canSend}>
      {t("queue.compose.send", { count: chosenIds.length })}
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
  }

  .recipients {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.5rem 0.75rem 0.75rem;
    margin: 0;
    background: var(--surface);
  }

  legend {
    font-weight: 600;
    padding: 0 0.25rem;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .street {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.25rem 1rem;
    max-height: 14rem;
    overflow-y: auto;
  }

  .list label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    cursor: pointer;
  }

  .label {
    font-weight: 600;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field label {
    font-weight: 600;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  small,
  .muted {
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
