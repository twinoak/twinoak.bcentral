<script lang="ts">
  import { t, language, languages, setLanguage, isLanguage } from "../i18n/index.svelte.ts";

  // `class` is the caller's: the compact `shell-select` in the top bar (P2-02); inside a
  // `.field` on the settings page it needs none.
  let { id = "language", class: className = "" }: { id?: string; class?: string } = $props();

  function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
    const value = event.currentTarget.value;
    if (isLanguage(value)) {
      setLanguage(value);
    }
  }
</script>

<select
  {id}
  class={className}
  value={language()}
  onchange={onChange}
  aria-label={t("language.label")}
>
  {#each languages as code (code)}
    <option value={code}>{t(`language.${code}`)}</option>
  {/each}
</select>
