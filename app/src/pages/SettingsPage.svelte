<script lang="ts">
  // Settings (P0-01 … P1-09; on the design language in P2-04): one column of cards, one per
  // topic — Operator, Clock, Journal folder, Radio, Hub, Text & contrast, Language, About.
  // The save pattern: a card with typed values (Operator, Radio, Hub) has its own Save
  // button, validates its own fields and shows the Saved toast; a card with switches (Clock,
  // Text & contrast, Language) applies at once, as before; the Journal folder's buttons are
  // user gestures the mirror needs. The clock-confirm checkbox stays here and in the clock
  // chip's popover (docs/design.md §Screens).
  import { t, language } from "../i18n/index.svelte.ts";
  import {
    FONT_SIZES,
    MAX_SEND_ATTEMPTS_LIMIT,
    SEND_GAP_SECONDS_LIMIT,
    settings,
    updateSettings,
    type FontSize,
  } from "../lib/settings.svelte.ts";
  import { clockTrust, setClockConfirmed } from "../lib/clock.svelte.ts";
  import { chipClass } from "../lib/journalRows.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { openHelp } from "../lib/shortcutHelp.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import { builtAt, versionLabel } from "../lib/version.ts";
  import { updater } from "../lib/updates.svelte.ts";
  import { formatBytes, persistence } from "../lib/persistence.svelte.ts";
  import { radio } from "../radio/index.ts";
  import { mirror } from "../store/index.ts";
  import Icon from "../components/Icon.svelte";
  import LanguageSelect from "../components/LanguageSelect.svelte";

  // Build time and "last checked" as the operator reads them, in the UI language.
  function formatInstant(iso: string): string {
    return new Date(iso).toLocaleString(language(), { dateStyle: "medium", timeStyle: "short" });
  }

  // The journal folder (P1-04): picking, reconnecting and forgetting are user gestures here;
  // the mirror's own state says how the folder is doing.
  let folderBusy = $state(false);
  let folderError: string | null = $state(null);
  const mirrorState = $derived(mirror.state());
  const usage = $derived(persistence.usage());

  function formatClockTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(language(), { timeStyle: "medium" });
  }

  async function folderAction(action: () => Promise<void>) {
    folderBusy = true;
    folderError = null;
    try {
      await action();
    } catch (failure) {
      folderError = t("settings.journalFolder.chooseFailed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      folderBusy = false;
    }
  }

  // The PC's clock, shown so the operator can judge it before confirming it. Ticks once a
  // second while the page is open.
  function formatClock(date: Date): string {
    return date.toLocaleString(language(), { dateStyle: "medium", timeStyle: "medium" });
  }
  let clockNow = $state(formatClock(new Date()));
  $effect(() => {
    const timer = setInterval(() => {
      clockNow = formatClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  });
  const clockUnknown = $derived(clockTrust() === "unknown");

  // The radio's state, for the Radio card's line (the page itself is reached from here).
  const radioState = $derived(radio.state());
  const radioTint = $derived(
    radioState === "connected" ? "neutral" : radioState === "connecting" ? "warn" : "danger",
  );

  // The text size and the contrast (P1-09) apply at once, like the language: the operator
  // sees the change as they make it, and App.svelte puts it on the page from the saved value.
  function setFontSize(size: FontSize) {
    updateSettings({ fontSize: size });
  }

  function setHighContrast(on: boolean) {
    updateSettings({ highContrast: on });
  }

  // --- Operator: drafts, edited here, written to settings on the card's Save. ------------
  let operatorName = $state(settings.operatorName);
  const operatorNameError = $derived(
    operatorName.trim() === "" ? t("settings.operatorNameRequired") : null,
  );

  function saveOperator(event: SubmitEvent) {
    event.preventDefault();
    if (operatorNameError !== null) {
      return;
    }
    updateSettings({ operatorName: operatorName.trim() });
    // The confirmation is the toast (P2-02), not a line next to the button.
    showToast(t("settings.saved"));
  }

  // --- Radio: the three numbers. ---------------------------------------------------------
  let blindAfterMinutes: number | undefined = $state(settings.blindAfterMinutes);
  let maxSendAttempts: number | undefined = $state(settings.maxSendAttempts);
  let sendGapSeconds: number | undefined = $state(settings.sendGapSeconds);

  const blindAfterError = $derived(
    blindAfterMinutes === undefined || !Number.isInteger(blindAfterMinutes) || blindAfterMinutes < 1
      ? t("settings.blindAfterInvalid")
      : null,
  );
  const maxSendAttemptsError = $derived(
    maxSendAttempts === undefined ||
      !Number.isInteger(maxSendAttempts) ||
      maxSendAttempts < 1 ||
      maxSendAttempts > MAX_SEND_ATTEMPTS_LIMIT
      ? t("settings.maxSendAttemptsInvalid")
      : null,
  );
  const sendGapError = $derived(
    sendGapSeconds === undefined ||
      !Number.isInteger(sendGapSeconds) ||
      sendGapSeconds < 1 ||
      sendGapSeconds > SEND_GAP_SECONDS_LIMIT
      ? t("settings.sendGapInvalid")
      : null,
  );
  const canSaveRadio = $derived(!blindAfterError && !maxSendAttemptsError && !sendGapError);

  function saveRadio(event: SubmitEvent) {
    event.preventDefault();
    const minutes = blindAfterMinutes;
    const attempts = maxSendAttempts;
    const gap = sendGapSeconds;
    if (!canSaveRadio || minutes === undefined || attempts === undefined || gap === undefined) {
      return;
    }
    updateSettings({ blindAfterMinutes: minutes, maxSendAttempts: attempts, sendGapSeconds: gap });
    showToast(t("settings.saved"));
  }

  // --- Hub: the URL, a placeholder until phase 3. ----------------------------------------
  let hubUrl = $state(settings.hubUrl);
  const hubUrlError = $derived(
    hubUrl.trim() !== "" && !URL.canParse(hubUrl.trim()) ? t("settings.hubUrlInvalid") : null,
  );

  function saveHub(event: SubmitEvent) {
    event.preventDefault();
    if (hubUrlError !== null) {
      return;
    }
    updateSettings({ hubUrl: hubUrl.trim() });
    showToast(t("settings.saved"));
  }
</script>

<!-- The page heading is for assistive technology; the bar's navigation names the screen. -->
<h1 class="visually-hidden">{t("settings.title")}</h1>

<div class="column">
  <!-- Operator -->
  <form class="card" onsubmit={saveOperator} aria-labelledby="settings-operator-heading">
    <h2 id="settings-operator-heading" class="card-title">{t("settings.card.operator")}</h2>
    <div class="field">
      <label for="operator-name">{t("settings.operatorName")}</label>
      <input
        id="operator-name"
        type="text"
        autocomplete="name"
        required
        bind:value={operatorName}
        aria-invalid={operatorNameError !== null}
        aria-describedby="operator-name-help"
      />
      <span class="field-help" id="operator-name-help">{t("settings.operatorNameHelp")}</span>
      {#if operatorNameError}
        <span class="field-error" role="alert"><Icon name="warning" />{operatorNameError}</span>
      {/if}
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={operatorNameError !== null}>
        {t("settings.save")}
      </button>
    </div>
  </form>

  <!-- Clock: session state, not a saved setting; applies at once and lasts until the app is
       closed. -->
  <section class="card" aria-labelledby="clock-heading">
    <h2 id="clock-heading" class="card-title">{t("settings.clock")}</h2>
    <p class="msg clock-now"><Icon name="clock" />{t("settings.clockNow", { time: clockNow })}</p>
    <div class="field">
      <label class="check">
        <input
          type="checkbox"
          checked={clockTrust() !== "unknown"}
          disabled={clockTrust() === "ntp"}
          onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
        />
        {t("settings.clockConfirm")}
      </label>
      <span class="field-help">{t("settings.clockHelp")}</span>
    </div>
    <p class="msg" class:msg-warn={clockUnknown} class:msg-ok={!clockUnknown} role="status">
      <Icon name={clockUnknown ? "warning" : "check"} />{t(`settings.clockTrust.${clockTrust()}`)}
    </p>
  </section>

  <!-- Journal folder (P1-04): a copy of the journal outside the browser. The handle is kept
       in the journal database; the browser re-asks for the permission after a restart. -->
  <section class="card" aria-labelledby="folder-heading">
    <h2 id="folder-heading" class="card-title">{t("settings.journalFolder")}</h2>
    <p class="msg">{t("settings.journalFolderHelp")}</p>
    {#if !mirror.supported()}
      <p class="msg msg-danger"><Icon name="warning" />{t("settings.journalFolder.unsupported")}</p>
    {:else}
      {#if mirrorState === "off"}
        <p class="msg"><Icon name="storage" />{t("settings.journalFolder.none")}</p>
      {:else}
        <dl class="dl">
          <dt>{t("settings.journalFolder")}</dt>
          <dd role="status">
            {t("settings.journalFolder.current", { name: mirror.folderName() ?? "" })}
          </dd>
          <dd class="field-help">
            {t("settings.journalFolder.file", { name: mirror.fileName() })}
          </dd>
        </dl>
        {#if mirrorState === "needsPermission"}
          <p class="msg msg-warn" role="alert">
            <Icon name="warning" />{t("settings.journalFolder.needsPermission")}
          </p>
        {:else if mirrorState === "error"}
          <p class="msg msg-danger" role="alert">
            <Icon name="warning" />{t("settings.journalFolder.error", {
              error: mirror.error() ?? "",
            })}
          </p>
        {:else if mirror.lastWriteAt() !== null}
          <p class="msg msg-ok">
            <Icon name="check" />{t("settings.journalFolder.lastWrite", {
              time: formatClockTime(mirror.lastWriteAt() ?? ""),
            })}
          </p>
        {:else}
          <p class="msg">{t("settings.journalFolder.neverWritten")}</p>
        {/if}
        {#if mirror.pending() > 0}
          <p class="msg">{t("settings.journalFolder.pending", { count: mirror.pending() })}</p>
        {/if}
      {/if}
      <div class="form-actions">
        {#if mirrorState === "needsPermission"}
          <button
            type="button"
            class="btn btn-primary"
            disabled={folderBusy}
            onclick={() => folderAction(() => mirror.reconnect())}
          >
            {t("settings.journalFolder.reconnect")}
          </button>
        {:else if mirrorState === "error"}
          <button
            type="button"
            class="btn btn-primary"
            disabled={folderBusy}
            onclick={() => folderAction(() => mirror.retry())}
          >
            <Icon name="retry" />{t("settings.journalFolder.retry")}
          </button>
        {/if}
        <button
          type="button"
          class="btn"
          class:btn-primary={mirrorState === "off"}
          disabled={folderBusy}
          onclick={() => folderAction(() => mirror.chooseFolder())}
        >
          <Icon name="storage" />{mirrorState === "off"
            ? t("settings.journalFolder.choose")
            : t("settings.journalFolder.change")}
        </button>
        {#if mirrorState !== "off"}
          <button
            type="button"
            class="btn"
            disabled={folderBusy}
            onclick={() => folderAction(() => mirror.forget())}
          >
            {t("settings.journalFolder.forget")}
          </button>
        {/if}
      </div>
      {#if folderError}
        <p class="msg msg-danger" role="alert"><Icon name="warning" />{folderError}</p>
      {/if}
    {/if}
  </section>

  <!-- Radio: the state and the page, and the three numbers. -->
  <form class="card" onsubmit={saveRadio} aria-labelledby="settings-radio-heading">
    <h2 id="settings-radio-heading" class="card-title">
      <span>{t("topbar.radio")}</span>
      <span class="chip {chipClass(radioTint)}" role="status">
        <Icon name="radio" />{t(`radio.status.${radioState}`)}
      </span>
    </h2>
    <div class="form-actions radio-line">
      <a class="btn" href={hashFor("radio")}><Icon name="radio" />{t("popover.radio.open")}</a>
    </div>
    <div class="fields">
      <div class="field">
        <label for="blind-after">{t("settings.blindAfterMinutes")}</label>
        <input
          id="blind-after"
          type="number"
          min="1"
          step="1"
          bind:value={blindAfterMinutes}
          aria-invalid={blindAfterError !== null}
        />
        <span class="field-help">{t("settings.blindAfterHelp")}</span>
        {#if blindAfterError}
          <span class="field-error"><Icon name="warning" />{blindAfterError}</span>
        {/if}
      </div>

      <div class="field">
        <label for="max-send-attempts">{t("settings.maxSendAttempts")}</label>
        <input
          id="max-send-attempts"
          type="number"
          min="1"
          max={MAX_SEND_ATTEMPTS_LIMIT}
          step="1"
          bind:value={maxSendAttempts}
          aria-invalid={maxSendAttemptsError !== null}
        />
        <span class="field-help">{t("settings.maxSendAttemptsHelp")}</span>
        {#if maxSendAttemptsError}
          <span class="field-error"><Icon name="warning" />{maxSendAttemptsError}</span>
        {/if}
      </div>

      <div class="field">
        <label for="send-gap">{t("settings.sendGapSeconds")}</label>
        <input
          id="send-gap"
          type="number"
          min="1"
          max={SEND_GAP_SECONDS_LIMIT}
          step="1"
          bind:value={sendGapSeconds}
          aria-invalid={sendGapError !== null}
        />
        <span class="field-help">{t("settings.sendGapHelp")}</span>
        {#if sendGapError}
          <span class="field-error"><Icon name="warning" />{sendGapError}</span>
        {/if}
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={!canSaveRadio}>
        {t("settings.save")}
      </button>
    </div>
  </form>

  <!-- Hub: the sync target of phase 3; a placeholder until then. -->
  <form class="card" onsubmit={saveHub} aria-labelledby="settings-hub-heading">
    <h2 id="settings-hub-heading" class="card-title">{t("settings.card.hub")}</h2>
    <div class="field">
      <label for="hub-url">{t("settings.hubUrl")}</label>
      <input
        id="hub-url"
        type="url"
        inputmode="url"
        placeholder="https://"
        bind:value={hubUrl}
        aria-invalid={hubUrlError !== null}
      />
      <span class="field-help">{t("settings.hubUrlHelp")}</span>
      {#if hubUrlError}
        <span class="field-error"><Icon name="warning" />{hubUrlError}</span>
      {/if}
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={hubUrlError !== null}>
        {t("settings.save")}
      </button>
    </div>
  </form>

  <!-- Text & contrast (P1-09): applied at once and kept; nothing here waits for Save. -->
  <section class="card" aria-labelledby="text-heading">
    <h2 id="text-heading" class="card-title">{t("settings.card.text")}</h2>
    <fieldset class="field sizes">
      <legend class="field-label">{t("settings.fontSize")}</legend>
      <div class="options">
        {#each FONT_SIZES as size (size)}
          <label class="check" data-size={size}>
            <input
              type="radio"
              name="font-size"
              value={size}
              checked={settings.fontSize === size}
              onchange={() => setFontSize(size)}
            />
            {t(`settings.fontSize.${size}`)}
          </label>
        {/each}
      </div>
      <span class="field-help">{t("settings.fontSizeHelp")}</span>
    </fieldset>
    <div class="field">
      <label class="check">
        <input
          type="checkbox"
          checked={settings.highContrast}
          onchange={(event) => setHighContrast(event.currentTarget.checked)}
        />
        {t("settings.highContrast")}
      </label>
      <span class="field-help">{t("settings.highContrastHelp")}</span>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={openHelp}>{t("settings.shortcuts")}</button>
    </div>
  </section>

  <!-- Language: applies at once. -->
  <section class="card" aria-labelledby="language-heading">
    <h2 id="language-heading" class="card-title">{t("language.label")}</h2>
    <div class="field language">
      <label for="settings-language">{t("language.label")}</label>
      <LanguageSelect id="settings-language" />
    </div>
  </section>

  <!-- About: the running code is the installed one; a new build waits for the reload button
       here or in the update chip of the top bar (lib/updates.svelte.ts). -->
  <section class="card" aria-labelledby="about-heading">
    <h2 id="about-heading" class="card-title">{t("settings.about")}</h2>
    <dl class="dl">
      <dt>{t("settings.installedVersion")}</dt>
      <dd>{versionLabel()}</dd>
      <dt>{t("settings.builtAt")}</dt>
      <dd>{formatInstant(builtAt)}</dd>
      <dt>{t("settings.lastChecked")}</dt>
      <dd>
        {#if updater.lastCheckedAt() !== null}
          {formatInstant(updater.lastCheckedAt() ?? "")}
        {:else}
          {t("settings.lastCheckedNever")}
        {/if}
      </dd>
      <dt>{t("settings.deviceId")}</dt>
      <dd>
        <code>{settings.deviceId}</code>
        <span class="field-help">{t("settings.deviceIdHelp")}</span>
      </dd>
      <!-- Persistent storage (P1-04): what navigator.storage said on start. -->
      <dt>{t("settings.storage")}</dt>
      <dd>
        {#if persistence.persisted() === null}
          <span class="msg">{t("settings.storage.unknown")}</span>
        {:else if persistence.persisted()}
          <span class="msg msg-ok"><Icon name="check" />{t("settings.storage.persisted")}</span>
        {:else}
          <span class="msg msg-warn"
            ><Icon name="warning" />{t("settings.storage.notPersisted")}</span
          >
        {/if}
        <span class="field-help">
          {#if usage === null}
            {t("settings.storage.estimateUnavailable")}
          {:else}
            {t("settings.storage.estimate", {
              usage: formatBytes(usage.usage, language()),
              quota: formatBytes(usage.quota, language()),
            })}
          {/if}
        </span>
      </dd>
    </dl>
    {#if updater.registered()}
      <div class="form-actions">
        <button
          type="button"
          class="btn"
          disabled={updater.checking()}
          onclick={() => updater.checkNow()}
        >
          <Icon name="update" />{updater.checking()
            ? t("settings.checking")
            : t("settings.checkNow")}
        </button>
        {#if updater.updateAvailable()}
          <button type="button" class="btn btn-primary" onclick={() => updater.reload()}>
            {t("update.reload")}
          </button>
        {/if}
      </div>
      {#if updater.updateAvailable()}
        <p class="msg msg-warn" role="status"><Icon name="update" />{t("update.available")}</p>
      {:else if updater.lastCheckError() !== null}
        <p class="msg msg-danger" role="status">
          <Icon name="warning" />{t("settings.checkFailed", {
            error: updater.lastCheckError() ?? "",
          })}
        </p>
      {/if}
    {:else}
      <p class="msg">{t("settings.updatesUnavailable")}</p>
    {/if}
    <!-- The design language's style guide (P2-01): for review, not in the navigation. -->
    <p class="msg"><a href={hashFor("styleguide")}>{t("settings.styleguide")}</a></p>
  </section>
</div>

<style>
  /* Layout only (docs/design.md §Screens → Settings): one column of cards, no wider than a
     form needs, at the left (no empty flanks). */
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    max-width: 44rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .card-title {
    margin-bottom: 0;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .field,
  .language {
    max-width: 28rem;
  }

  .sizes {
    margin: 0;
    padding: 0;
    border-width: 0;
    min-width: 0;
  }

  .sizes legend {
    padding: 0;
    margin-bottom: var(--s-1);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--s-5);
  }

  .msg {
    margin: 0;
  }

  .dl dd + .field-help {
    grid-column: 2;
  }

  .dl .field-help {
    display: block;
  }

  .radio-line {
    margin-top: calc(-1 * var(--s-1));
  }
</style>
