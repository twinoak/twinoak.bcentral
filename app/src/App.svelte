<script lang="ts">
  import TopBar from "./components/TopBar.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import JournalPage from "./pages/JournalPage.svelte";
  import QueuePage from "./pages/QueuePage.svelte";
  import RadioPage from "./pages/RadioPage.svelte";
  import RegisterPage from "./pages/RegisterPage.svelte";
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

<!-- The journal and queue screens have side panels and need the width; the others are forms. -->
<main class:wide={shown === "journal" || shown === "queue"}>
  {#if shown === "settings"}
    <SettingsPage />
  {:else if shown === "journal"}
    <JournalPage />
  {:else if shown === "queue"}
    <QueuePage />
  {:else if shown === "register"}
    <RegisterPage />
  {:else if shown === "radio"}
    <RadioPage />
  {:else}
    <HomePage />
  {/if}
</main>
