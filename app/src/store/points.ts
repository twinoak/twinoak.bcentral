// Points above the store (P3-05): the three writes that move a follow-up. A point is an
// entry of type `point` whose refersTo is the entry it was opened from and whose text is its
// title (contract/journal.schema.json); it is open from creation until a status_change
// `closed` refers to it, and open again after `reopened`. Nothing is stored on the point:
// its state is derived (journalView.ts pointsFor), like a message's status.
//
// One point per origin entry (the contract): a second "open" on the same entry is refused,
// and reopening uses the point that exists. Closing needs a reason (the journal says why a
// follow-up was taken off the list); reopening needs none.

import type { JournalStore } from "./journalStore.ts";
import { latestStatusChange } from "./status.ts";
import type { JournalEntry } from "./types.ts";

export class PointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PointError";
  }
}

// A title and a reason are the operator's words; whitespace-only is nothing.
function requiredText(text: string, what: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new PointError(`${what} needs a text`);
  }
  return trimmed;
}

// The point opened from `originId`, read from the store; undefined when none.
export async function storedPointOf(
  store: JournalStore,
  originId: string,
): Promise<JournalEntry | undefined> {
  const referring = await store.entriesReferringTo(originId);
  return referring.find((entry) => entry.type === "point");
}

// Whether a stored point is open: the latest closed / reopened status change referring to
// it, open when there is none.
export async function isPointOpen(store: JournalStore, pointId: string): Promise<boolean> {
  const changes = (await store.entriesReferringTo(pointId)).filter(
    (entry) =>
      entry.type === "status_change" &&
      (entry.newStatus === "closed" || entry.newStatus === "reopened"),
  );
  return latestStatusChange(changes, pointId)?.newStatus !== "closed";
}

export interface OpenPointInput {
  operator: string;
  // The title, as typed (prefilled from the origin's text by the form).
  title: string;
}

// Appends the point, filed under the origin's incident. The origin has to be in the store
// and must not have a point already; a point cannot be opened from a point or from a
// status change.
export async function openPoint(
  store: JournalStore,
  origin: JournalEntry,
  input: OpenPointInput,
): Promise<JournalEntry> {
  const stored = await store.getEntry(origin.id);
  if (stored === undefined) {
    throw new PointError(`entry ${origin.id} is not in the journal`);
  }
  if (stored.type === "point" || stored.type === "status_change") {
    throw new PointError(`a point cannot be opened from a ${stored.type}`);
  }
  if ((await storedPointOf(store, stored.id)) !== undefined) {
    throw new PointError(`entry ${stored.id} already has a point`);
  }
  return await store.appendEntry({
    incidentId: stored.incidentId,
    operator: input.operator,
    type: "point",
    refersTo: stored.id,
    text: requiredText(input.title, "a point"),
  });
}

export interface ClosePointInput {
  operator: string;
  // Why the point is closed; required.
  reason: string;
}

// Appends status_change -> closed referring to the point, with the reason in text. Refuses
// when the point is not in the store or is already closed.
export async function closePoint(
  store: JournalStore,
  point: JournalEntry,
  input: ClosePointInput,
): Promise<JournalEntry> {
  const stored = await requirePoint(store, point.id);
  const reason = requiredText(input.reason, "closing a point");
  if (!(await isPointOpen(store, stored.id))) {
    throw new PointError(`point ${stored.id} is already closed`);
  }
  return await store.appendEntry({
    incidentId: stored.incidentId,
    operator: input.operator,
    type: "status_change",
    refersTo: stored.id,
    newStatus: "closed",
    text: reason,
  });
}

// Appends status_change -> reopened referring to the point. Refuses when the point is open.
export async function reopenPoint(
  store: JournalStore,
  point: JournalEntry,
  input: { operator: string },
): Promise<JournalEntry> {
  const stored = await requirePoint(store, point.id);
  if (await isPointOpen(store, stored.id)) {
    throw new PointError(`point ${stored.id} is open`);
  }
  return await store.appendEntry({
    incidentId: stored.incidentId,
    operator: input.operator,
    type: "status_change",
    refersTo: stored.id,
    newStatus: "reopened",
  });
}

async function requirePoint(store: JournalStore, id: string): Promise<JournalEntry> {
  const stored = await store.getEntry(id);
  if (stored === undefined) {
    throw new PointError(`entry ${id} is not in the journal`);
  }
  if (stored.type !== "point") {
    throw new PointError(`entry ${id} is a ${stored.type}, not a point`);
  }
  return stored;
}
