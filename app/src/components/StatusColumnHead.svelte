<script lang="ts">
  // The status column's header (P3-03): three 13 px labels over the slots — Sent ·
  // Delivered · Confirmed — stuck to the top of the scrolling row list, so the column needs
  // no legend. The labels sit at the right on the column's own width (components.css
  // `.rows-head`, `.slots-head`); whatever the list wants at the left of the same line (the
  // journal's "N new" chip) is the children. Shown wherever the column is: the journal and
  // the handover's lists of outgoing messages.
  import type { Snippet } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { SLOT_NAMES } from "../lib/statusSlots.ts";

  interface Props {
    children?: Snippet;
  }

  const { children }: Props = $props();
</script>

<div class="rows-head">
  <div class="rows-top">
    {#if children !== undefined}
      {@render children()}
    {/if}
  </div>
  <!-- The labels are for the eye; every slot says its own sentence to assistive technology. -->
  <div class="slots slots-head" aria-hidden="true">
    {#each SLOT_NAMES as name (name)}
      <span class="slot" data-slot={name}>{t(`journal.slot.${name}`)}</span>
    {/each}
  </div>
</div>
