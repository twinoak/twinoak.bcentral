<script lang="ts">
  // The drill band (P1-05): a coloured band across the top of every screen while the current
  // incident is a drill, so nobody at the desk mistakes a rehearsal for the real thing. The
  // word ØVELSE is the on-air prefix itself (not translated); the detail names the incident.
  // Not printed: the print view carries its own DRILL line in the journal's header.
  import { t } from "../i18n/index.svelte.ts";
  import type { Incident } from "../store/types.ts";

  interface Props {
    incident: Incident;
  }
  let { incident }: Props = $props();
</script>

<div class="band no-print" role="status" data-drill-band>
  <strong>{t("drill.band")}</strong>
  <span>{t("drill.bandDetail", { name: incident.name })}</span>
</div>

<style>
  .band {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.4rem 1rem;
    background: var(--drill-bg);
    color: var(--ink);
    border-bottom: 3px solid var(--drill-line);
  }

  strong {
    font-size: 1.1rem;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
</style>
