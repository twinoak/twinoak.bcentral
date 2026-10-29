<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { clockTrust } from "../lib/clock.svelte.ts";
  import { settings, hasOperatorName } from "../lib/settings.svelte.ts";
  import { route, hashFor } from "../lib/router.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { capability, radio } from "../radio/index.ts";
  import { disconnectReasonText } from "../radio/radioStore.svelte.ts";
  import { versionLabel } from "../lib/version.ts";
  import { persistence } from "../lib/persistence.svelte.ts";
  import { mirror } from "../store/index.ts";
  import LanguageSelect from "./LanguageSelect.svelte";

  const radioState = $derived(radio.state());
  const elapsed = $derived(radio.elapsedMs());
  // Why there is no radio (P1-07): shown only while disconnected.
  const reason = $derived(radioState === "disconnected" ? radio.disconnectReason() : null);
  const mirrorState = $derived(mirror.state());
  // The storage warning's remedy is a journal folder; once one is set the line has done its
  // job and goes.
  const storageWarning = $derived(persistence.persisted() === false && mirrorState === "off");
</script>

<!-- `no-print`: the print view (P1-04) prints the journal alone (app.css). -->
<header class="topbar no-print">
  <a class="brand" href={hashFor("home")} title={t("topbar.about", { version: versionLabel() })}>
    {t("app.name")}
  </a>

  <span class="operator" class:missing={!hasOperatorName()}>
    {#if hasOperatorName()}
      {t("topbar.operator", { name: settings.operatorName })}
    {:else}
      {t("topbar.noOperator")}
    {/if}
  </span>

  <!-- Said once, here, instead of a mark on every row (P1-01): the session's clock has not
       been confirmed, so every entry written now is stamped clockTrust unknown. -->
  {#if clockTrust() === "unknown"}
    <a class="clock" href={hashFor("settings")}>{t("topbar.clockUnconfirmed")}</a>
  {/if}

  <!-- The journal folder (P1-04), never silent: the permission is re-asked from this one
       click (a user gesture); any other failure links to the settings page. -->
  {#if mirrorState === "needsPermission"}
    <button type="button" class="warning" onclick={() => mirror.reconnect()}>
      {t("topbar.folderNeedsPermission")}
    </button>
  {:else if mirrorState === "error"}
    <a class="warning" href={hashFor("settings")}>
      {t("topbar.folderError", { error: mirror.error() ?? "" })}
    </a>
  {/if}

  {#if storageWarning}
    <a class="warning" href={hashFor("settings")}>{t("topbar.notPersisted")}</a>
  {/if}

  <a
    class="radio"
    href={hashFor("radio")}
    data-state={radioState}
    title={t("topbar.radio")}
    aria-current={route() === "radio" ? "page" : undefined}
  >
    <span class="dot" aria-hidden="true"></span>
    <!-- A browser without Web Serial and Web Bluetooth gets the one sentence instead (P1-07). -->
    <span role="status">
      {#if capability === "none"}
        {t("topbar.noRadioApi")}
      {:else}
        {t(`radio.status.${radioState}`)}{#if reason !== null}
          · {disconnectReasonText(reason)}{/if}{#if elapsed !== null && radioState !== "connecting"}
          · {t("radio.heard", { elapsed: formatElapsed(elapsed) })}{/if}
      {/if}
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

  .clock {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: #e0b64a;
    color: var(--ink);
    white-space: nowrap;
  }

  .topbar a.clock {
    color: var(--ink);
  }

  .warning {
    padding: 0.15rem 0.6rem;
    border: none;
    border-radius: 999px;
    background: #ef7a6d;
    color: var(--ink);
    font-size: inherit;
    white-space: normal;
    text-align: left;
    cursor: pointer;
  }

  .topbar a.warning {
    color: var(--ink);
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
