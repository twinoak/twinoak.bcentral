<script lang="ts">
  // The incident's journal as a list of message slips (P0-07, reshaped in P1-01, on the row
  // list in P2-03): one row per entry, newest on top, laid on the columns time | who | body |
  // status. An outgoing message carries its status in the fixed column at the right (P3-03,
  // StatusSlots.svelte): three slots — sent · delivered · confirmed — one symbol each under
  // the header's labels, the times in the slots' tooltips and nowhere else in the list.
  // Incoming and outgoing are told apart by the glyph before the counterparty (→ out, ← in)
  // and by the counterparty itself; an incoming row, a note and a correction leave the
  // column empty. The messages of one send-to-all are one row with a count per slot. A
  // corrected entry reads its latest correction's text as its text, with a "corrected" chip
  // after the time (P3-02). The view stays at the top unless the operator scrolled down;
  // then new rows arrive above without moving the viewport and a "N new" chip, on the
  // column header stuck to the top of the box, jumps back up.
  //
  // A row at rest is one line and stays one line under the pointer (P3-04). Clicking it (a
  // click on a link or one that ends a text selection does not count) opens it in place:
  // under the line appear its history with the times and operators (RowHistory.svelte), the
  // "answers" / "answered" links of a reply (P1-02), the point line when the entry has a
  // point (P3-05), and the action row — quiet buttons for exactly the actions that apply
  // (lib/rowActions.ts): the point action first (Open point, Close point or Reopen point by
  // the point's state), then Retry or Send, Mark, Correct on an outgoing message, Reply and
  // Correct on an incoming one, Correct on a note; a send-to-all row opens into one row per
  // recipient, each with its own actions, and "Retry all given up" when any can be; its
  // point is its first message's. One row is open at a time (lib/rowOpen.ts): opening
  // another closes the first, the open row's own line closes it, Esc closes. The Mark form
  // (a manual status with a required reason), the Correct form (one box with the current
  // text, the "#n " of a message fixed in front of it, lib/correctionForm.ts, P3-02), the
  // Open point form (one box with the title, prefilled from the text, lib/pointTitle.ts) and
  // the Close point form (a required reason) replace the action row while they are open;
  // cancelling brings it back. A line that has a point shows a small glyph after the time
  // (filled and accent while open, hollow and ink-2 once closed) with the title as its
  // tooltip. Nothing appears on hover, and there is no history toggle: the click is the
  // whole interface.
  //
  // Keyboard (P1-09): one row is the current row (accent-weak); J / K move it (and the
  // focus) down and up, Enter or Space opens or closes it (Row.svelte), R replies to it when
  // it is incoming, P does the row's point action (the row opens on the form when one is
  // needed), Esc closes a form, then the open row. The rows are one tab stop (roving
  // tabindex): Tab lands on the current row, J / K walk. The look is components.css's
  // `.rows`; this file lays nothing out of its own.
  import { tick } from "svelte";
  import { t } from "../i18n/index.svelte.ts";
  import {
    canSaveCorrection,
    correctedText,
    correctionForm as buildCorrectionForm,
    type CorrectionForm,
  } from "../lib/correctionForm.ts";
  import { DIRECTION_GLYPH, POINT_GLYPH } from "../lib/journalRows.ts";
  import { batchText, formatShortTime, formatTime, recordedBy } from "../lib/journalText.ts";
  import { suggestedTitle } from "../lib/pointTitle.ts";
  import { batchActions, entryActions, messageActions, pointAction } from "../lib/rowActions.ts";
  import {
    CLOSED,
    closeOne,
    isOpen,
    openRowId,
    revealRow,
    toggleRow,
    type OpenState,
    type RowPlace,
  } from "../lib/rowOpen.ts";
  import { onShortcut } from "../lib/shortcutDispatch.ts";
  import {
    bodyOf,
    countNewRows,
    currentText,
    findRow,
    textVersions,
    type MessageView,
    type PointView,
    type TimelineRow,
  } from "../store/journalView.ts";
  import { manualStatusesFor } from "../store/outgoing.ts";
  import type { JournalEntry, Status } from "../store/types.ts";
  import Icon from "./Icon.svelte";
  import Row from "./Row.svelte";
  import RowHistory from "./RowHistory.svelte";
  import StatusColumnHead from "./StatusColumnHead.svelte";
  import StatusSlots from "./StatusSlots.svelte";

  interface Props {
    rows: readonly TimelineRow[];
    // Register entry id -> label.
    labels: ReadonlyMap<string, string>;
    // Every entry of the incident by id, to resolve a roger's text (the incoming entry's id).
    byId: ReadonlyMap<string, JournalEntry>;
    // The point opened from each entry, by the origin entry's id (P3-05).
    points: ReadonlyMap<string, PointView>;
    // What the outbox or the queue is doing with a message right now, or null when neither
    // holds it.
    inflight: (messageId: string) => string | null;
    canRetry: (message: JournalEntry) => boolean;
    onretry: (message: JournalEntry) => void;
    onmanual: (message: JournalEntry, status: Status, reason: string) => Promise<void>;
    // A correction of `entry` (always the original entry of a row) with the whole corrected
    // text.
    oncorrect: (entry: JournalEntry, text: string) => Promise<void>;
    // Reply to an incoming message: the parent hands it to the compose form.
    onreply: (entry: JournalEntry) => void;
    // The three point writes (P3-05): a point opened from `origin` with the title, a point
    // closed with the reason, a point reopened.
    onopenpoint: (origin: JournalEntry, title: string) => Promise<void>;
    onclosepoint: (point: JournalEntry, reason: string) => Promise<void>;
    onreopenpoint: (point: JournalEntry) => Promise<void>;
  }
  let {
    rows,
    labels,
    byId,
    points,
    inflight,
    canRetry,
    onretry,
    onmanual,
    oncorrect,
    onreply,
    onopenpoint,
    onclosepoint,
    onreopenpoint,
  }: Props = $props();

  // Undefined before the box is mounted, null once it is gone (a scroll event can still
  // arrive in that frame).
  let box: HTMLDivElement | null | undefined = $state(undefined);
  // True while the view is at the top; a scroll down turns it off, a scroll back up on.
  let stickToTop = $state(true);
  // The row ids on the timeline when the operator scrolled down; rows not in it are new.
  let seen: ReadonlySet<string> | null = $state.raw(null);
  // Which row is open, and which batch shows its recipients (lib/rowOpen.ts).
  let opened: OpenState = $state.raw(CLOSED);
  // The current row for the keyboard (an entry id, or a batch id), or null before J / K, a
  // focus or a jump from a side card set one.
  let cursor: string | null = $state(null);

  // Which row has its correction form or its status form open, and the texts typed in them.
  // The correction form: what the box opened with (the prefix and the current text) and the
  // body as typed.
  let correcting: string | null = $state(null);
  let correction: CorrectionForm | null = $state.raw(null);
  let correctionBody = $state("");
  let correctionField: HTMLTextAreaElement | undefined = $state(undefined);
  let changingStatus: string | null = $state(null);
  let reason = $state("");
  // The row (its origin entry's id) whose Open point form or Close point form is open, and
  // what is typed in it (P3-05).
  let pointing: string | null = $state(null);
  let pointTitle = $state("");
  let pointField: HTMLInputElement | undefined = $state(undefined);
  let closingPoint: string | null = $state(null);
  let pointReason = $state("");
  let error: string | null = $state(null);
  let busy = $state(false);

  const AT_TOP_SLACK_PX = 8;

  const newCount = $derived(seen === null ? 0 : countNewRows(rows, seen));
  // Save is disabled while the text is unchanged or empty.
  const canSave = $derived(correction !== null && canSaveCorrection(correction, correctionBody));

  // Where every row sits: a batch, a recipient inside one, or a plain row.
  const places = $derived.by(() => {
    const map = new Map<string, RowPlace>();
    for (const row of rows) {
      if (row.kind === "batch") {
        map.set(row.id, { batch: true, parent: null });
        for (const view of row.messages) {
          map.set(view.entry.id, { batch: false, parent: row.id });
        }
      } else {
        map.set(row.id, { batch: false, parent: null });
      }
    }
    return map;
  });

  function isRowOpen(id: string): boolean {
    const place = places.get(id);
    return place !== undefined && isOpen(opened, id, place);
  }

  function onscroll() {
    if (box === undefined || box === null) {
      return;
    }
    if (box.scrollTop <= AT_TOP_SLACK_PX) {
      stickToTop = true;
      seen = null;
    } else if (stickToTop) {
      stickToTop = false;
      seen = new Set(rows.map((row) => row.id));
    }
  }

  function jumpToTop() {
    stickToTop = true;
    seen = null;
    if (box !== undefined && box !== null) {
      box.scrollTop = 0;
    }
  }

  function lineOf(id: string): HTMLElement | null {
    return box?.querySelector<HTMLElement>(`.row-line[data-row="${id}"]`) ?? null;
  }

  function focusRow(id: string) {
    lineOf(id)?.focus({ preventScroll: true });
  }

  // A jump from a side card or a reply mark: the row that shows the entry opens and becomes
  // the current row (a batch on the recipient that holds the entry), and the entry is
  // scrolled into the middle.
  export async function scrollToEntry(id: string): Promise<void> {
    const row = findRow(rows, id);
    if (row === undefined) {
      return;
    }
    opened = revealRow(row, id);
    resetForms();
    cursor = opened.row ?? row.id;
    await tick();
    const target = box?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
    target?.scrollIntoView({ block: "center" });
    focusRow(cursor);
  }

  // A click, Enter or Space on a row's line: the row opens or closes (one at a time); any
  // form goes with the row that held it. The list scrolls only to keep the line in view.
  async function toggle(id: string) {
    const place = places.get(id);
    if (place === undefined) {
      return;
    }
    opened = toggleRow(opened, id, place);
    resetForms();
    await tick();
    lineOf(id)?.scrollIntoView({ block: "nearest" });
  }

  // --- the keyboard cursor ------------------------------------------------------------------

  function rowElements(): HTMLElement[] {
    if (box === undefined || box === null) {
      return [];
    }
    return [...box.querySelectorAll<HTMLElement>(".row-line[data-row]")];
  }

  // The first row is the tab stop until a cursor is set.
  function rowTabIndex(id: string): number {
    const firstId = rows[0]?.id;
    return (cursor ?? firstId) === id ? 0 : -1;
  }

  // The row the keys act on: the focused row when the focus is on one, else the cursor row.
  function currentRowId(): string | null {
    const active = document.activeElement;
    if (
      box !== undefined &&
      box !== null &&
      active instanceof HTMLElement &&
      box.contains(active)
    ) {
      const row = active.closest<HTMLElement>(".row-line[data-row]");
      if (row !== null && active === row) {
        return row.dataset["row"] ?? null;
      }
    }
    return cursor;
  }

  function move(delta: number): boolean {
    const elements = rowElements();
    if (elements.length === 0) {
      return false;
    }
    const index = elements.findIndex((row) => row.dataset["row"] === cursor);
    const next = index === -1 ? 0 : Math.min(elements.length - 1, Math.max(0, index + delta));
    const row = elements[next];
    if (row === undefined) {
      return false;
    }
    cursor = row.dataset["row"] ?? null;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
    return true;
  }

  function replyCurrent(): boolean {
    const id = currentRowId();
    const entry = id === null ? undefined : byId.get(id);
    if (entry === undefined || entry.type !== "message_in") {
      return false;
    }
    onreply(entry);
    return true;
  }

  // The entry a row's point refers to: the row's own entry (a batch's first message), or a
  // recipient's message inside an open batch.
  function originOf(id: string): JournalEntry | undefined {
    return rows.find((row) => row.id === id)?.entry ?? byId.get(id);
  }

  // P: the current row's one point action (lib/rowActions.ts pointAction) — the row opens
  // when it is closed, so the form has a place; a row that cannot carry a point (the
  // incident's own status rows) is left alone.
  function pointCurrent(): boolean {
    const id = currentRowId();
    const origin = id === null ? undefined : originOf(id);
    const place = id === null ? undefined : places.get(id);
    if (id === null || origin === undefined || place === undefined || !canHavePoint(origin)) {
      return false;
    }
    if (!isRowOpen(id)) {
      opened = toggleRow(opened, id, place);
      resetForms();
    }
    void runPointAction(origin);
    return true;
  }

  // Esc belongs to the list while the focus is in it or nowhere; in a compose field it is
  // the form's (a reply link to drop).
  function focusInBox(): boolean {
    const active = document.activeElement;
    return (
      active === null ||
      active === document.body ||
      (box !== undefined && box !== null && box.contains(active))
    );
  }

  function closeCurrent(): boolean {
    if (
      correcting !== null ||
      changingStatus !== null ||
      pointing !== null ||
      closingPoint !== null
    ) {
      cancelForms();
      return true;
    }
    const id = openRowId(opened);
    if (id === null || !focusInBox()) {
      return false;
    }
    opened = closeOne(opened);
    void tick().then(() => focusRow(id));
    return true;
  }

  $effect(() => {
    const offs = [
      onShortcut("nextRow", () => move(1)),
      onShortcut("previousRow", () => move(-1)),
      onShortcut("reply", replyCurrent),
      onShortcut("point", pointCurrent),
      onShortcut("cancel", closeCurrent),
    ];
    return () => {
      for (const off of offs) {
        off();
      }
    };
  });

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function label(entry: JournalEntry): string {
    return labels.get(entry.counterpartyId ?? "") ?? "";
  }

  // The latest correction of an entry, for the chip's tooltip; undefined when none.
  function latestCorrection(
    entry: JournalEntry,
    corrections: readonly JournalEntry[],
  ): JournalEntry | undefined {
    const versions = textVersions(entry, corrections);
    return versions.length > 1 ? versions[versions.length - 1] : undefined;
  }

  // Correct: the row's text becomes the box, prefilled with the current text, the cursor at
  // its end. The row's own entry is the target, also when it was corrected before.
  async function startCorrection(entry: JournalEntry, corrections: readonly JournalEntry[]) {
    resetForms();
    correction = buildCorrectionForm(entry, corrections);
    correctionBody = correction.body;
    correcting = entry.id;
    await tick();
    const field = correctionField;
    if (field !== undefined) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }

  function startStatus(entry: JournalEntry) {
    resetForms();
    changingStatus = entry.id;
    reason = "";
  }

  // The forms go when the row they sit in opens or closes.
  function resetForms() {
    correcting = null;
    correction = null;
    changingStatus = null;
    pointing = null;
    closingPoint = null;
    error = null;
  }

  // Cancel in a form: back to the action row, the focus on the row's line.
  function cancelForms() {
    const rowId = correcting ?? changingStatus ?? pointing ?? closingPoint;
    resetForms();
    if (rowId !== null) {
      void tick().then(() => focusRow(rowId));
    }
  }

  async function saveCorrection(event: SubmitEvent) {
    event.preventDefault();
    const form = correction;
    if (form === null || !canSave || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await oncorrect(form.target, correctedText(form, correctionBody));
      correcting = null;
      correction = null;
      correctionBody = "";
      await tick();
      focusRow(form.target.id);
    } catch (failure) {
      error = t("journal.correction.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function saveStatus(message: JournalEntry, status: Status) {
    if (reason.trim() === "" || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await onmanual(message, status, reason);
      changingStatus = null;
      reason = "";
      await tick();
      focusRow(message.id);
    } catch (failure) {
      error = t("send.manual.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  // --- points (P3-05) ------------------------------------------------------------------------

  // A note, an incoming or an outgoing message can be the origin of a point; the incident's
  // own status rows and an orphan correction cannot (store/points.ts refuses them too).
  function canHavePoint(entry: JournalEntry): boolean {
    return entry.type === "note" || entry.type === "message_in" || entry.type === "message_out";
  }

  // Open point: the one-field form in place of the action row, prefilled with the entry's
  // text (a message's body without its "#n "), the cursor at its end.
  async function startPoint(origin: JournalEntry) {
    resetForms();
    const text = currentText(origin, correctionsOf(origin));
    pointTitle = suggestedTitle(origin.type === "message_out" ? bodyOf({ ...origin, text }) : text);
    pointing = origin.id;
    await tick();
    const field = pointField;
    if (field !== undefined) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }

  function startClosePoint(origin: JournalEntry) {
    resetForms();
    closingPoint = origin.id;
    pointReason = "";
  }

  // The row's one point action, from the button or from P: the form for opening or closing,
  // the write at once for reopening.
  async function runPointAction(origin: JournalEntry) {
    const point = points.get(origin.id);
    switch (pointAction(point?.state)) {
      case "openPoint":
        await startPoint(origin);
        break;
      case "closePoint":
        startClosePoint(origin);
        break;
      case "reopenPoint":
        if (point !== undefined) {
          await writePoint(origin.id, () => onreopenpoint(point.point));
        }
        break;
    }
  }

  async function savePoint(origin: JournalEntry, event: SubmitEvent) {
    event.preventDefault();
    if (pointTitle.trim() === "") {
      return;
    }
    await writePoint(origin.id, () => onopenpoint(origin, pointTitle));
  }

  async function saveClosePoint(point: PointView, event: SubmitEvent) {
    event.preventDefault();
    if (pointReason.trim() === "") {
      return;
    }
    await writePoint(point.point.refersTo ?? "", () => onclosepoint(point.point, pointReason));
  }

  // One write, then the forms gone and the focus back on the row's line; a refused write
  // stays on the row as its error.
  async function writePoint(rowId: string, write: () => Promise<void>) {
    if (busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await write();
      pointing = null;
      closingPoint = null;
      pointTitle = "";
      pointReason = "";
      await tick();
      focusRow(rowId);
    } catch (failure) {
      error = t("journal.point.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  // The corrections of an entry, off its row (the row's own, or a recipient's view).
  function correctionsOf(entry: JournalEntry): readonly JournalEntry[] {
    const row = findRow(rows, entry.id);
    if (row === undefined) {
      return [];
    }
    if (row.kind === "entry") {
      return row.corrections;
    }
    const views = row.kind === "message" ? [row.message] : row.messages;
    return views.find((view) => view.entry.id === entry.id)?.corrections ?? [];
  }

  function glyphText(point: PointView): string {
    return t(`journal.point.glyph.${point.state}`, { title: point.title });
  }

  // The given-up recipients of a batch the page's rule lets the operator retry.
  function retryable(views: readonly MessageView[]): MessageView[] {
    return views.filter((view) => view.status === "given_up" && canRetry(view.entry));
  }

  // Retry all given up: each one handed to the outbox, which sends them in turn.
  function retryAll(views: readonly MessageView[]) {
    for (const view of views) {
      onretry(view.entry);
    }
  }
</script>

<!-- The time, with the clock-trust mark: a "?" for unknown, a "✓" for manual, nothing for
     ntp; the sentence from the settings as its tooltip. After it, on a corrected entry, the
     "corrected" chip with the latest correction's time and operator as its tooltip, and on a
     line that has a point its glyph with the title as its tooltip (P3-05; a recipient row
     inside a batch leaves the batch's point to the batch line). -->
{#snippet timeCell(entry: JournalEntry, corrections: readonly JournalEntry[], withPoint: boolean)}
  {@const latest = latestCorrection(entry, corrections)}
  {@const point = withPoint ? points.get(entry.id) : undefined}
  <span class="row-time" title={recordedBy(entry)}>
    {formatTime(entry.timestamp)}{#if entry.clockTrust !== "ntp"}<abbr
        class="row-trust"
        data-trust={entry.clockTrust}
        title={t(`settings.clockTrust.${entry.clockTrust}`)}
        >{t(`journal.trust.${entry.clockTrust}`)}</abbr
      >{/if}{#if latest !== undefined}<span
        class="chip"
        data-corrected={latest.id}
        title={t("journal.correction.correctedBy", {
          time: formatShortTime(latest.timestamp),
          operator: latest.operator,
        })}><Icon name="edit" />{t("journal.correction.corrected")}</span
      >{/if}{#if point !== undefined}<span
        class="row-point"
        data-state={point.state}
        data-point-id={point.point.id}
        role="img"
        title={glyphText(point)}
        aria-label={glyphText(point)}>{POINT_GLYPH[point.state]}</span
      >{/if}
  </span>
{/snippet}

<!-- The counterparty with the direction glyph in front; the transport after it when it is
     not the radio. -->
{#snippet whoCell(entry: JournalEntry, direction: "out" | "in", name: string)}
  <span class="row-who">
    <span class="row-dir" aria-hidden="true">{DIRECTION_GLYPH[direction]}</span><span
      class="visually-hidden"
      >{t(`journal.type.message_${direction}`)}
    </span>{name}
    {#if entry.transport !== undefined && entry.transport !== "mesh"}
      <span class="row-meta">· {t(`send.transport.${entry.transport}`)}</span>
    {/if}
  </span>
{/snippet}

{#snippet correctButton(entry: JournalEntry, corrections: readonly JournalEntry[])}
  <button type="button" class="btn btn-quiet" onclick={() => startCorrection(entry, corrections)}>
    {t("journal.action.correct")}
  </button>
{/snippet}

<!-- The point line of an open row that has a point (P3-05): the glyph, the title, when it
     was opened — or closed, by whom and why. -->
{#snippet pointLine(point: PointView)}
  <p class="row-point-line" data-point-state={point.state}>
    <span class="row-point" data-state={point.state} aria-hidden="true"
      >{POINT_GLYPH[point.state]}</span
    >
    {#if point.state === "open"}
      {t("journal.point.line.open", {
        title: point.title,
        time: formatShortTime(point.openedAt),
        operator: point.point.operator,
      })}
    {:else}
      {t("journal.point.line.closed", {
        title: point.title,
        time: formatShortTime(point.closedAt ?? point.point.timestamp),
        operator: point.closedBy ?? point.point.operator,
        reason: point.reason ?? "",
      })}
    {/if}
  </p>
{/snippet}

<!-- The row's one point action, first on the action line: Open point while the entry has no
     point, Close point while its point is open, Reopen point once it is closed. -->
{#snippet pointButton(origin: JournalEntry)}
  {@const action = pointAction(points.get(origin.id)?.state)}
  <button
    type="button"
    class="btn btn-quiet"
    data-point-action={action}
    disabled={busy}
    onclick={() => runPointAction(origin)}
  >
    {#if action === "openPoint"}
      {t("journal.point.open")}
    {:else if action === "closePoint"}
      <Icon name="check" />{t("journal.point.close")}
    {:else}
      <Icon name="retry" />{t("journal.point.reopen")}
    {/if}
  </button>
{/snippet}

<!-- The Open point form, in place of the action row: the one box with the title, prefilled
     from the entry's text, Save (disabled while empty), Cancel; Esc cancels. -->
{#snippet pointForm(origin: JournalEntry)}
  <form class="row-form" data-point-form="open" onsubmit={(event) => savePoint(origin, event)}>
    <label class="row-meta" for="point-title">{t("journal.point.title")}</label>
    <div class="field field-grow">
      <input id="point-title" type="text" bind:this={pointField} bind:value={pointTitle} />
    </div>
    <button type="submit" class="btn btn-primary" disabled={busy || pointTitle.trim() === ""}>
      {t("journal.action.save")}
    </button>
    <button type="button" class="btn" onclick={cancelForms}>{t("journal.action.cancel")}</button>
    {#if error}
      <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
    {/if}
  </form>
{/snippet}

<!-- The Close point form, in place of the action row: the reason (required), Close point,
     Cancel. -->
{#snippet closePointForm(point: PointView)}
  <form class="row-form" data-point-form="close" onsubmit={(event) => saveClosePoint(point, event)}>
    <div class="field">
      <input
        type="text"
        placeholder={t("journal.manual.reason")}
        aria-label={t("journal.manual.reason")}
        bind:value={pointReason}
      />
    </div>
    <button type="submit" class="btn btn-primary" disabled={busy || pointReason.trim() === ""}>
      <Icon name="check" />{t("journal.point.close")}
    </button>
    <button type="button" class="btn" onclick={cancelForms}>{t("journal.action.cancel")}</button>
    {#if error}
      <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
    {/if}
  </form>
{/snippet}

<!-- The correction form, in the open row's area in place of the action row while the row's
     own text is hidden (one copy on screen): the label, the fixed "#n " of a message, the
     one box with the current text taking the width, Save (disabled while the text is
     unchanged or empty), Cancel; Esc cancels. -->
{#snippet correctionForm()}
  {#if correction !== null}
    <form class="row-form" onsubmit={saveCorrection}>
      <label class="row-meta" for="correction-text">{t("journal.correction.text")}</label>
      {#if correction.prefix !== ""}
        <span data-prefix>{correction.prefix.trimEnd()}</span>
      {/if}
      <div class="field field-grow">
        <textarea
          id="correction-text"
          rows="1"
          bind:this={correctionField}
          bind:value={correctionBody}
        ></textarea>
      </div>
      <button type="submit" class="btn btn-primary" disabled={busy || !canSave}>
        {t("journal.action.save")}
      </button>
      <button type="button" class="btn" onclick={cancelForms}>{t("journal.action.cancel")}</button>
      {#if error}
        <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
      {/if}
    </form>
  {/if}
{/snippet}

<!-- The Mark form: the reason, one button per status the operator may set by hand on the
     message's transport, Cancel. -->
{#snippet statusForm(entry: JournalEntry)}
  {#if entry.transport !== undefined}
    <div class="row-form">
      <div class="field">
        <input
          type="text"
          placeholder={t("journal.manual.reason")}
          aria-label={t("journal.manual.reason")}
          bind:value={reason}
        />
      </div>
      {#each manualStatusesFor(entry.transport) as next (next)}
        <button
          type="button"
          class="btn"
          disabled={busy || reason.trim() === ""}
          onclick={() => saveStatus(entry, next)}
        >
          {t(`send.manual.${next}`)}
        </button>
      {/each}
      <button type="button" class="btn btn-quiet" onclick={cancelForms}
        >{t("journal.action.cancel")}</button
      >
      {#if error}
        <span class="field-error" role="alert"><Icon name="warning" />{error}</span>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- An outgoing message: the line with its status slots; open, its history (the transitions,
     then the text's versions), the incoming message it answers, its point line, and its
     actions or its form. `nested` marks a recipient row inside a batch, whose point is the
     batch's (shown on the batch row, not here). -->
{#snippet messageRow(view: MessageView, nested: boolean)}
  {@const entry = view.entry}
  {@const inflightText = inflight(entry.id)}
  {@const point = nested ? undefined : points.get(entry.id)}
  {@const actions = messageActions({
    transport: entry.transport,
    status: view.status,
    canRetry: canRetry(entry),
    inflight: inflightText !== null,
  })}
  <Row
    id={entry.id}
    type="message_out"
    {nested}
    open={isRowOpen(entry.id)}
    current={cursor === entry.id}
    tabindex={rowTabIndex(entry.id)}
    ontoggle={() => toggle(entry.id)}
    onfocus={() => (cursor = entry.id)}
  >
    {#snippet line()}
      {@render timeCell(entry, view.corrections, !nested)}
      {@render whoCell(entry, "out", label(entry))}
      <div class="row-body">
        {#if correcting !== entry.id}{currentText(entry, view.corrections)}{/if}
      </div>
      <StatusSlots strip={view.strip} transport={entry.transport} {inflightText} />
    {/snippet}
    {#snippet area()}
      <RowHistory
        {entry}
        history={view.history}
        corrections={view.corrections}
        {byId}
        onjump={scrollToEntry}
      />
      {#if view.answers !== null}
        {@const answers = view.answers}
        <p class="row-links">
          <button
            type="button"
            class="btn-link"
            title={answers.text ?? ""}
            onclick={() => scrollToEntry(answers.id)}
          >
            {t("journal.reply.answers", { time: formatShortTime(answers.timestamp) })}
          </button>
        </p>
      {/if}
      {#if point !== undefined}
        {@render pointLine(point)}
      {/if}
      {#if changingStatus === entry.id}
        {@render statusForm(entry)}
      {:else if correcting === entry.id}
        {@render correctionForm()}
      {:else if pointing === entry.id}
        {@render pointForm(entry)}
      {:else if closingPoint === entry.id && point !== undefined}
        {@render closePointForm(point)}
      {:else}
        <div class="row-actions">
          {#if !nested}
            {@render pointButton(entry)}
          {/if}
          {#if actions.includes("retry") || actions.includes("send")}
            <button type="button" class="btn btn-quiet" onclick={() => onretry(entry)}>
              <Icon name="retry" />{actions.includes("retry") ? t("send.retry") : t("send.sendNow")}
            </button>
          {/if}
          {#if actions.includes("mark")}
            <button type="button" class="btn btn-quiet" onclick={() => startStatus(entry)}>
              <Icon name="check" />{t("journal.action.status")}
            </button>
          {/if}
          {@render correctButton(entry, view.corrections)}
        </div>
      {/if}
    {/snippet}
  </Row>
{/snippet}

<div class="rows-box timeline" bind:this={box} {onscroll}>
  {#if rows.length === 0}
    <div class="empty"><p>{t("journal.entries.empty")}</p></div>
  {:else}
    <!-- The column header stuck to the top of the box; the "N new" chip at its left. -->
    <StatusColumnHead>
      {#if newCount > 0}
        <button type="button" class="chip chip-accent" onclick={jumpToTop}
          >{t("journal.timeline.newRows", { n: newCount })}</button
        >
      {/if}
    </StatusColumnHead>
    <ol class="rows">
      {#each rows as row (row.id)}
        {#if row.kind === "message"}
          {@render messageRow(row.message, false)}
        {:else if row.kind === "batch"}
          {@const open = isRowOpen(row.id)}
          {@const point = points.get(row.entry.id)}
          {@const canRetryAll = retryable(row.messages)}
          {@const actions = batchActions(canRetryAll.length)}
          <!-- A send-to-all: the line with a count per slot; open, its point line and action
               row — the point (its first message's) and "Retry all given up" when any can
               be — then one row per recipient with its own line and area. -->
          <Row
            id={row.id}
            type="batch"
            {open}
            current={cursor === row.id}
            tabindex={rowTabIndex(row.id)}
            ontoggle={() => toggle(row.id)}
            onfocus={() => (cursor = row.id)}
          >
            {#snippet line()}
              {@render timeCell(row.entry, [], true)}
              {@render whoCell(
                row.entry,
                "out",
                t("journal.batch.toAll", { count: row.counters.total }),
              )}
              <span class="row-body">{batchText(row.body, row.drill)}</span>
              <StatusSlots counters={row.counters} />
            {/snippet}
            {#snippet area()}
              {#if point !== undefined}
                {@render pointLine(point)}
              {/if}
              {#if pointing === row.entry.id}
                {@render pointForm(row.entry)}
              {:else if closingPoint === row.entry.id && point !== undefined}
                {@render closePointForm(point)}
              {:else}
                <div class="row-actions">
                  {@render pointButton(row.entry)}
                  {#if actions.includes("retryAll")}
                    <button
                      type="button"
                      class="btn btn-quiet"
                      onclick={() => retryAll(canRetryAll)}
                    >
                      <Icon name="retry" />{t("queue.retryAll", { count: canRetryAll.length })}
                    </button>
                  {/if}
                </div>
              {/if}
            {/snippet}
          </Row>
          {#if open}
            {#each row.messages as view (view.entry.id)}
              {@render messageRow(view, true)}
            {/each}
          {/if}
        {:else}
          {@const entry = row.entry}
          {@const incoming = entry.type === "message_in"}
          {@const pointable = canHavePoint(entry)}
          {@const point = pointable ? points.get(entry.id) : undefined}
          {@const actions = entryActions(entry.type)}
          {@const openable =
            pointable ||
            actions.length > 0 ||
            row.answeredBy.length > 0 ||
            row.corrections.length > 0}
          <!-- An incoming message, a note, the incident's own status or an orphan
               correction: the column at the right stays empty (no delivery status). Open,
               the versions of a corrected text, the "answered" links, the point line, the
               point action, Reply and Correct. -->
          <Row
            id={entry.id}
            type={entry.type}
            {openable}
            open={isRowOpen(entry.id)}
            current={cursor === entry.id}
            tabindex={rowTabIndex(entry.id)}
            ontoggle={() => toggle(entry.id)}
            onfocus={() => (cursor = entry.id)}
          >
            {#snippet line()}
              {@render timeCell(entry, row.corrections, pointable)}
              {#if incoming}
                {@render whoCell(entry, "in", label(entry))}
              {:else}
                <span class="row-who">{entry.operator}</span>
              {/if}
              <div class="row-body">
                {#if correcting !== entry.id}
                  {#if entry.type === "status_change"}
                    {t(`journal.status.${entry.newStatus ?? "pending"}`)}{#if entry.text}
                      · {currentText(entry, row.corrections)}{/if}
                  {:else}
                    {currentText(entry, row.corrections)}
                  {/if}
                {/if}
              </div>
            {/snippet}
            {#snippet area()}
              <RowHistory {entry} corrections={row.corrections} {byId} onjump={scrollToEntry} />
              {#if row.answeredBy.length > 0}
                <p class="row-links">
                  {#each row.answeredBy as reply (reply.id)}
                    <button
                      type="button"
                      class="btn-link"
                      title={reply.text ?? ""}
                      onclick={() => scrollToEntry(reply.id)}
                    >
                      {t("journal.reply.answered", { time: formatShortTime(reply.timestamp) })}
                    </button>
                  {/each}
                </p>
              {/if}
              {#if point !== undefined}
                {@render pointLine(point)}
              {/if}
              {#if correcting === entry.id}
                {@render correctionForm()}
              {:else if pointing === entry.id}
                {@render pointForm(entry)}
              {:else if closingPoint === entry.id && point !== undefined}
                {@render closePointForm(point)}
              {:else if pointable || actions.length > 0}
                <div class="row-actions">
                  {#if pointable}
                    {@render pointButton(entry)}
                  {/if}
                  {#if actions.includes("reply")}
                    <button type="button" class="btn btn-quiet" onclick={() => onreply(entry)}>
                      <Icon name="reply" />{t("journal.action.reply")}
                    </button>
                  {/if}
                  {#if actions.includes("correct")}
                    {@render correctButton(entry, row.corrections)}
                  {/if}
                </div>
              {/if}
            {/snippet}
          </Row>
        {/if}
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* Layout only: the box fills what the column leaves it (JournalPage.svelte sizes the
     column) and scrolls inside. */
  .timeline {
    flex: 1 1 auto;
  }
</style>
