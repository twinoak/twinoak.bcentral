<script lang="ts">
  import ShortcutHelp from "./components/ShortcutHelp.svelte";
  import Toast from "./components/Toast.svelte";
  import TopBar from "./components/TopBar.svelte";
  import HandoverPage from "./pages/HandoverPage.svelte";
  import JournalPage from "./pages/JournalPage.svelte";
  import PrintPage from "./pages/PrintPage.svelte";
  import PrintRegisterPage from "./pages/PrintRegisterPage.svelte";
  import QueuePage from "./pages/QueuePage.svelte";
  import RadioPage from "./pages/RadioPage.svelte";
  import RegisterPage from "./pages/RegisterPage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import StyleGuidePage from "./pages/StyleGuidePage.svelte";
  import { language, t } from "./i18n/index.svelte.ts";
  import { applyAppearance, applyDrill } from "./lib/appearance.ts";
  import { navigate, route } from "./lib/router.svelte.ts";
  import { hasOperatorName, settings } from "./lib/settings.svelte.ts";
  import { deferShortcut, installShortcuts, onShortcut } from "./lib/shortcutDispatch.ts";
  import { closeHelp, helpOpen, toggleHelp } from "./lib/shortcutHelp.svelte.ts";
  import { drillMode } from "./store/index.ts";

  // Until an operator name is set, every route shows the journal, where the setup card asks
  // for it (P2-03) — except settings, which can set it too, and the style guide (P2-01),
  // which is for the reviewer and records nothing.
  const shown = $derived(
    hasOperatorName() || route() === "styleguide" || route() === "settings" ? route() : "journal",
  );
  const drillActive = $derived(drillMode.active());

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

  // Drill mode (P1-05, P2-02): `data-drill="true"` on the root while the current incident is
  // a drill — the top bar takes the drill tint from it (components.css) and the drill chip
  // sits next to the incident; nothing else changes. The window title says ØVELSE too, so
  // the taskbar and the tab say it. The print view sets its own title for the duration of
  // a print and puts this one back.
  $effect(() => {
    applyDrill(document.documentElement, drillActive);
  });

  $effect(() => {
    document.title = drillActive ? t("drill.documentTitle") : t("app.name");
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

<!-- Nothing between the bar and the page (P2-02): every band and banner is a chip in the
     bar now. The page is one width (styles/base.css: at most 1440 px, the s-5 gutter); a
     screen that needs less lays itself out narrower (P2-04). -->
<main>
  {#if shown === "settings"}
    <SettingsPage />
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
    <JournalPage />
  {/if}
</main>

<Toast />
<ShortcutHelp />
