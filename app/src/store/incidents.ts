// Incidents above the store (P0-07): open or closed, derived from the status_change entries
// that refer to the incident itself (schema: refersTo is "an incident (closed/reopened)"),
// and the two writes that move it. An incident with no status_change is open. Nothing is
// stored on the incident; the latest status_change wins, as for a message.

import type { JournalStore } from "./journalStore.ts";
import { latestStatusChange } from "./status.ts";
import type { Incident, JournalEntry } from "./types.ts";

export type IncidentState = "open" | "closed";

export function incidentStateOf(
  entries: readonly JournalEntry[],
  incidentId: string,
): IncidentState {
  const latest = latestStatusChange(entries, incidentId);
  return latest?.newStatus === "closed" ? "closed" : "open";
}

export class IncidentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncidentStateError";
  }
}

export interface IncidentChange {
  operator: string;
  // Why, in the operator's words ("Strømmen tilbage 20:52"); omitted when empty.
  text?: string;
}

function reason(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

// Appends status_change -> closed, referring to the incident, filed under the incident.
// Refuses when the incident is already closed, so two operators cannot close it twice.
export async function closeIncident(
  store: JournalStore,
  incident: Incident,
  change: IncidentChange,
): Promise<JournalEntry> {
  if (!(await store.isIncidentOpen(incident.id))) {
    throw new IncidentStateError(`incident ${incident.id} is already closed`);
  }
  return await store.appendEntry({
    incidentId: incident.id,
    operator: change.operator,
    type: "status_change",
    refersTo: incident.id,
    newStatus: "closed",
    text: reason(change.text),
  });
}

// Appends status_change -> reopened. Refuses when the incident is open.
export async function reopenIncident(
  store: JournalStore,
  incident: Incident,
  change: IncidentChange,
): Promise<JournalEntry> {
  if (await store.isIncidentOpen(incident.id)) {
    throw new IncidentStateError(`incident ${incident.id} is open`);
  }
  return await store.appendEntry({
    incidentId: incident.id,
    operator: change.operator,
    type: "status_change",
    refersTo: incident.id,
    newStatus: "reopened",
    text: reason(change.text),
  });
}
