<script lang="ts">
  // One popover (P2-02, docs/design.md §Components): a title line, a sentence or two, one
  // action — opened from a chip in the top bar. components.css places it under its chip:
  // the chip's button and this sit together in a `.popover-host`. Closed by Esc (the cancel
  // shortcut, registered while open so it is asked before any form's handler), by a click
  // outside the host, or by the chip's own button; `onclose` is the parent's, which also
  // puts the focus back on the chip. On open the focus moves to the first control inside,
  // so the action is one Enter (or Space, for the clock's checkbox) away.
  import type { Snippet } from "svelte";
  import { onShortcut } from "../lib/shortcutDispatch.ts";

  export interface PopoverAction {
    label: string;
    onclick: () => void;
    disabled?: boolean;
  }

  interface Props {
    id: string;
    title: string;
    sentences?: readonly string[];
    // The one action button; the clock popover has none (its checkbox is in `children`).
    action?: PopoverAction | null;
    children?: Snippet;
    onclose: () => void;
  }
  let { id, title, sentences = [], action = null, children, onclose }: Props = $props();

  let element: HTMLDivElement | undefined = $state(undefined);

  $effect(() => {
    if (element === undefined) {
      return;
    }
    const host = element.parentElement;
    element.querySelector<HTMLElement>("input, select, textarea, button, a[href]")?.focus();
    function onPointerDown(event: PointerEvent) {
      if (host !== null && !host.contains(event.target as Node)) {
        onclose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    const off = onShortcut("cancel", () => {
      onclose();
      return true;
    });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      off();
    };
  });
</script>

<div class="popover" role="dialog" aria-labelledby="{id}-title" bind:this={element}>
  <h2 class="popover-title" id="{id}-title">{title}</h2>
  {#each sentences as sentence, index (index)}
    <p>{sentence}</p>
  {/each}
  {@render children?.()}
  {#if action !== null}
    <div class="popover-actions">
      <button
        type="button"
        class="btn btn-primary"
        disabled={action.disabled}
        onclick={action.onclick}
      >
        {action.label}
      </button>
    </div>
  {/if}
</div>
