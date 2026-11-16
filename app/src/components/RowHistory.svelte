<script lang="ts">
  // The history of an open row (P3-04; the list P2-03 put under an expanded row): a 14 px
  // list on the open row's surface with one line per transition of an outgoing message —
  // the time, what happened (the status with its reason or detail, a roger with the text it
  // came from), the operator — then, on a message the staff closed, the field's `Rn` that
  // arrived after the close ("R12 received 15.02, after close", P3-09: an ordinary incoming
  // entry, listed here by the exact match, a jump to its row), then the versions of a
  // corrected entry's text, the original first and every correction after it, each with its
  // time and operator (P3-02). Nothing when the row has no history. Shared by the journal
  // (Timeline.svelte) and the handover page; the words are lib/journalText.ts's, as on the
  // print page.
  import { t } from "../i18n/index.svelte.ts";
  import {
    formatDateTime,
    formatTime,
    historyDetail,
    lateRogerText,
    recordedBy,
    rogerSource,
  } from "../lib/journalText.ts";
  import { textVersions, type HistoryItem } from "../store/journalView.ts";
  import type { JournalEntry } from "../store/types.ts";

  interface Props {
    entry: JournalEntry;
    // The transitions of an outgoing message, oldest first; none on any other row.
    history?: readonly HistoryItem[];
    // The field's late rogers for a closed message (P3-09), oldest first; none otherwise.
    lateRogers?: readonly JournalEntry[];
    // The corrections of the entry, for its versions.
    corrections: readonly JournalEntry[];
    // Every entry of the incident by id, to resolve a roger's text (the incoming entry's id).
    byId: ReadonlyMap<string, JournalEntry>;
    // A jump to the entry a roger came from; without one the time is plain text.
    onjump?: (entryId: string) => void;
  }

  const { entry, history = [], lateRogers = [], corrections, byId, onjump }: Props = $props();

  const versions = $derived(textVersions(entry, corrections));
  const lines = $derived(history.length + lateRogers.length + versions.length);
</script>

{#if lines > 0}
  <div class="row-detail">
    <ul>
      {#each history as item (item.entry.id)}
        {@const source = rogerSource(item.entry, byId)}
        <li data-entry-id={item.entry.id}>
          <span class="row-time" title={formatDateTime(item.entry.timestamp)}
            >{formatTime(item.entry.timestamp)}</span
          >
          <span>
            {historyDetail(item.entry, byId)}
            {#if source !== undefined}
              {#if onjump !== undefined}
                <button type="button" class="btn-link" onclick={() => onjump(source.id)}>
                  {formatTime(source.timestamp)}
                </button>
              {:else}
                {formatTime(source.timestamp)}
              {/if}
            {/if}
          </span>
          <span class="row-meta">{item.entry.operator}</span>
        </li>
        {#each item.corrections as correctionOfItem (correctionOfItem.id)}
          <li data-entry-id={correctionOfItem.id} title={recordedBy(correctionOfItem)}>
            <span class="row-time">{formatTime(correctionOfItem.timestamp)}</span>
            <span>{t("journal.type.correction")}: {correctionOfItem.text ?? ""}</span>
            <span class="row-meta">{correctionOfItem.operator}</span>
          </li>
        {/each}
      {/each}
      <!-- A late roger (P3-09): the field's Rn that came after the staff closed the message,
           a jump to its row when the list can jump. -->
      {#each lateRogers as late (late.id)}
        <li data-entry-id={late.id} data-late-roger title={recordedBy(late)}>
          <span class="row-time">{formatTime(late.timestamp)}</span>
          <span>
            {#if onjump !== undefined}
              <button type="button" class="btn-link" onclick={() => onjump(late.id)}>
                {lateRogerText(late)}
              </button>
            {:else}
              {lateRogerText(late)}
            {/if}
          </span>
          <span class="row-meta">{late.operator}</span>
        </li>
      {/each}
      <!-- The versions of a corrected entry's text: the original, then every correction. -->
      {#each versions as version, index (version.id)}
        <li
          data-entry-id={index === 0 ? undefined : version.id}
          data-version={index === 0 ? "original" : "correction"}
          title={recordedBy(version)}
        >
          <span class="row-time">{formatTime(version.timestamp)}</span>
          <span
            >{index === 0 ? t("journal.correction.original") : t("journal.type.correction")}: {version.text ??
              ""}</span
          >
          <span class="row-meta">{version.operator}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
