<script lang="ts">
  // The status column of a row (P3-03): three fixed slots — sent · delivered · confirmed —
  // one symbol each, always in the same place, read at a glance down the list. The rule is
  // lib/statusSlots.ts over the message's strip and transport; the words of each slot's
  // tooltip (the time, "not yet", the attempt, the reason, "by hand") are
  // lib/journalText.ts's and go into `title` and `aria-label` only: no time is shown in the
  // list. A batch row shows a count per slot instead ("23/25") and, under them, the given-up
  // count with a cross when it is not zero. The slots are not focusable; the row is.
  // components.css lays the column out (`.slots`) and tints the symbols; incoming rows,
  // notes and corrections render nothing here, so their column is empty.
  import { countSlotText, slotText } from "../lib/journalText.ts";
  import { countSlots, statusSlots } from "../lib/statusSlots.ts";
  import { t } from "../i18n/index.svelte.ts";
  import type { BatchCounters, StripItem } from "../store/journalView.ts";
  import type { Transport } from "../store/types.ts";
  import SlotSymbol from "./SlotSymbol.svelte";

  interface Props {
    // A message's current run and transport: the three symbols.
    strip?: readonly StripItem[];
    transport?: Transport;
    // What the outbox or the queue is doing with the message right now; the detail of a
    // hollow sent slot or the clock. Null when nothing holds it.
    inflightText?: string | null;
    // A batch's counters instead: the three counts.
    counters?: BatchCounters;
  }

  const { strip, transport, inflightText = null, counters }: Props = $props();

  const slots = $derived(strip === undefined ? [] : statusSlots(strip, transport));
  const counts = $derived(counters === undefined ? [] : countSlots(counters));
</script>

{#if counters !== undefined}
  <span class="row-strip slots slots-counts" data-slots="counts">
    {#each counts as slot (slot.name)}
      {@const text = countSlotText(slot)}
      <span
        class="slot"
        data-slot={slot.name}
        data-tint={slot.tint}
        title={text}
        aria-label={text}
        role="img">{slot.n}/{slot.total}</span
      >
    {/each}
    {#if counters.givenUp > 0}
      {@const text = t("journal.batch.counter.given_up", { n: counters.givenUp })}
      <span
        class="slot slot-given-up"
        data-slot="given_up"
        data-tint="danger"
        title={text}
        aria-label={text}
        role="img"><SlotSymbol shape="cross" />{counters.givenUp}</span
      >
    {/if}
  </span>
{:else if strip !== undefined}
  <span class="row-strip slots" data-slots="message">
    {#each slots as slot (slot.name)}
      {@const text = slotText(slot, inflightText)}
      <span
        class="slot"
        data-slot={slot.name}
        data-shape={slot.shape}
        data-tint={slot.tint}
        title={text}
        aria-label={text}
        role="img"><SlotSymbol shape={slot.shape} /></span
      >
    {/each}
  </span>
{/if}
