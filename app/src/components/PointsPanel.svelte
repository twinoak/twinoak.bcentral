<script lang="ts">
  // Points (P3-05): the staff's to-do list, in the journal's side column above Open items.
  // A card titled "Points (n open)" with a row per open point — the title, its age, the line
  // it was opened from (who and when) — oldest first, so the one that has waited longest is
  // on top; a click on a point scrolls the timeline to its origin row and opens it (the
  // parent's jump); Close on the row opens the reason field in place, under it. "Show
  // closed" lists the closed points under the open ones, newest closed first, each with its
  // reason and time, and a click jumps to the origin as well. Everything is derived from
  // the entries on every reload (store/journalView.ts pointsFor); the card holds nothing
  // but which row's close form is open and whether the closed ones show. The look is
  // components.css's `.rows` on `.rows-2`; this file lays nothing out of its own.
  import { t } from "../i18n/index.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { DIRECTION_GLYPH } from "../lib/journalRows.ts";
  import { formatDateTime, formatShortTime } from "../lib/journalText.ts";
  import { closedPoints, openPoints, type PointView } from "../store/journalView.ts";
  import type { JournalEntry } from "../store/types.ts";
  import Icon from "./Icon.svelte";

  interface Props {
    // Every point of the incident (journalView.ts pointsFor), oldest first.
    points: readonly PointView[];
    // Register entry id -> label, for the origin line.
    labels: ReadonlyMap<string, string>;
    // A click on a point: the parent scrolls to the origin entry and opens its row.
    onselect: (entryId: string) => void;
    // Close with the reason typed on the row.
    onclose: (point: JournalEntry, reason: string) => Promise<void>;
  }
  let { points, labels, onselect, onclose }: Props = $props();

  let showClosed = $state(false);
  // The point whose close form is open, and the reason typed in it.
  let closing: string | null = $state(null);
  let reason = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);
  // Ticks once a second: the ages move without a reload.
  let nowMs = $state(Date.now());

  const open = $derived(openPoints(points));
  const closed = $derived(closedPoints(points));

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function age(timestamp: string): string {
    return formatElapsed(nowMs - Date.parse(timestamp));
  }

  // The line the point was opened from: "← Hans · 19.43" for an incoming message, "→ Hans ·
  // 19.00" for an outgoing one, "Thomas · 19.06" for a note; empty when the origin is not
  // in the list.
  function originText(view: PointView): string {
    const origin = view.origin;
    if (origin === undefined) {
      return "";
    }
    const time = formatShortTime(origin.timestamp);
    if (origin.type === "message_in" || origin.type === "message_out") {
      const glyph = DIRECTION_GLYPH[origin.type === "message_in" ? "in" : "out"];
      return `${glyph} ${labels.get(origin.counterpartyId ?? "") ?? ""} · ${time}`;
    }
    return `${origin.operator} · ${time}`;
  }

  function jump(view: PointView) {
    if (view.point.refersTo !== undefined) {
      onselect(view.point.refersTo);
    }
  }

  function startClose(view: PointView) {
    closing = view.point.id;
    reason = "";
    error = null;
  }

  function cancelClose() {
    closing = null;
    reason = "";
    error = null;
  }

  async function close(view: PointView, event: SubmitEvent) {
    event.preventDefault();
    if (busy || reason.trim() === "") {
      return;
    }
    busy = true;
    error = null;
    try {
      await onclose(view.point, reason);
      closing = null;
      reason = "";
    } catch (failure) {
      error = t("journal.point.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" aria-labelledby="points-heading" data-points>
  <h2 id="points-heading" class="card-title" title={t("journal.points.help")}>
    <span
      >{t("journal.points.title")}
      <span class="count">({t("journal.points.openCount", { n: open.length })})</span></span
    >
    <button
      type="button"
      class="btn btn-quiet btn-compact"
      aria-pressed={showClosed}
      onclick={() => (showClosed = !showClosed)}
    >
      {showClosed ? t("journal.points.hideClosed") : t("journal.points.showClosed")}
    </button>
  </h2>
  {#if open.length === 0}
    <p class="msg">{t("journal.points.empty")}</p>
  {:else}
    <ol class="rows rows-2">
      {#each open as view (view.point.id)}
        <li data-point-id={view.point.id} data-state="open">
          <button
            type="button"
            class="row-button"
            title={view.origin?.text ?? ""}
            onclick={() => jump(view)}
          >
            <span class="row-body text">{view.title}</span>
            <span class="row-time" title={formatDateTime(view.openedAt)}>{age(view.openedAt)}</span>
            <span class="row-meta">{originText(view)}</span>
          </button>
          {#if closing === view.point.id}
            <form class="row-form no-print" onsubmit={(event) => close(view, event)}>
              <div class="field">
                <input
                  type="text"
                  placeholder={t("journal.manual.reason")}
                  aria-label={t("journal.manual.reason")}
                  bind:value={reason}
                />
              </div>
              <button type="submit" class="btn btn-primary" disabled={busy || reason.trim() === ""}>
                {t("journal.points.close")}
              </button>
              <button type="button" class="btn" onclick={cancelClose}>
                {t("journal.action.cancel")}
              </button>
              {#if error}
                <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
              {/if}
            </form>
          {:else}
            <span class="row-actions no-print">
              <button
                type="button"
                class="btn btn-quiet"
                disabled={busy}
                onclick={() => startClose(view)}
              >
                <Icon name="check" />{t("journal.points.close")}
              </button>
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if showClosed}
    <h3>{t("journal.points.closedTitle")}</h3>
    {#if closed.length === 0}
      <p class="msg">{t("journal.points.noneClosed")}</p>
    {:else}
      <ol class="rows rows-2" data-closed-points>
        {#each closed as view (view.point.id)}
          <li data-point-id={view.point.id} data-state="closed">
            <button
              type="button"
              class="row-button"
              title={view.origin?.text ?? ""}
              onclick={() => jump(view)}
            >
              <span class="row-body text">{view.title}</span>
              <span class="row-time" title={formatDateTime(view.closedAt ?? view.point.timestamp)}
                >{formatShortTime(view.closedAt ?? view.point.timestamp)}</span
              >
              <span class="row-meta"
                >{t("journal.points.closedAt", {
                  time: formatShortTime(view.closedAt ?? view.point.timestamp),
                  operator: view.closedBy ?? view.point.operator,
                  reason: view.reason ?? "",
                })}</span
              >
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</section>

<style>
  /* Layout only. */
  h3 {
    margin: var(--s-3) 0 var(--s-1);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .msg {
    margin: 0;
  }
</style>
