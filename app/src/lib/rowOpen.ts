// Which row of a row list is open (P3-04), as one pure rule. A row at rest is one line;
// clicking it opens it in place (its history, its links, its actions under the line) and
// only one row is open at a time: opening another closes the first, clicking the open row's
// own line closes it, Esc closes. A send-to-all row is the one exception that holds other
// rows: open, it shows one row per recipient, and a recipient row opens inside it without
// closing it — so the state is two ids, the open row and the open batch. The DOM side (the
// click, the keys, aria-expanded) is components/Row.svelte; the journal's state lives in
// components/Timeline.svelte, the handover's in pages/HandoverPage.svelte.

import type { TimelineRow } from "../store/journalView.ts";

export interface OpenState {
  // The row whose area is shown: a message, a note, an incoming row or a recipient row
  // inside the open batch. Null when none.
  row: string | null;
  // The batch whose recipients are shown. Null when none.
  batch: string | null;
}

export const CLOSED: OpenState = { row: null, batch: null };

// Where a row sits in the list: a batch row, a recipient row nested in a batch (`parent`
// is the batch's id), or a plain row (`parent` null).
export interface RowPlace {
  batch: boolean;
  parent: string | null;
}

export function isOpen(state: OpenState, id: string, place: RowPlace): boolean {
  return place.batch ? state.batch === id : state.row === id;
}

// A click (or Enter / Space) on a row's line. A batch toggles its recipients and closes
// whatever row was open; a recipient toggles inside its batch; any other row closes the
// batch and every other row.
export function toggleRow(state: OpenState, id: string, place: RowPlace): OpenState {
  if (place.batch) {
    return state.batch === id ? CLOSED : { row: null, batch: id };
  }
  if (state.row === id) {
    return { row: null, batch: state.batch };
  }
  return { row: id, batch: place.parent };
}

// Esc: the open row first (a recipient closes and its batch stays open), then the batch.
export function closeOne(state: OpenState): OpenState {
  if (state.row !== null) {
    return { row: null, batch: state.batch };
  }
  return CLOSED;
}

// The row Esc or a close is about: the open row, else the open batch, else null.
export function openRowId(state: OpenState): string | null {
  return state.row ?? state.batch;
}

// A jump to an entry (a side card, a reply mark, a roger's source): the row that shows it
// opens — a batch opens on the recipient row that holds the entry, or on its recipients
// alone when the entry is the batch itself.
export function revealRow(row: TimelineRow, entryId: string): OpenState {
  if (row.kind !== "batch") {
    return { row: row.id, batch: null };
  }
  const view = row.messages.find(
    (candidate) =>
      candidate.entry.id === entryId ||
      candidate.corrections.some((c) => c.id === entryId) ||
      candidate.history.some(
        (item) => item.entry.id === entryId || item.corrections.some((c) => c.id === entryId),
      ),
  );
  return { row: view?.entry.id ?? null, batch: row.id };
}

// --- the click ------------------------------------------------------------------------------

// What a click on the line must not toggle: a control inside it (a link, a button, a field —
// their click is their own) and a click that ends a text selection inside the row (the
// operator was copying, not opening).
export const CONTROL_SELECTOR = "a, button, input, select, textarea, label";

export interface ClickTargetLike {
  closest(selector: string): unknown;
}

export interface SelectionLike {
  isCollapsed: boolean;
  anchorNode: unknown;
  focusNode: unknown;
}

export interface RowElementLike {
  contains(node: unknown): boolean;
}

export function clickToggles(
  target: ClickTargetLike | null,
  selection: SelectionLike | null,
  row: RowElementLike,
): boolean {
  if (target !== null && target.closest(CONTROL_SELECTOR) !== null) {
    return false;
  }
  if (
    selection !== null &&
    !selection.isCollapsed &&
    (row.contains(selection.anchorNode) || row.contains(selection.focusNode))
  ) {
    return false;
  }
  return true;
}
