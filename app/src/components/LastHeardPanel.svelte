<script lang="ts">
  // "Last heard from" (P0-07): every register entry with the time since its latest incoming
  // message, the quiet ones on top. The elapsed time ticks once a second. Counted over the
  // whole journal, drills included (P1-05): the register is shared, and a message in a drill
  // is real radio contact; the heading's tooltip says so.
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

<section class="panel" aria-labelledby="heard-heading">
  <h2 id="heard-heading" title={t("journal.heard.help")}>{t("journal.heard.title")}</h2>
  {#if rows.length === 0}
    <p class="muted">{t("journal.heard.empty")}</p>
  {:else}
    <table>
      <tbody>
        {#each rows as row (row.entry.id)}
          <tr class:never={row.at === null}>
            <td class="label">{row.entry.label}</td>
            <td class="when">
              {#if row.at === null}
                {t("journal.heard.never")}
              {:else}
                <span title={formatDateTime(row.at)}>
                  {t("journal.heard.ago", { elapsed: formatElapsed(nowMs - Date.parse(row.at)) })}
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
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

  .muted {
    color: var(--muted);
    margin: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 0.3rem 0.25rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }

  .label {
    font-weight: 600;
  }

  .when {
    text-align: right;
    white-space: nowrap;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  tr.never .when {
    color: var(--error);
    font-weight: 600;
  }
</style>
