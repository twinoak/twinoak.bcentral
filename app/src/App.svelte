<script lang="ts">
  import TopBar from "./components/TopBar.svelte";
  import UpdateBanner from "./components/UpdateBanner.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import JournalPage from "./pages/JournalPage.svelte";
  import PrintPage from "./pages/PrintPage.svelte";
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

<!-- Shown only when a new build is waiting; the reload is the operator's click. -->
<UpdateBanner />

<!-- The journal and queue screens have side panels and need the width; the print view is a
     table; the others are forms. -->
<main class:wide={shown === "journal" || shown === "queue" || shown === "print"}>
  {#if shown === "settings"}
    <SettingsPage />
  {:else if shown === "journal"}
    <JournalPage />
  {:else if shown === "print"}
    <PrintPage />
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
