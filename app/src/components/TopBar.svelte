<script lang="ts">
  // The shell (P2-02, docs/design.md §The shell): one 56 px bar on every screen, and nothing
  // below it but the page. Left to right: the wordmark, the incident (its switcher opens from
  // it; the drill chip beside it while a drill is current), the status cluster, the
  // navigation, the operator and the language. The bar's tint is the drill pair while a
  // drill is current (`[data-drill="true"]` on the root, App.svelte); components.css has the
  // `.shell*` rules. The ? button opens the keyboard-shortcuts card (P1-09).
  import { t } from "../i18n/index.svelte.ts";
  import { hashFor, navigate, route } from "../lib/router.svelte.ts";
  import { hasOperatorName, settings } from "../lib/settings.svelte.ts";
  import { openHelp } from "../lib/shortcutHelp.svelte.ts";
  import { versionLabel } from "../lib/version.ts";
  import IncidentSwitcher from "./IncidentSwitcher.svelte";
  import LanguageSelect from "./LanguageSelect.svelte";
  import StatusChips from "./StatusChips.svelte";

  const NAV = ["journal", "handover", "queue", "register", "settings"] as const;
</script>

<!-- `no-print`: the print views print the page alone (styles/base.css). -->
<header class="shell no-print">
  <a
    class="shell-brand"
    href={hashFor("journal")}
    title={t("topbar.about", { version: versionLabel() })}
  >
    {t("app.name")}
  </a>

  <IncidentSwitcher />

  <StatusChips />

  <div class="shell-right">
    <nav class="shell-nav" aria-label={t("nav.label")}>
      {#each NAV as to (to)}
        <a class="tab" href={hashFor(to)} aria-current={route() === to ? "page" : undefined}>
          {t(`nav.${to}`)}
        </a>
      {/each}
    </nav>

    <div class="shell-end">
      <!-- The operator: the name, and the handover page on click (the next operator's first
         screen); without a name, the journal, where the setup card asks for it (P2-03). -->
      <button
        type="button"
        class="chip"
        class:chip-warn={!hasOperatorName()}
        title={hasOperatorName()
          ? t("topbar.operator", { name: settings.operatorName })
          : t("topbar.noOperator")}
        onclick={() => navigate(hasOperatorName() ? "handover" : "journal")}
      >
        <span class="chip-label">
          {hasOperatorName() ? settings.operatorName : t("topbar.noOperator")}
        </span>
      </button>
      <LanguageSelect id="topbar-language" class="shell-select" />
      <button
        type="button"
        class="btn btn-quiet btn-icon"
        aria-label={t("shortcuts.open")}
        title={t("shortcuts.open")}
        onclick={openHelp}>?</button
      >
    </div>
  </div>
</header>
