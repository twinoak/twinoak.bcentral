<script lang="ts">
  // The front page: what this is and where to start (P1-09: an empty state that says what to
  // do next). The work happens under Journal; a new operator starts under Handover.
  import { t } from "../i18n/index.svelte.ts";
  import { hashFor } from "../lib/router.svelte.ts";
</script>

<h1>{t("home.title")}</h1>
<p>{t("home.intro")}</p>
<p>{t("home.start")}</p>
<p class="links">
  <a class="button" href={hashFor("journal")}>{t("nav.journal")}</a>
  <a class="button secondary" href={hashFor("handover")}>{t("nav.handover")}</a>
</p>
<p class="muted">{t("home.shortcuts")}</p>

<style>
  .links {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .muted {
    color: var(--muted);
  }
</style>
