<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { settings, hasOperatorName } from "../lib/settings.svelte.ts";
  import { route, hashFor } from "../lib/router.svelte.ts";
  import LanguageSelect from "./LanguageSelect.svelte";
</script>

<header class="topbar">
  <a class="brand" href={hashFor("home")}>{t("app.name")}</a>

  <span class="operator" class:missing={!hasOperatorName()}>
    {#if hasOperatorName()}
      {t("topbar.operator", { name: settings.operatorName })}
    {:else}
      {t("topbar.noOperator")}
    {/if}
  </span>

  <!-- Placeholder until P0-04 brings the radio layer. -->
  <span class="radio" title={t("topbar.radio")}>
    <span class="dot" aria-hidden="true"></span>
    {t("radio.status.disconnected")}
  </span>

  <LanguageSelect id="topbar-language" />

  <a
    class="nav"
    href={hashFor("settings")}
    aria-current={route() === "settings" ? "page" : undefined}
  >
    {t("nav.settings")}
  </a>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--navy);
    color: #fff;
  }

  .topbar a {
    color: #fff;
    text-decoration: none;
  }

  .topbar a[aria-current="page"] {
    text-decoration: underline;
  }

  .brand {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .operator {
    flex: 1;
  }

  .operator.missing {
    opacity: 0.7;
    font-style: italic;
  }

  .radio {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--line);
  }
</style>
