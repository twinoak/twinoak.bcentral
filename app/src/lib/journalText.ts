// The words and times a journal row is rendered with, shared by the timeline (P1-01) and the
// print view (P1-04) so both say the same thing. Everything user-facing goes through t().

import { t, language } from "../i18n/index.svelte.ts";
import type { BatchCounters, StripItem } from "../store/journalView.ts";
import type { JournalEntry } from "../store/types.ts";

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "medium" });
}

export function formatShortTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "short" });
}

export function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString(language(), {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

// One segment of the strip: the status and its time, or "waiting" with the latest attempt.
// While the outbox or the queue holds the message, its own progress text replaces the
// waiting / pending segment (the print view passes null: nothing is in flight on paper).
export function stripText(item: StripItem, inflightText: string | null): string {
  if ((item.kind === "waiting" || item.kind === "pending") && inflightText !== null) {
    return inflightText;
  }
  if (item.kind === "waiting") {
    return item.attempt === null
      ? t("journal.strip.waiting")
      : t("journal.strip.waitingAttempt", { attempt: item.attempt });
  }
  const label = t(`journal.status.${item.kind}`);
  return item.at === null ? label : `${label} ${formatShortTime(item.at)}`;
}

// "25 sent · 23 delivered · 18 roger · 1 given up"; zero counters omitted.
export function countersText(counters: BatchCounters): string {
  const parts: string[] = [];
  for (const key of ["pending", "sent", "delivered", "roger", "given_up"] as const) {
    const n = key === "given_up" ? counters.givenUp : counters[key];
    if (n > 0) {
      parts.push(t(`journal.batch.counter.${key}`, { n }));
    }
  }
  return parts.join(" · ");
}

// What a history line says: for a status change the status, then its text; a roger's text
// is the id of the incoming entry that caused it, shown as that entry's text when it is in
// `byId`. For an old resend note, its text.
export function historyDetail(
  entry: JournalEntry,
  byId: ReadonlyMap<string, JournalEntry>,
): string {
  if (entry.type !== "status_change") {
    return entry.text ?? "";
  }
  const status = t(`journal.status.${entry.newStatus ?? "pending"}`);
  if (entry.text === undefined) {
    return status;
  }
  const referenced = entry.newStatus === "roger" ? byId.get(entry.text) : undefined;
  if (referenced !== undefined) {
    return `${status} · ${t("journal.rogerFrom", { text: referenced.text ?? "" })}`;
  }
  return `${status} · ${entry.text}`;
}

// The incoming entry a roger came from, when it is in `byId`.
export function rogerSource(
  entry: JournalEntry,
  byId: ReadonlyMap<string, JournalEntry>,
): JournalEntry | undefined {
  if (entry.type !== "status_change" || entry.newStatus !== "roger" || entry.text === undefined) {
    return undefined;
  }
  return byId.get(entry.text);
}
