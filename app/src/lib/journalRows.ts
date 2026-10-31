// What the journal's row list tints and marks (P2-03, docs/design.md §Components): one pure
// rule per thing, so the timeline and the side cards agree and a test can hold them. A
// status is a colour pair plus a dot (the dot and the word carry the state; the tint is
// never the only difference), a batch is a run of counter chips, and a message row says
// which way it went with a glyph before the counterparty.

import type { BatchCounters, StripKind } from "../store/journalView.ts";
import type { JournalEntry, Status } from "../store/types.ts";

// The four looks a chip can have; `neutral` is the grey default of `.chip`.
export type ChipTint = "neutral" | "ok" | "warn" | "danger";

export interface ChipLook {
  tint: ChipTint;
  // A filled dot is a state reached for good (roger, sent); an outline dot is a state the
  // next one may follow (delivered before roger, waiting for the receipt).
  dot: "filled" | "outline";
}

// The chip class for a tint, to put next to `chip`; empty for the neutral default.
export function chipClass(tint: ChipTint): string {
  return tint === "neutral" ? "" : `chip-${tint}`;
}

// A message's derived status as a chip: sent neutral, delivered ok (outline), roger ok
// (filled), pending and the incident's own states grey, given up danger. Pending is warn:
// a message nobody has handed to the radio or the courier still needs a hand.
export function statusChip(status: Status): ChipLook {
  switch (status) {
    case "pending":
      return { tint: "warn", dot: "filled" };
    case "sent":
      return { tint: "neutral", dot: "filled" };
    case "delivered":
      return { tint: "ok", dot: "outline" };
    case "roger":
      return { tint: "ok", dot: "filled" };
    case "given_up":
      return { tint: "danger", dot: "filled" };
    default:
      return { tint: "neutral", dot: "filled" };
  }
}

// One segment of the status strip. `waiting` (sent, the receipt still out) is warn with an
// outline dot, like the bar's connecting chip; the rest is the status's own chip.
export function stripChip(kind: StripKind): ChipLook {
  if (kind === "waiting") {
    return { tint: "warn", dot: "outline" };
  }
  return statusChip(kind);
}

export interface CounterChip {
  key: "pending" | "sent" | "delivered" | "roger" | "given_up";
  n: number;
  look: ChipLook;
}

// The counters of a batch row as chips, in the order of the chain, zero counters omitted —
// the same selection lib/journalText.ts's countersText() makes for the print view.
export function counterChips(counters: BatchCounters): CounterChip[] {
  const chips: CounterChip[] = [];
  for (const key of ["pending", "sent", "delivered", "roger", "given_up"] as const) {
    const n = key === "given_up" ? counters.givenUp : counters[key];
    if (n > 0) {
      chips.push({ key, n, look: statusChip(key) });
    }
  }
  return chips;
}

// Which way a message went, or null for an entry that is not a message (a note, a
// correction, the incident's own status changes).
export type Direction = "out" | "in";

export function directionOf(entry: Pick<JournalEntry, "type">): Direction | null {
  if (entry.type === "message_out") {
    return "out";
  }
  if (entry.type === "message_in") {
    return "in";
  }
  return null;
}

// The glyph before the counterparty: an arrow out of the desk, an arrow into it. Plain
// characters, not icons: an icon is an action or a state, and this is neither.
export const DIRECTION_GLYPH: Readonly<Record<Direction, string>> = { out: "→", in: "←" };
