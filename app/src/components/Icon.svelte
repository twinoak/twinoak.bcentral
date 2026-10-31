<script lang="ts">
  // One inline icon from the set in lib/icons.ts (P2-01): 20 px, 1.75 px stroke,
  // currentColor, hidden from assistive technology unless it is given a label — an icon
  // beside a word is decoration for the reader of the word; an icon alone (an icon-only
  // button carries its own aria-label) names what it shows. components.css sizes `.icon`.
  import { ICON_SIZE, ICON_STROKE, ICONS, type IconName } from "../lib/icons.ts";

  interface Props {
    name: IconName;
    label?: string;
  }

  const { name, label }: Props = $props();
</script>

<svg
  class="icon"
  width={ICON_SIZE}
  height={ICON_SIZE}
  viewBox="0 0 {ICON_SIZE} {ICON_SIZE}"
  fill="none"
  stroke="currentColor"
  stroke-width={ICON_STROKE}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label === undefined ? undefined : "img"}
  aria-label={label}
  aria-hidden={label === undefined ? "true" : undefined}
  focusable="false"
>
  {#each ICONS[name] as d, index (index)}
    <path {d} />
  {/each}
</svg>
