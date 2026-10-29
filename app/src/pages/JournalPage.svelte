<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { exportJournal } from "../store/index.ts";

  // Placeholder until P0-07: only the export is reachable here.
  let busy = $state(false);
  let message: string | null = $state(null);
  let failed = $state(false);

  async function onExport() {
    busy = true;
    failed = false;
    message = null;
    try {
      const filename = await exportJournal();
      message = t("journal.exported", { filename });
    } catch (error) {
      failed = true;
      message = t("journal.exportFailed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
    }
  }
</script>

<h1>{t("journal.title")}</h1>
<p>{t("journal.placeholder")}</p>

<div class="actions">
  <button type="button" onclick={onExport} disabled={busy}>{t("journal.export")}</button>
  {#if message}
    <span class:error={failed} role="status">{message}</span>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .error {
    color: var(--error);
  }
</style>
