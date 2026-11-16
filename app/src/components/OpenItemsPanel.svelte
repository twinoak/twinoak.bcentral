<script lang="ts">
  // Open items (P0-07): per register entry, every radio message not yet roger, with the
  // given-up ones flagged (a message by phone, courier or verbal has no status and is never
  // here, P3-07). Newest first (P1-01): the groups in the order of their newest
  // item, as openItems() hands them over, and the items within a group newest first.
  // A card with the count in its title (P2-03); each group a row list in 14 / 16 px, each row
  // a button that scrolls the timeline to the message. The text is the message's current
  // one (its latest correction's when corrected, P3-02), as openItems() hands it over, and
  // the status is the journal's three slots (P3-03, StatusSlots.svelte), packed: the card is
  // 320 px wide and the slots' tooltips say what the journal's header labels say. While the
  // send queue is paused for lack of a radio, one help line under the title says how many
  // of these items wait in it and that a message can be confirmed or given up by hand from
  // its row (P3-08). Directly on each row the staff may close (P3-09): a quiet Close on a
  // line under the row — as the Points card's Close, since a button cannot sit inside the
  // jump button — opens the one field "Note (optional)" with Close and Cancel in its place;
  // Close without typing closes at once and the item leaves the card, recorded as closed by
  // the staff, not as confirmed. The parent says which items may be closed (an unconfirmed
  // message the radio handed over or gave up on, not one it is transmitting).
  import { t, language } from "../i18n/index.svelte.ts";
  import type { OpenItem } from "../store/journalView.ts";
  import type { JournalEntry } from "../store/types.ts";
  import Icon from "./Icon.svelte";
  import StatusSlots from "./StatusSlots.svelte";

  interface Props {
    groups: ReadonlyMap<string, OpenItem[]>;
    labels: ReadonlyMap<string, string>;
    // How many of the items wait in the paused send queue; 0 while the queue is not paused.
    pausedCount?: number;
    onselect: (entryId: string) => void;
    // Whether the item offers Close (P3-09): the page's rule over the status and the radio.
    canClose?: (item: OpenItem) => boolean;
    // Close with the note typed on the row, empty allowed.
    onclose?: (message: JournalEntry, note: string) => Promise<void>;
  }
  let {
    groups,
    labels,
    pausedCount = 0,
    onselect,
    canClose = () => false,
    onclose,
  }: Props = $props();

  // The item whose Close form is open, and the note typed in it.
  let closing: string | null = $state(null);
  let note = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);

  const sortedGroups = $derived(
    [...groups.entries()].map(([counterpartyId, items]) => ({
      counterpartyId,
      label: labels.get(counterpartyId) ?? "",
      items,
    })),
  );
  const count = $derived(sortedGroups.reduce((n, group) => n + group.items.length, 0));

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "short" });
  }

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function startClose(item: OpenItem) {
    closing = item.message.id;
    note = "";
    error = null;
  }

  function cancelClose() {
    closing = null;
    note = "";
    error = null;
  }

  async function close(item: OpenItem, event: SubmitEvent) {
    event.preventDefault();
    if (busy || onclose === undefined) {
      return;
    }
    busy = true;
    error = null;
    try {
      await onclose(item.message, note);
      closing = null;
      note = "";
    } catch (failure) {
      error = t("journal.close.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" aria-labelledby="open-heading" data-open-items>
  <h2 id="open-heading" class="card-title">
    {t("journal.open.title")}
    <span class="count">{count}</span>
  </h2>
  {#if pausedCount > 0}
    <p class="msg msg-warn help" role="status" data-paused={pausedCount}>
      {t("journal.open.paused", { n: pausedCount })}
    </p>
  {/if}
  {#if sortedGroups.length === 0}
    <p class="msg">{t("journal.open.empty")}</p>
  {:else}
    {#each sortedGroups as group (group.counterpartyId)}
      <h3>{group.label}</h3>
      <ol class="rows rows-3">
        {#each group.items as item (item.message.id)}
          <li data-status={item.status}>
            <button type="button" class="row-button" onclick={() => onselect(item.message.id)}>
              <span class="row-time">{formatTime(item.message.timestamp)}</span>
              <span class="row-body text">{item.text}</span>
              <StatusSlots strip={item.strip} />
            </button>
            {#if closing === item.message.id}
              <form class="row-form" data-close-form onsubmit={(event) => close(item, event)}>
                <div class="field">
                  <input
                    type="text"
                    placeholder={t("journal.close.note")}
                    aria-label={t("journal.close.note")}
                    bind:value={note}
                  />
                </div>
                <button type="submit" class="btn btn-primary" disabled={busy}>
                  {t("journal.action.close")}
                </button>
                <button type="button" class="btn" onclick={cancelClose}>
                  {t("journal.action.cancel")}
                </button>
                {#if error}
                  <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
                {/if}
              </form>
            {:else if canClose(item)}
              <span class="row-actions">
                <button
                  type="button"
                  class="btn btn-quiet"
                  data-action="close"
                  title={t("journal.close.help")}
                  disabled={busy}
                  onclick={() => startClose(item)}
                >
                  {t("journal.action.close")}
                </button>
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    {/each}
  {/if}
</section>

<style>
  /* Layout only. */
  h3 {
    margin: var(--s-3) 0 var(--s-1);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .msg {
    margin: 0;
  }

  .help {
    margin-bottom: var(--s-2);
  }
</style>
