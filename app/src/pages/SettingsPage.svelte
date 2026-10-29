<script lang="ts">
  import { t, language } from "../i18n/index.svelte.ts";
  import {
    MAX_SEND_ATTEMPTS_LIMIT,
    SEND_GAP_SECONDS_LIMIT,
    settings,
    updateSettings,
  } from "../lib/settings.svelte.ts";
  import { clockTrust, setClockConfirmed } from "../lib/clock.svelte.ts";
  import LanguageSelect from "../components/LanguageSelect.svelte";

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

  .clock {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .clock h2 {
    font-size: 1.1rem;
    margin: 0;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .trust {
    color: var(--ink);
  }
</style>
