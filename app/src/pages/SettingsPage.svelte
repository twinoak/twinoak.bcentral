<script lang="ts">
  import { t } from "../i18n/index.svelte.ts";
  import { settings, updateSettings } from "../lib/settings.svelte.ts";
  import LanguageSelect from "../components/LanguageSelect.svelte";

  // Drafts: edited here, written to settings on save.
  let operatorName = $state(settings.operatorName);
  let hubUrl = $state(settings.hubUrl);
  let blindAfterMinutes: number | undefined = $state(settings.blindAfterMinutes);
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
  const canSave = $derived(!operatorNameError && !hubUrlError && !blindAfterError);

  function save(event: SubmitEvent) {
    event.preventDefault();
    const minutes = blindAfterMinutes;
    if (!canSave || minutes === undefined) {
      return;
    }
    updateSettings({
      operatorName: operatorName.trim(),
      hubUrl: hubUrl.trim(),
      blindAfterMinutes: minutes,
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
</style>
