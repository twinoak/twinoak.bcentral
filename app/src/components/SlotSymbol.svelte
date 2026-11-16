<script lang="ts">
  // One symbol of the status column's set (P3-03, lib/statusSlots.ts): a hollow circle, a
  // filled circle, a filled circle with a check, a hollow circle with a clock, a cross —
  // five shapes, so colour is never the only cue. Drawn on the icon set's 20 px grid with
  // its 1.75 px stroke in currentColor (the slot's tint is on the element around it); the
  // check is cut out of the filled circle in the surface colour. Hidden from assistive
  // technology: the slot that holds it carries the sentence.
  import { ICON_SIZE, ICON_STROKE } from "../lib/icons.ts";
  import type { SlotShape } from "../lib/statusSlots.ts";

  interface Props {
    shape: SlotShape;
  }

  const { shape }: Props = $props();

  // The hollow ring's outer edge and the filled disc's edge coincide, so a slot keeps its
  // size whichever it shows.
  const RING = 6;
  const DISC = RING + ICON_STROKE / 2;
</script>

<svg
  class="icon slot-symbol"
  data-shape={shape}
  width={ICON_SIZE}
  height={ICON_SIZE}
  viewBox="0 0 {ICON_SIZE} {ICON_SIZE}"
  fill="none"
  stroke="currentColor"
  stroke-width={ICON_STROKE}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if shape === "hollow" || shape === "clock"}
    <circle cx="10" cy="10" r={RING} />
  {:else if shape === "filled" || shape === "check"}
    <circle cx="10" cy="10" r={DISC} fill="currentColor" stroke="none" />
  {/if}
  {#if shape === "clock"}
    <path d="M10 6.75V10l2.4 1.5" />
  {:else if shape === "check"}
    <path d="M6.6 10.3l2.3 2.3 4.5-4.8" class="slot-cutout" />
  {:else if shape === "cross"}
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
  {/if}
</svg>
