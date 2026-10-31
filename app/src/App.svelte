<script lang="ts">
  import DrillBand from "./components/DrillBand.svelte";
  import ShortcutHelp from "./components/ShortcutHelp.svelte";
  import TopBar from "./components/TopBar.svelte";
  import UpdateBanner from "./components/UpdateBanner.svelte";
  import HandoverPage from "./pages/HandoverPage.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import JournalPage from "./pages/JournalPage.svelte";
  import PrintPage from "./pages/PrintPage.svelte";
  import PrintRegisterPage from "./pages/PrintRegisterPage.svelte";
  import QueuePage from "./pages/QueuePage.svelte";
  import RadioPage from "./pages/RadioPage.svelte";
  import RegisterPage from "./pages/RegisterPage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import StyleGuidePage from "./pages/StyleGuidePage.svelte";
  import { language, t } from "./i18n/index.svelte.ts";
  import { applyAppearance } from "./lib/appearance.ts";
  import { navigate, route } from "./lib/router.svelte.ts";
  import { hasOperatorName, settings } from "./lib/settings.svelte.ts";
  import { deferShortcut, installShortcuts, onShortcut } from "./lib/shortcutDispatch.ts";
  import { closeHelp, helpOpen, toggleHelp } from "./lib/shortcutHelp.svelte.ts";
  import { drillMode } from "./store/index.ts";

  // Until an operator name is set, every route shows settings — except the style guide
  // (P2-01), which is for the reviewer and records nothing.
  const shown = $derived(hasOperatorName() || route() === "styleguide" ? route() : "settings");
  const drillIncident = $derived(drillMode.active() ? drillMode.incident() : null);

  $effect(() => {
    document.documentElement.lang = language();
  });

  // The text size and the contrast mode (P1-09) follow the settings at once.
  $effect(() => {
    applyAppearance(document.documentElement, {
      fontSize: settings.fontSize,
      highContrast: settings.highContrast,
    });
  });

  // The window title says ØVELSE while a drill is current (P1-05), so the taskbar and the
  // tab say it too. The print view sets its own title for the duration of a print and puts
  // this one back.
  $effect(() => {
    document.title = drillIncident === null ? t("app.name") : t("drill.documentTitle");
  });

  // The keyboard shortcuts (P1-09): one listener on the window; these are the defaults, the
  // screens register their own on top while they are mounted (lib/shortcutDispatch.ts).
  // N and A on a screen without the journal's forms go to the journal and run there.
  $effect(() => {
    const fallback = { fallback: true };
    const go = (to: "journal" | "register" | "handover" | "settings") => () => {
      navigate(to);
      return true;
    };
    const offs = [
      installShortcuts(window),
      onShortcut("goJournal", go("journal"), fallback),
      onShortcut("goRegister", go("register"), fallback),
      onShortcut("goHandover", go("handover"), fallback),
      onShortcut("goSettings", go("settings"), fallback),
      onShortcut(
        "help",
        () => {
          toggleHelp();
          return true;
        },
        fallback,
      ),
      onShortcut(
        "cancel",
        () => {
          if (!helpOpen()) {
            return false;
          }
          closeHelp();
          return true;
        },
        fallback,
      ),
      onShortcut(
        "newMessage",
        () => {
          deferShortcut("newMessage");
          navigate("journal");
          return true;
        },
        fallback,
      ),
      onShortcut(
        "addNote",
        () => {
          deferShortcut("addNote");
          navigate("journal");
          return true;
        },
        fallback,
      ),
    ];
    return () => {
      for (const off of offs) {
        off();
      }
    };
  });
</script>

<TopBar />

<!-- The drill band (P1-05): on every screen while the current incident is a drill. -->
{#if drillIncident !== null}
  <DrillBand incident={drillIncident} />
{/if}

<!-- Shown only when a new build is waiting; the reload is the operator's click. -->
<UpdateBanner />

<!-- The journal, queue and handover screens have side panels and need the width; the print
     views are tables; the style guide (P2-01) shows components side by side; the others are
     forms. -->
<main
  class:wide={shown === "journal" ||
    shown === "queue" ||
    shown === "print" ||
    shown === "printRegister" ||
    shown === "handover" ||
    shown === "styleguide"}
>
  {#if shown === "settings"}
    <SettingsPage />
  {:else if shown === "journal"}
    <JournalPage />
  {:else if shown === "handover"}
    <HandoverPage />
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
  {:else if shown === "styleguide"}
    <StyleGuidePage />
  {:else}
    <HomePage />
  {/if}
</main>

<ShortcutHelp />
