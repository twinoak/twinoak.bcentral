// What the handover screen shows (P1-08): everything that is open, derived from the
// incident's entries and the register on every reload, like journalView.ts. Nothing here is
// stored and nothing is parsed out of a text: an order is open when its derived status says
// so, an incoming message is unanswered when no entry refers to it, a radio is quiet when
// the journal has nothing from it within the blind time.
//
// The four lists, each oldest first (the overdue one on top; this screen exists to find it):
//   open        message_out entries not yet roger and not given up (pending / sent / delivered)
//   givenUp     message_out entries whose status is given_up: the ones that need a decision
//   unanswered  message_in entries nobody has answered: no message_out carries their id as
//               refersTo (a reply, P1-02), and no roger was recorded from them (the roger's
//               status_change carries the incoming entry's id as its text, P0-06)
//   quiet       register entries not heard from within the blind time, quietest first

import {
  OPEN_STATUSES,
  buildTimeline,
  compareEntries,
  sortedByLastHeard,
  type LastHeard,
  type MessageView,
  type TimelineRow,
} from "./journalView.ts";
import type { JournalEntry, RegisterEntry } from "./types.ts";

// Every outgoing message's view off the timeline, one per message_out: a batch is opened up,
// since each recipient's message has its own status and is its own item here.
export function messageViews(rows: readonly TimelineRow[]): MessageView[] {
  const views: MessageView[] = [];
  for (const row of rows) {
    if (row.kind === "message") {
      views.push(row.message);
    } else if (row.kind === "batch") {
      views.push(...row.messages);
    }
  }
  return views;
}

function oldestFirst(views: readonly MessageView[]): MessageView[] {
  return [...views].sort((a, b) => compareEntries(a.entry, b.entry));
}

// Not yet roger: pending, sent or delivered. Given up is a list of its own.
export function openOrders(views: readonly MessageView[]): MessageView[] {
  return oldestFirst(views.filter((view) => OPEN_STATUSES.includes(view.status)));
}

export function givenUpOrders(views: readonly MessageView[]): MessageView[] {
  return oldestFirst(views.filter((view) => view.status === "given_up"));
}

// The ids of the incoming entries that a roger was recorded from: the roger status_change's
// text is the incoming entry's id (contract: "A roger recorded from an incoming message also
// carries the incoming entry's id in text"). A manual roger carries the operator's reason
// instead, which is no entry id and matches nothing.
function rogerSources(entries: readonly JournalEntry[]): Set<string> {
  const sources = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "status_change" && entry.newStatus === "roger" && entry.text !== undefined) {
      sources.add(entry.text);
    }
  }
  return sources;
}

function answeredIds(entries: readonly JournalEntry[]): Set<string> {
  const answered = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "message_out" && entry.refersTo !== undefined) {
      answered.add(entry.refersTo);
    }
  }
  return answered;
}

export function unansweredIncoming(entries: readonly JournalEntry[]): JournalEntry[] {
  const answered = answeredIds(entries);
  const rogers = rogerSources(entries);
  return entries
    .filter(
      (entry) => entry.type === "message_in" && !answered.has(entry.id) && !rogers.has(entry.id),
    )
    .sort(compareEntries);
}

export interface HandoverLists {
  open: MessageView[];
  givenUp: MessageView[];
  unanswered: JournalEntry[];
}

export function buildHandover(entries: readonly JournalEntry[]): HandoverLists {
  const views = messageViews(buildTimeline(entries));
  return {
    open: openOrders(views),
    givenUp: givenUpOrders(views),
    unanswered: unansweredIncoming(entries),
  };
}

export interface QuietOptions {
  // The moment the silence is measured from, milliseconds since the epoch.
  nowMs: number;
  // The blind time (settings): silence longer than this is quiet.
  blindAfterMs: number;
}

// Register entries not heard from in longer than the blind time, in the "last heard from"
// panel's order: never heard first, then the oldest contact first.
export function quietRadios(
  register: readonly RegisterEntry[],
  heard: ReadonlyMap<string, string>,
  options: QuietOptions,
): LastHeard[] {
  return sortedByLastHeard(register, heard).filter(
    (row) => row.at === null || options.nowMs - Date.parse(row.at) > options.blindAfterMs,
  );
}
