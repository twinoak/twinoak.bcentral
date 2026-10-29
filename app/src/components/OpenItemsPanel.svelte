<script lang="ts">
  // Open items (P0-07): per register entry, every outgoing message not yet roger, with the
  // given-up ones flagged. Clicking one scrolls the timeline to it.
  import { t, language } from "../i18n/index.svelte.ts";
  import type { OpenItem } from "../store/journalView.ts";

  interface Props {
    groups: ReadonlyMap<string, OpenItem[]>;
    labels: ReadonlyMap<string, string>;
    onselect: (entryId: string) => void;
  }
  let { groups, labels, onselect }: Props = $props();

  const sortedGroups = $derived.by(() => {
    const collator = new Intl.Collator(language(), { numeric: true, sensitivity: "base" });
    return [...groups.entries()]
      .map(([counterpartyId, items]) => ({
        counterpartyId,
        label: labels.get(counterpartyId) ?? "",
        items,
      }))
      .sort(
        (a, b) =>
          collator.compare(a.label, b.label) || a.counterpartyId.localeCompare(b.counterpartyId),
      );
  });

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "short" });
  }
</script>

<section class="panel" aria-labelledby="open-heading">
  <h2 id="open-heading">{t("journal.open.title")}</h2>
  {#if sortedGroups.length === 0}
    <p class="muted">{t("journal.open.empty")}</p>
  {:else}
    {#each sortedGroups as group (group.counterpartyId)}
      <h3>{group.label}</h3>
      <ul>
        {#each group.items as item (item.message.id)}
          <li>
            <button
              type="button"
              class="item"
              class:givenUp={item.givenUp}
              onclick={() => onselect(item.message.id)}
            >
              <span class="time">{formatTime(item.message.timestamp)}</span>
              <span class="text">{item.message.text ?? ""}</span>
              <span class="chip" data-status={item.status}
                >{t(`journal.status.${item.status}`)}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</section>

<style>
  .panel {
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }

  h3 {
    font-size: 0.95rem;
    margin: 0.75rem 0 0.25rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li + li {
    margin-top: 0.25rem;
  }

  .muted {
    color: var(--muted);
    margin: 0;
  }

  .item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--light);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  .item.givenUp {
    border-color: var(--error);
  }

  .time {
    color: var(--muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    background: #fff;
    color: var(--muted);
  }

  .chip[data-status="sent"] {
    color: var(--navy);
  }

  .chip[data-status="delivered"] {
    color: var(--ok);
  }

  .chip[data-status="given_up"] {
    color: var(--error);
  }
</style>
