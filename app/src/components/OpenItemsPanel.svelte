<script lang="ts">
  // Open items (P0-07): per register entry, every outgoing message not yet roger, with the
  // given-up ones flagged. Newest first (P1-01): the groups in the order of their newest
  // item, as openItems() hands them over, and the items within a group newest first.
  // A card with the count in its title (P2-03); each group a row list in 14 / 16 px, each row
  // a button that scrolls the timeline to the message.
  import { t, language } from "../i18n/index.svelte.ts";
  import { chipClass, statusChip } from "../lib/journalRows.ts";
  import type { OpenItem } from "../store/journalView.ts";

  interface Props {
    groups: ReadonlyMap<string, OpenItem[]>;
    labels: ReadonlyMap<string, string>;
    onselect: (entryId: string) => void;
  }
  let { groups, labels, onselect }: Props = $props();

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
</script>

<section class="card" aria-labelledby="open-heading" data-open-items>
  <h2 id="open-heading" class="card-title">
    {t("journal.open.title")}
    <span class="count">{count}</span>
  </h2>
  {#if sortedGroups.length === 0}
    <p class="msg">{t("journal.open.empty")}</p>
  {:else}
    {#each sortedGroups as group (group.counterpartyId)}
      <h3>{group.label}</h3>
      <ol class="rows rows-3">
        {#each group.items as item (item.message.id)}
          {@const look = statusChip(item.status)}
          <li>
            <button type="button" class="row-button" onclick={() => onselect(item.message.id)}>
              <span class="row-time">{formatTime(item.message.timestamp)}</span>
              <span class="row-body text">{item.message.text ?? ""}</span>
              <span class="row-strip chip {chipClass(look.tint)}">
                <span class="chip-dot" class:chip-dot-outline={look.dot === "outline"}></span>{t(
                  `journal.status.${item.status}`,
                )}
              </span>
            </button>
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
</style>
