<script lang="ts">
  import DrillBand from "./components/DrillBand.svelte";
  import TopBar from "./components/TopBar.svelte";
  import UpdateBanner from "./components/UpdateBanner.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import JournalPage from "./pages/JournalPage.svelte";
  import PrintPage from "./pages/PrintPage.svelte";
  import PrintRegisterPage from "./pages/PrintRegisterPage.svelte";
  import QueuePage from "./pages/QueuePage.svelte";
  import RadioPage from "./pages/RadioPage.svelte";
  import RegisterPage from "./pages/RegisterPage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import { language, t } from "./i18n/index.svelte.ts";
  import { route } from "./lib/router.svelte.ts";
  import { hasOperatorName } from "./lib/settings.svelte.ts";
  import { drillMode } from "./store/index.ts";

  // Until an operator name is set, every route shows settings.
  const shown = $derived(hasOperatorName() ? route() : "settings");
  const drillIncident = $derived(drillMode.active() ? drillMode.incident() : null);

  $effect(() => {
    document.documentElement.lang = language();
  });

  // The window title says ØVELSE while a drill is current (P1-05), so the taskbar and the
  // tab say it too. The print view sets its own title for the duration of a print and puts
  // this one back.
  $effect(() => {
    document.title = drillIncident === null ? t("app.name") : t("drill.documentTitle");
  });
</script>

<TopBar />

<!-- The drill band (P1-05): on every screen while the current incident is a drill. -->
{#if drillIncident !== null}
  <DrillBand incident={drillIncident} />
{/if}

<!-- Shown only when a new build is waiting; the reload is the operator's click. -->
<UpdateBanner />

<!-- The journal and queue screens have side panels and need the width; the print views are
     tables; the others are forms. -->
<main
  class:wide={shown === "journal" ||
    shown === "queue" ||
    shown === "print" ||
    shown === "printRegister"}
>
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
  {:else if shown === "printRegister"}
    <PrintRegisterPage />
  {:else if shown === "radio"}
    <RadioPage />
  {:else}
    <HomePage />
  {/if}
</main>
