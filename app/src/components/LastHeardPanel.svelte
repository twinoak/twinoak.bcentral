<script lang="ts">
  // "Last heard from" (P0-07): every register entry with the time since its latest incoming
  // message, the quiet ones on top. The elapsed time ticks once a second. Counted over the
  // whole journal, drills included (P1-05): the register is shared, and a message in a drill
  // is real radio contact; the heading's tooltip says so. A card with the count of radios in
  // its title and a two-column row list (P2-03); "never" is a danger chip with a glyph, so
  // it tells apart without the colour.
  import { t, language } from "../i18n/index.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import type { LastHeard } from "../store/journalView.ts";

  interface Props {
    rows: readonly LastHeard[];
  }
  let { rows }: Props = $props();

  let nowMs = $state(Date.now());

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  function formatDateTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString(language(), {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
</script>

<section class="card" aria-labelledby="heard-heading" data-last-heard>
  <h2 id="heard-heading" class="card-title" title={t("journal.heard.help")}>
    {t("journal.heard.title")}
    <span class="count">{rows.length}</span>
  </h2>
  {#if rows.length === 0}
    <p class="msg">{t("journal.heard.empty")}</p>
  {:else}
    <ol class="rows rows-2">
      {#each rows as row (row.entry.id)}
        <li data-never={row.at === null ? "true" : undefined}>
          <span class="row-who">{row.entry.label}</span>
          {#if row.at === null}
            <span class="row-strip chip chip-danger"
              ><span class="glyph">!</span>{t("journal.heard.never")}</span
            >
          {:else}
            <span class="row-strip row-time" title={formatDateTime(row.at)}>
              {t("journal.heard.ago", { elapsed: formatElapsed(nowMs - Date.parse(row.at)) })}
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  /* Layout only. */
  .msg {
    margin: 0;
  }
</style>
