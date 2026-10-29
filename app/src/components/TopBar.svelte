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
  import { openHelp } from "../lib/shortcutHelp.svelte.ts";
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
  // The notices get a line of their own under the bar (P1-09): at 1280 px they no longer
  // push the navigation off the screen.
  const hasNotices = $derived(
    clockTrust() === "unknown" ||
      mirrorState === "needsPermission" ||
      mirrorState === "error" ||
      storageWarning,
  );
</script>

<!-- `no-print`: the print view (P1-04) prints the journal alone (app.css). -->
<header class="topbar no-print">
  <div class="bar">
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
            · {disconnectReasonText(
              reason,
            )}{/if}{#if elapsed !== null && radioState !== "connecting"}
            · {t("radio.heard", { elapsed: formatElapsed(elapsed) })}{/if}
        {/if}
      </span>
    </a>

    <LanguageSelect id="topbar-language" />

    <nav class="nav" aria-label={t("nav.label")}>
      <a href={hashFor("journal")} aria-current={route() === "journal" ? "page" : undefined}>
        {t("nav.journal")}
      </a>

      <!-- The shift handover (P1-08), next to the journal: the first screen a new operator opens. -->
      <a href={hashFor("handover")} aria-current={route() === "handover" ? "page" : undefined}>
        {t("nav.handover")}
      </a>

      <a href={hashFor("queue")} aria-current={route() === "queue" ? "page" : undefined}>
        {t("nav.queue")}
      </a>

      <a href={hashFor("register")} aria-current={route() === "register" ? "page" : undefined}>
        {t("nav.register")}
      </a>

      <a href={hashFor("settings")} aria-current={route() === "settings" ? "page" : undefined}>
        {t("nav.settings")}
      </a>
    </nav>

    <!-- The keyboard shortcuts overlay (P1-09), also on the ? key. -->
    <button
      type="button"
      class="help"
      aria-label={t("shortcuts.open")}
      title={t("shortcuts.open")}
      onclick={openHelp}>?</button
    >
  </div>

  {#if hasNotices}
    <div class="notices">
      <!-- Said once, here, instead of a mark on every row (P1-01): the session's clock has not
           been confirmed, so every entry written now is stamped clockTrust unknown. -->
      {#if clockTrust() === "unknown"}
        <a class="notice clock" href={hashFor("settings")}>{t("topbar.clockUnconfirmed")}</a>
      {/if}

      <!-- The journal folder (P1-04), never silent: the permission is re-asked from this one
           click (a user gesture); any other failure links to the settings page. -->
      {#if mirrorState === "needsPermission"}
        <button type="button" class="notice warning" onclick={() => mirror.reconnect()}>
          {t("topbar.folderNeedsPermission")}
        </button>
      {:else if mirrorState === "error"}
        <a class="notice warning" href={hashFor("settings")}>
          {t("topbar.folderError", { error: mirror.error() ?? "" })}
        </a>
      {/if}

      {#if storageWarning}
        <a class="notice warning" href={hashFor("settings")}>{t("topbar.notPersisted")}</a>
      {/if}
    </div>
  {/if}
</header>

<style>
  .topbar {
    background: var(--navy);
    color: var(--on-navy);
  }

  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    padding: 0.25rem 1rem;
  }

  .topbar a {
    color: var(--on-navy);
    text-decoration: none;
  }

  /* Links and buttons in the bar are 40 px tall and the focus ring is the one colour that
     reads on navy. */
  .bar a,
  .bar button,
  .nav a {
    display: inline-flex;
    align-items: center;
    min-height: 2.5rem;
    padding: 0.25rem 0.4rem;
  }

  .topbar :focus-visible {
    outline-color: var(--focus-on-navy);
  }

  .topbar a[aria-current="page"] {
    text-decoration: underline;
    text-underline-offset: 0.2em;
    text-decoration-thickness: 2px;
  }

  .brand {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .operator {
    flex: 1;
    min-width: 8rem;
  }

  .operator.missing {
    opacity: 0.85;
    font-style: italic;
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.25rem;
  }

  .help {
    min-width: 2.5rem;
    justify-content: center;
    padding: 0.25rem 0.5rem;
    border-color: var(--on-navy);
    background: var(--navy);
    color: var(--on-navy);
    font-weight: 700;
  }

  .radio {
    white-space: nowrap;
    gap: 0.4rem;
  }

  /* The dot has an edge of its own, so it reads as a shape beside its word in every mode. */
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 2px solid var(--on-navy);
    background: var(--dot-idle);
  }

  .radio[data-state="connecting"] .dot {
    background: var(--dot-connecting);
  }

  .radio[data-state="connected"] .dot {
    background: var(--dot-connected);
  }

  .radio[data-state="blind"] .dot {
    background: var(--dot-blind);
  }

  .radio[data-state="blind"] {
    font-weight: 700;
  }

  .notices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.25rem 1rem 0.5rem;
  }

  .notice {
    min-height: 2.25rem;
    padding: 0.25rem 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    font-size: inherit;
    font-weight: 600;
    white-space: normal;
    text-align: left;
    cursor: pointer;
  }

  .topbar a.notice,
  .notice {
    color: var(--ink);
  }

  .clock {
    background: var(--warn-bg);
  }

  .warning {
    background: var(--alert-bg);
  }
</style>
