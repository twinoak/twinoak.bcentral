<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { updater } from "../lib/updates.svelte.ts";
</script>

{#if updater.updateAvailable()}
  <div class="banner" role="status">
    <span>{t("update.available")}</span>
    <button type="button" onclick={() => updater.reload()}>{t("update.reload")}</button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #e0b64a;
    color: var(--ink);
  }
</style>
