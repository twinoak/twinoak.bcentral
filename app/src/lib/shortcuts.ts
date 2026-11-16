// The keyboard shortcuts (P1-09), as one pure rule: a key event in, an action out. The one
// documented set, shown on the `?` overlay (components/ShortcutHelp.svelte):
//
//   N            new message (the compose text)       J / K   next / previous journal row
//   R            reply to the current incoming row    Enter / Space   open or close the current row
//   P            open / close / reopen a point on the current row (P3-05)
//   L            close the current unconfirmed radio message (P3-09)
//   A            add a note                           Esc     cancel (forms, the open row, links, overlay)
//   Ctrl+Enter   send / record the form               ?       this overlay
//   G then J / R / H / S   go to Journal / Register / Handover / Settings
//
// Nothing fires while a text field has the focus except Ctrl+Enter and Esc. A key with
// Ctrl, Alt or Meta held is the browser's (Ctrl+R reloads), except Ctrl+Enter. The G prefix
// is armed for GO_PREFIX_TIMEOUT_MS; any other key clears it. The wiring to the window and
// to the screens is lib/shortcutDispatch.ts. Enter and Space on a row are the row's own
// (components/Row.svelte handles them on the focused line, as a button would) and are
// listed here so the overlay documents them; the resolver names them all the same.

export type ShortcutAction =
  | "newMessage"
  | "reply"
  | "point"
  | "closeMessage"
  | "addNote"
  | "nextRow"
  | "previousRow"
  | "expandRow"
  | "send"
  | "cancel"
  | "goJournal"
  | "goRegister"
  | "goHandover"
  | "goSettings"
  | "help";

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  // True when the event's target is a text field (isTextFieldTarget).
  inTextField: boolean;
}

export interface ShortcutState {
  // When the G prefix was pressed, or null when it is not armed.
  goPrefixAtMs: number | null;
}

export const IDLE: ShortcutState = { goPrefixAtMs: null };
export const GO_PREFIX_TIMEOUT_MS = 2000;

// The documented set, in the order the overlay lists it. `keys` are display labels.
export interface ShortcutDoc {
  action: ShortcutAction;
  keys: readonly string[];
  // Whether the shortcut also works while a text field has the focus.
  inTextField: boolean;
}

export const SHORTCUTS: readonly ShortcutDoc[] = [
  { action: "newMessage", keys: ["N"], inTextField: false },
  { action: "reply", keys: ["R"], inTextField: false },
  { action: "point", keys: ["P"], inTextField: false },
  { action: "closeMessage", keys: ["L"], inTextField: false },
  { action: "addNote", keys: ["A"], inTextField: false },
  { action: "nextRow", keys: ["J"], inTextField: false },
  { action: "previousRow", keys: ["K"], inTextField: false },
  { action: "expandRow", keys: ["Enter", "Space"], inTextField: false },
  { action: "send", keys: ["Ctrl", "Enter"], inTextField: true },
  { action: "cancel", keys: ["Esc"], inTextField: true },
  { action: "goJournal", keys: ["G", "J"], inTextField: false },
  { action: "goRegister", keys: ["G", "R"], inTextField: false },
  { action: "goSettings", keys: ["G", "S"], inTextField: false },
  { action: "help", keys: ["?"], inTextField: false },
];

const GO_TARGETS: Readonly<Record<string, ShortcutAction>> = {
  j: "goJournal",
  r: "goRegister",
  s: "goSettings",
};

const SINGLE_KEYS: Readonly<Record<string, ShortcutAction>> = {
  n: "newMessage",
  r: "reply",
  p: "point",
  l: "closeMessage",
  a: "addNote",
  j: "nextRow",
  k: "previousRow",
};

export interface Resolved {
  action: ShortcutAction | null;
  state: ShortcutState;
}

export function resolveShortcut(input: KeyInput, state: ShortcutState, nowMs: number): Resolved {
  if (input.isComposing === true) {
    return { action: null, state: IDLE };
  }
  const modifier = input.ctrlKey || input.altKey || input.metaKey;
  if (input.key === "Enter" && input.ctrlKey && !input.altKey && !input.metaKey) {
    return { action: "send", state: IDLE };
  }
  if (input.key === "Escape" && !modifier) {
    return { action: "cancel", state: IDLE };
  }
  if (input.inTextField || modifier) {
    return { action: null, state: IDLE };
  }
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const armed = state.goPrefixAtMs !== null && nowMs - state.goPrefixAtMs <= GO_PREFIX_TIMEOUT_MS;
  if (armed) {
    // The second key of a G chord; anything that is not a target ends the chord quietly.
    return { action: GO_TARGETS[key] ?? null, state: IDLE };
  }
  if (key === "g") {
    return { action: null, state: { goPrefixAtMs: nowMs } };
  }
  if (key === "?") {
    return { action: "help", state: IDLE };
  }
  if (key === "Enter" || key === " ") {
    return { action: "expandRow", state: IDLE };
  }
  return { action: SINGLE_KEYS[key] ?? null, state: IDLE };
}

// What counts as a text field: anything the operator types into. A checkbox, a button or a
// row is not one, so the letters work from there.
export interface TargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTextFieldTarget(target: TargetLike | null | undefined): boolean {
  if (target === null || target === undefined) {
    return false;
  }
  if (target.isContentEditable === true) {
    return true;
  }
  const tag = target.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (tag === "INPUT") {
    return !NON_TEXT_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
  }
  return false;
}
