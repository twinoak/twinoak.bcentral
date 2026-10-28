<script lang="ts">
  import { t, language, languages, setLanguage, isLanguage } from "../i18n/index.svelte.ts";

  let { id = "language" }: { id?: string } = $props();

  function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
    const value = event.currentTarget.value;
    if (isLanguage(value)) {
      setLanguage(value);
    }
  }
</script>

<select {id} value={language()} onchange={onChange} aria-label={t("language.label")}>
  {#each languages as code (code)}
    <option value={code}>{t(`language.${code}`)}</option>
  {/each}
</select>
