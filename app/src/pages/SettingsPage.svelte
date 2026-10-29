<script lang="ts">
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
  import { openHelp } from "../lib/shortcutHelp.svelte.ts";
  import { builtAt, versionLabel } from "../lib/version.ts";
  import { updater } from "../lib/updates.svelte.ts";
  import { formatBytes, persistence } from "../lib/persistence.svelte.ts";
  import { mirror } from "../store/index.ts";
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

  // The screen settings (P1-09) apply at once, like the language: the operator sees the
  // change as they make it, and App.svelte puts it on the page from the saved value.
  function setFontSize(size: FontSize) {
    updateSettings({ fontSize: size });
  }

  function setHighContrast(on: boolean) {
    updateSettings({ highContrast: on });
  }

  // Drafts: edited here, written to settings on save.
  let operatorName = $state(settings.operatorName);
  let hubUrl = $state(settings.hubUrl);
  let blindAfterMinutes: number | undefined = $state(settings.blindAfterMinutes);
  let maxSendAttempts: number | undefined = $state(settings.maxSendAttempts);
  let sendGapSeconds: number | undefined = $state(settings.sendGapSeconds);
  let saved = $state(false);

  const operatorNameError = $derived(
    operatorName.trim() === "" ? t("settings.operatorNameRequired") : null,
  );
  const hubUrlError = $derived(
    hubUrl.trim() !== "" && !URL.canParse(hubUrl.trim()) ? t("settings.hubUrlInvalid") : null,
  );
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
  const canSave = $derived(
    !operatorNameError && !hubUrlError && !blindAfterError && !maxSendAttemptsError && !sendGapError,
  );

  function save(event: SubmitEvent) {
    event.preventDefault();
    const minutes = blindAfterMinutes;
    const attempts = maxSendAttempts;
    const gap = sendGapSeconds;
    if (!canSave || minutes === undefined || attempts === undefined || gap === undefined) {
      return;
    }
    updateSettings({
      operatorName: operatorName.trim(),
      hubUrl: hubUrl.trim(),
      blindAfterMinutes: minutes,
      maxSendAttempts: attempts,
      sendGapSeconds: gap,
    });
    saved = true;
  }
</script>

<h1>{t("settings.title")}</h1>

<form onsubmit={save} oninput={() => (saved = false)}>
  <div class="field">
    <label for="operator-name">{t("settings.operatorName")}</label>
    <input
      id="operator-name"
      type="text"
      autocomplete="name"
      required
      bind:value={operatorName}
      aria-invalid={operatorNameError !== null}
    />
    <small>{t("settings.operatorNameHelp")}</small>
    {#if operatorNameError}
      <small class="error" role="alert">{operatorNameError}</small>
    {/if}
  </div>

  <div class="field">
    <label for="device-id">{t("settings.deviceId")}</label>
    <input id="device-id" type="text" readonly value={settings.deviceId} />
    <small>{t("settings.deviceIdHelp")}</small>
  </div>

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
    <small>{t("settings.hubUrlHelp")}</small>
    {#if hubUrlError}
      <small class="error">{hubUrlError}</small>
    {/if}
  </div>

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
    <small>{t("settings.blindAfterHelp")}</small>
    {#if blindAfterError}
      <small class="error">{blindAfterError}</small>
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
    <small>{t("settings.maxSendAttemptsHelp")}</small>
    {#if maxSendAttemptsError}
      <small class="error">{maxSendAttemptsError}</small>
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
    <small>{t("settings.sendGapHelp")}</small>
    {#if sendGapError}
      <small class="error">{sendGapError}</small>
    {/if}
  </div>

  <div class="field">
    <label for="settings-language">{t("language.label")}</label>
    <LanguageSelect id="settings-language" />
  </div>

  <div class="actions">
    <button type="submit" disabled={!canSave}>{t("settings.save")}</button>
    {#if saved}
      <span class="saved" role="status">{t("settings.saved")}</span>
    {/if}
  </div>
</form>

<!-- The screen (P1-09): text size, high contrast, the keyboard shortcuts. Applied at once
     and kept; nothing here waits for Save. -->
<section class="field appearance" aria-labelledby="appearance-heading">
  <h2 id="appearance-heading">{t("settings.appearance")}</h2>
  <fieldset class="sizes">
    <legend>{t("settings.fontSize")}</legend>
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
    <small>{t("settings.fontSizeHelp")}</small>
  </fieldset>
  <label class="check">
    <input
      type="checkbox"
      checked={settings.highContrast}
      onchange={(event) => setHighContrast(event.currentTarget.checked)}
    />
    {t("settings.highContrast")}
  </label>
  <small>{t("settings.highContrastHelp")}</small>
  <div class="actions">
    <button type="button" class="secondary" onclick={openHelp}>{t("settings.shortcuts")}</button>
  </div>
</section>

<!-- The journal folder (P1-04): a copy of the journal outside the browser. The handle is kept
     in the journal database; the browser re-asks for the permission after a restart. -->
<section class="field folder" aria-labelledby="folder-heading">
  <h2 id="folder-heading">{t("settings.journalFolder")}</h2>
  <small>{t("settings.journalFolderHelp")}</small>
  {#if !mirror.supported()}
    <small class="error">{t("settings.journalFolder.unsupported")}</small>
  {:else}
    {#if mirrorState === "off"}
      <small>{t("settings.journalFolder.none")}</small>
    {:else}
      <span class="folder-name" role="status">
        {t("settings.journalFolder.current", { name: mirror.folderName() ?? "" })}
      </span>
      <small>{t("settings.journalFolder.file", { name: mirror.fileName() })}</small>
      {#if mirrorState === "needsPermission"}
        <small class="error" role="alert">{t("settings.journalFolder.needsPermission")}</small>
      {:else if mirrorState === "error"}
        <small class="error" role="alert"
          >{t("settings.journalFolder.error", { error: mirror.error() ?? "" })}</small
        >
      {:else if mirror.lastWriteAt() !== null}
        <small class="saved"
          >{t("settings.journalFolder.lastWrite", {
            time: formatClockTime(mirror.lastWriteAt() ?? ""),
          })}</small
        >
      {:else}
        <small>{t("settings.journalFolder.neverWritten")}</small>
      {/if}
      {#if mirror.pending() > 0}
        <small>{t("settings.journalFolder.pending", { count: mirror.pending() })}</small>
      {/if}
    {/if}
    <div class="actions">
      {#if mirrorState === "needsPermission"}
        <button
          type="button"
          disabled={folderBusy}
          onclick={() => folderAction(() => mirror.reconnect())}
        >
          {t("settings.journalFolder.reconnect")}
        </button>
      {:else if mirrorState === "error"}
        <button type="button" disabled={folderBusy} onclick={() => folderAction(() => mirror.retry())}>
          {t("settings.journalFolder.retry")}
        </button>
      {/if}
      <button
        type="button"
        class:secondary={mirrorState !== "off"}
        disabled={folderBusy}
        onclick={() => folderAction(() => mirror.chooseFolder())}
      >
        {mirrorState === "off"
          ? t("settings.journalFolder.choose")
          : t("settings.journalFolder.change")}
      </button>
      {#if mirrorState !== "off"}
        <button
          type="button"
          class="secondary"
          disabled={folderBusy}
          onclick={() => folderAction(() => mirror.forget())}
        >
          {t("settings.journalFolder.forget")}
        </button>
      {/if}
    </div>
    {#if folderError}
      <small class="error" role="alert">{folderError}</small>
    {/if}
  {/if}
</section>

<!-- Session state, not a saved setting: applies at once and lasts until the app is closed. -->
<section class="field clock" aria-labelledby="clock-heading">
  <h2 id="clock-heading">{t("settings.clock")}</h2>
  <small>{t("settings.clockNow", { time: clockNow })}</small>
  <label class="check">
    <input
      type="checkbox"
      checked={clockTrust() !== "unknown"}
      disabled={clockTrust() === "ntp"}
      onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
    />
    {t("settings.clockConfirm")}
  </label>
  <small>{t("settings.clockHelp")}</small>
  <small class="trust" role="status">{t(`settings.clockTrust.${clockTrust()}`)}</small>
</section>

<!-- The running code is the installed one; a new build waits for the reload button here or
     in the banner above the page (lib/updates.svelte.ts). -->
<section class="field about" aria-labelledby="about-heading">
  <h2 id="about-heading">{t("settings.about")}</h2>
  <dl>
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
    <!-- Persistent storage (P1-04): what navigator.storage said on start. -->
    <dt>{t("settings.storage")}</dt>
    <dd>
      {#if persistence.persisted() === null}
        {t("settings.storage.unknown")}
      {:else if persistence.persisted()}
        {t("settings.storage.persisted")}
      {:else}
        <span class="error">{t("settings.storage.notPersisted")}</span>
      {/if}
      <br />
      {#if usage === null}
        {t("settings.storage.estimateUnavailable")}
      {:else}
        {t("settings.storage.estimate", {
          usage: formatBytes(usage.usage, language()),
          quota: formatBytes(usage.quota, language()),
        })}
      {/if}
    </dd>
  </dl>
  {#if updater.registered()}
    <div class="actions">
      <button type="button" disabled={updater.checking()} onclick={() => updater.checkNow()}>
        {updater.checking() ? t("settings.checking") : t("settings.checkNow")}
      </button>
      {#if updater.updateAvailable()}
        <span role="status">{t("update.available")}</span>
        <button type="button" onclick={() => updater.reload()}>{t("update.reload")}</button>
      {:else if updater.lastCheckError() !== null}
        <small class="error" role="status">
          {t("settings.checkFailed", { error: updater.lastCheckError() ?? "" })}
        </small>
      {/if}
    </div>
  {:else}
    <small>{t("settings.updatesUnavailable")}</small>
  {/if}
</section>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1.25rem;
    max-width: 28rem;
  }

  label {
    font-weight: 600;
  }

  small {
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .saved {
    color: var(--ok);
  }

  .appearance,
  .folder,
  .clock,
  .about {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .appearance h2,
  .folder h2,
  .clock h2,
  .about h2 {
    font-size: 1.1rem;
    margin: 0;
  }

  .sizes {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sizes legend {
    font-weight: 600;
    padding: 0;
  }

  .options {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  /* The three sizes shown at their own size, so the choice can be seen before it is made. */
  .options label[data-size="large"] {
    font-size: 1.17em;
  }

  .options label[data-size="largest"] {
    font-size: 1.33em;
  }

  .folder-name {
    font-weight: 600;
  }

  .folder .actions,
  .appearance .actions {
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .about dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0.5rem 0;
  }

  .about dt {
    font-weight: 600;
  }

  .about dd {
    margin: 0;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    font-weight: 600;
  }

  .trust {
    color: var(--ink);
  }
</style>
