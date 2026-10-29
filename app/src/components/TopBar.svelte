<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { settings, hasOperatorName } from "../lib/settings.svelte.ts";
  import { route, hashFor } from "../lib/router.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { radio } from "../radio/index.ts";
  import LanguageSelect from "./LanguageSelect.svelte";

  const radioState = $derived(radio.state());
  const elapsed = $derived(radio.elapsedMs());
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

  <a
    class="radio"
    href={hashFor("radio")}
    data-state={radioState}
    title={t("topbar.radio")}
    aria-current={route() === "radio" ? "page" : undefined}
  >
    <span class="dot" aria-hidden="true"></span>
    <span role="status">
      {t(`radio.status.${radioState}`)}{#if elapsed !== null && radioState !== "connecting"}
        · {t("radio.heard", { elapsed: formatElapsed(elapsed) })}{/if}
    </span>
  </a>

  <LanguageSelect id="topbar-language" />

  <a
    class="nav"
    href={hashFor("journal")}
    aria-current={route() === "journal" ? "page" : undefined}
  >
    {t("nav.journal")}
  </a>

  <a
    class="nav"
    href={hashFor("queue")}
    aria-current={route() === "queue" ? "page" : undefined}
  >
    {t("nav.queue")}
  </a>

  <a
    class="nav"
    href={hashFor("register")}
    aria-current={route() === "register" ? "page" : undefined}
  >
    {t("nav.register")}
  </a>

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
    white-space: nowrap;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--line);
  }

  .radio[data-state="connecting"] .dot {
    background: #e0b64a;
  }

  .radio[data-state="connected"] .dot {
    background: #5fd38d;
  }

  .radio[data-state="blind"] .dot {
    background: #ef7a6d;
  }

  .radio[data-state="blind"] {
    font-weight: 700;
  }
</style>
