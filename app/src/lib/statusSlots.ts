// The status column (P3-03): the state of a radio message read off three fixed slots at the
// right of its row — sent · delivered · confirmed — one symbol each, always in the same
// place, with no times in the list (the times are the slots' tooltips and the row's
// history). One pure rule per thing, like lib/journalRows.ts, so the timeline, the handover
// lists and the open-items card agree and a test can hold every state. The words of the
// tooltips are lib/journalText.ts's (slotText); the drawing is components/SlotSymbol.svelte.
// A message by phone, courier or verbal has no chain and no slots (P3-07): its column is
// empty, like an incoming row's.
//
// Six shapes, so colour is never the only cue (docs/design.md): a hollow circle (not yet),
// a filled circle (done), a filled circle with a check (confirmed), a hollow circle with a
// clock (sent, the receipt still out, a resend pending), a cross (given up, in the first
// slot the message did not reach; the slots before it stay filled) and a short dash in the
// confirmed slot (closed by the staff, P3-09: not a confirmation, so not the check — the
// staff stopped waiting; the slots before it say what the radio reached).

import type { BatchCounters, StripItem } from "../store/journalView.ts";
import type { ChipTint } from "./journalRows.ts";

export const SLOT_NAMES = ["sent", "delivered", "roger"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

export type SlotShape = "hollow" | "filled" | "check" | "clock" | "cross" | "dash";

// The chip tints, and `muted` (--ink-2) for the dash of a closed message: quieter than the
// states the radio reached, darker than a slot not yet reached.
export type SlotTint = ChipTint | "muted";

export interface Slot {
  name: SlotName;
  shape: SlotShape;
  // The tint the symbol is drawn in: neutral (--rule-2) when not yet, ok when done, warn on
  // the clock, danger on the cross, muted (--ink-2) on the dash. High contrast drops the
  // tints; the shapes stay.
  tint: SlotTint;
  // ISO timestamp of the transition when the slot is done or crossed; null otherwise.
  at: string | null;
  // The transition's text when the slot is done or crossed: the operator's reason on a
  // manual status, the outbox's detail on a given-up; null when there is none.
  text: string | null;
  // On a clock: the latest resend attempt's text ("attempt 2/3"), null on the first attempt.
  attempt: string | null;
}

// The slot's tint and shape when the message reached that state.
const DONE_SHAPE: Readonly<Record<SlotName, SlotShape>> = {
  sent: "filled",
  delivered: "filled",
  roger: "check",
};

// The three slots of a radio message from its strip (store/journalView.ts statusStrip: the
// current run, oldest first). Every radio message has all three; a pending message (no sent
// yet) is three hollow circles. The text of a reached or crossed slot is the transition's
// own — the radio's detail, or the operator's reason on a roger or given-up set by hand, or
// the staff's note on a close. A closed message (P3-09) has the dash in the confirmed slot
// with the close's time and note; the slots before it read as the radio left them, a cross
// included, since the close changes nothing about what the radio reached.
export function statusSlots(strip: readonly StripItem[]): Slot[] {
  const givenUp = strip.find((item) => item.kind === "given_up");
  const closed = strip.find((item) => item.kind === "closed");
  const waiting = strip.find((item) => item.kind === "waiting");
  let crossed = false;
  return SLOT_NAMES.map((name) => {
    const reached = strip.find((item) => item.kind === name);
    if (reached !== undefined) {
      return {
        name,
        shape: DONE_SHAPE[name],
        tint: "ok",
        at: reached.at,
        text: reached.text,
        attempt: null,
      };
    }
    if (name === "roger" && closed !== undefined) {
      return {
        name,
        shape: "dash",
        tint: "muted",
        at: closed.at,
        text: closed.text,
        attempt: null,
      };
    }
    if (givenUp !== undefined && !crossed) {
      crossed = true;
      return {
        name,
        shape: "cross",
        tint: "danger",
        at: givenUp.at,
        text: givenUp.text,
        attempt: null,
      };
    }
    if (name === "delivered" && waiting !== undefined) {
      return {
        name,
        shape: "clock",
        tint: "warn",
        at: null,
        text: null,
        attempt: waiting.attempt,
      };
    }
    return { name, shape: "hollow", tint: "neutral", at: null, text: null, attempt: null };
  });
}

// A batch row's slot: a count instead of a symbol, "23/25", in the done tint once every
// recipient reached the state and plain until then.
export interface CountSlot {
  name: SlotName;
  n: number;
  total: number;
  tint: ChipTint;
}

export function countSlots(counters: BatchCounters): CountSlot[] {
  return SLOT_NAMES.map((name) => {
    const n = counters[name];
    return {
      name,
      n,
      total: counters.total,
      tint: counters.total > 0 && n === counters.total ? "ok" : "neutral",
    };
  });
}
