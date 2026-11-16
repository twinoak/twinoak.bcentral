<script lang="ts">
  // One row of a row list (P3-04), shared by the journal (Timeline.svelte) and the handover
  // page: a line of cells on the list's columns that is one button — click it, or Enter or
  // Space on it, and the row opens in place; under the line, on the open row's surface, the
  // area the list puts there (the history with its times, the reply links, the action row or
  // a form). At rest the row is the line and nothing else, and the pointer changes only its
  // background (components.css `.rows`): no button appears, nothing grows. A click on a
  // control inside the line (a link) is the control's own, and a click that ends a text
  // selection inside the row does not toggle (lib/rowOpen.ts clickToggles). The line
  // carries aria-expanded and, while open, aria-controls to the area; a row with nothing to
  // open is a plain line. Which row is open is the list's state (one at a time,
  // lib/rowOpen.ts); this component only reports the toggle.
  import type { Snippet } from "svelte";
  import { clickToggles } from "../lib/rowOpen.ts";

  interface Props {
    // The entry (or batch) id: `data-entry-id` on the row, the area's id.
    id: string;
    type?: string;
    status?: string;
    // A recipient row inside an open send-to-all row.
    nested?: boolean;
    // Whether the row has anything to open; false makes it a plain line (the incident's own
    // status rows).
    openable?: boolean;
    open?: boolean;
    // Whether the open row shows its area (a send-to-all row with nothing to retry shows its
    // recipients and no area).
    hasArea?: boolean;
    // The keyboard cursor (aria-current, the accent-weak tint).
    current?: boolean;
    tabindex?: number;
    ontoggle?: () => void;
    onfocus?: () => void;
    line: Snippet;
    area?: Snippet;
  }

  const {
    id,
    type,
    status,
    nested = false,
    openable = true,
    open = false,
    hasArea = true,
    current = false,
    tabindex = 0,
    ontoggle,
    onfocus,
    line,
    area,
  }: Props = $props();

  let lineElement: HTMLDivElement | undefined = $state(undefined);
  const areaId = $derived(`row-area-${id}`);
  const showArea = $derived(open && hasArea && area !== undefined);

  function toggle() {
    if (openable) {
      ontoggle?.();
    }
  }

  function onclick(event: MouseEvent) {
    if (lineElement === undefined) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (clickToggles(target, window.getSelection(), lineElement)) {
      toggle();
    }
  }

  // Enter and Space on the line itself, as on a button; a key from a control inside the
  // area never reaches here (the area is outside the line).
  function onkeydown(event: KeyboardEvent) {
    if (event.target !== lineElement) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  }
</script>

<li
  data-entry-id={id}
  data-type={type}
  data-status={status}
  data-nested={nested ? "true" : undefined}
  data-open={open ? "true" : undefined}
  aria-current={current ? "true" : undefined}
>
  <div
    class="row-line"
    role="button"
    data-row={id}
    bind:this={lineElement}
    {tabindex}
    aria-expanded={openable ? open : undefined}
    aria-controls={showArea ? areaId : undefined}
    {onclick}
    {onkeydown}
    {onfocus}
  >
    {@render line()}
  </div>
  {#if showArea && area !== undefined}
    <div class="row-area" id={areaId}>
      {@render area()}
    </div>
  {/if}
</li>
