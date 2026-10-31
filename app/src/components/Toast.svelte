<script lang="ts">
  // The toast (P2-02): the one confirmation showing (lib/toast.svelte.ts), bottom left, with
  // a check. The live region is always in the page so a screen reader announces the text
  // when it appears; the toast itself comes and goes inside it.
  import { toast } from "../lib/toast.svelte.ts";
  import Icon from "./Icon.svelte";
</script>

<div role="status" aria-live="polite" class="no-print">
  {#if toast() !== null}
    <div class="toast"><Icon name="check" />{toast()}</div>
  {/if}
</div>
