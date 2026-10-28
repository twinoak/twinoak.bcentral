<script lang="ts">
  import TopBar from "./components/TopBar.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import { language } from "./i18n/index.svelte.ts";
  import { route } from "./lib/router.svelte.ts";
  import { hasOperatorName } from "./lib/settings.svelte.ts";

  // Until an operator name is set, every route shows settings.
  const shown = $derived(hasOperatorName() ? route() : "settings");

  $effect(() => {
    document.documentElement.lang = language();
  });
</script>

<TopBar />

<main>
  {#if shown === "settings"}
    <SettingsPage />
  {:else}
    <HomePage />
  {/if}
</main>
