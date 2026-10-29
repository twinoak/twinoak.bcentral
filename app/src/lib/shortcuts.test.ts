import { afterEach, describe, expect, it } from "vitest";
import da from "../i18n/da.json";
import en from "../i18n/en.json";
import {
  GO_PREFIX_TIMEOUT_MS,
  IDLE,
  isTextFieldTarget,
  resolveShortcut,
  SHORTCUTS,
  type KeyInput,
  type ShortcutAction,
  type ShortcutState,
} from "./shortcuts.ts";
import {
  createKeyListener,
  deferShortcut,
  dispatchShortcut,
  onShortcut,
  pendingShortcut,
  resetShortcuts,
  type KeyEventLike,
} from "./shortcutDispatch.ts";

function press(key: string, extra: Partial<KeyInput> = {}): KeyInput {
  return { key, ctrlKey: false, altKey: false, metaKey: false, inTextField: false, ...extra };
}

function resolve(input: KeyInput, state: ShortcutState = IDLE, nowMs = 1000) {
  return resolveShortcut(input, state, nowMs);
}

// A G chord: G, then the second key, as the listener would see them.
function chord(second: string, extra: Partial<KeyInput> = {}): ShortcutAction | null {
  const first = resolve(press("g", extra));
  return resolve(press(second, extra), first.state, 1500).action;
}

// Acceptance: a test per shortcut that it fires outside a text field and not inside one.
describe("single keys outside a text field, silent inside one", () => {
  const cases: [string, ShortcutAction][] = [
    ["n", "newMessage"],
    ["r", "reply"],
    ["a", "addNote"],
    ["j", "nextRow"],
    ["k", "previousRow"],
    ["Enter", "expandRow"],
    ["?", "help"],
  ];

  for (const [key, action] of cases) {
    it(`${key} → ${action} from a row or a button, nothing in a text field`, () => {
      expect(resolve(press(key)).action).toBe(action);
      expect(resolve(press(key, { inTextField: true })).action).toBeNull();
    });
  }

  it("letters work in upper case too (Caps Lock, Shift)", () => {
    expect(resolve(press("N")).action).toBe("newMessage");
    expect(resolve(press("J")).action).toBe("nextRow");
    expect(resolve(press("K")).action).toBe("previousRow");
  });

  it("a key with Ctrl, Alt or Meta is the browser's", () => {
    expect(resolve(press("n", { ctrlKey: true })).action).toBeNull();
    expect(resolve(press("r", { ctrlKey: true })).action).toBeNull();
    expect(resolve(press("j", { altKey: true })).action).toBeNull();
    expect(resolve(press("a", { metaKey: true })).action).toBeNull();
    expect(resolve(press("Enter", { altKey: true })).action).toBeNull();
  });

  it("a key during IME composition is nothing", () => {
    expect(resolve(press("n", { isComposing: true })).action).toBeNull();
  });

  it("an unassigned key is nothing", () => {
    expect(resolve(press("x")).action).toBeNull();
    expect(resolve(press("ArrowDown")).action).toBeNull();
    expect(resolve(press(" ")).action).toBeNull();
  });
});

describe("the two keys that also work inside a text field", () => {
  it("Ctrl+Enter → send, inside and outside a text field", () => {
    expect(resolve(press("Enter", { ctrlKey: true, inTextField: true })).action).toBe("send");
    expect(resolve(press("Enter", { ctrlKey: true })).action).toBe("send");
  });

  it("Ctrl+Alt+Enter and Ctrl+Meta+Enter are not send", () => {
    expect(resolve(press("Enter", { ctrlKey: true, altKey: true })).action).toBeNull();
    expect(resolve(press("Enter", { ctrlKey: true, metaKey: true })).action).toBeNull();
  });

  it("Esc → cancel, inside and outside a text field", () => {
    expect(resolve(press("Escape", { inTextField: true })).action).toBe("cancel");
    expect(resolve(press("Escape")).action).toBe("cancel");
  });
});

describe("the G chords", () => {
  it("G J / G R / G H / G S go to Journal / Register / Handover / Settings", () => {
    expect(chord("j")).toBe("goJournal");
    expect(chord("r")).toBe("goRegister");
    expect(chord("h")).toBe("goHandover");
    expect(chord("s")).toBe("goSettings");
    expect(chord("S")).toBe("goSettings");
  });

  it("G alone does nothing but arm the prefix", () => {
    const armed = resolve(press("g"));
    expect(armed.action).toBeNull();
    expect(armed.state.goPrefixAtMs).toBe(1000);
  });

  it("the chord does not fire from a text field", () => {
    expect(chord("j", { inTextField: true })).toBeNull();
    // G outside, then J inside: nothing.
    const armed = resolve(press("g"));
    expect(resolve(press("j", { inTextField: true }), armed.state, 1500).action).toBeNull();
  });

  it("the prefix expires", () => {
    const armed = resolve(press("g"));
    const late = resolve(press("j"), armed.state, 1000 + GO_PREFIX_TIMEOUT_MS + 1);
    expect(late.action).toBe("nextRow");
    const inTime = resolve(press("j"), armed.state, 1000 + GO_PREFIX_TIMEOUT_MS);
    expect(inTime.action).toBe("goJournal");
  });

  it("any other second key ends the chord quietly, and clears the prefix", () => {
    const armed = resolve(press("g"));
    const other = resolve(press("n"), armed.state, 1500);
    expect(other.action).toBeNull();
    expect(other.state).toEqual(IDLE);
    // R right after a failed chord is Reply again, not Register.
    expect(resolve(press("r"), other.state, 1600).action).toBe("reply");
  });
});

describe("what counts as a text field", () => {
  it("inputs, textareas, selects and contenteditable are text fields", () => {
    expect(isTextFieldTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "input", type: "text" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "INPUT", type: "url" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTextFieldTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("rows, buttons, checkboxes, links and the page are not", () => {
    expect(isTextFieldTarget({ tagName: "TR" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "INPUT", type: "submit" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "INPUT", type: "file" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "A" })).toBe(false);
    expect(isTextFieldTarget({ tagName: "BODY" })).toBe(false);
    expect(isTextFieldTarget(null)).toBe(false);
  });
});

describe("the documented set", () => {
  it("lists every action once, and says which two work in a text field", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect(SHORTCUTS.filter((s) => s.inTextField).map((s) => s.action)).toEqual(["send", "cancel"]);
    expect(actions).toEqual([
      "newMessage",
      "reply",
      "addNote",
      "nextRow",
      "previousRow",
      "expandRow",
      "send",
      "cancel",
      "goJournal",
      "goRegister",
      "goHandover",
      "goSettings",
      "help",
    ]);
  });

  it("has its overlay text in both catalogs", () => {
    const enCatalog: Record<string, string> = en;
    const daCatalog: Record<string, string> = da;
    for (const shortcut of SHORTCUTS) {
      expect(enCatalog[`shortcuts.${shortcut.action}`]).toBeTruthy();
      expect(daCatalog[`shortcuts.${shortcut.action}`]).toBeTruthy();
    }
  });
});

describe("dispatch", () => {
  afterEach(() => {
    resetShortcuts();
  });

  function event(key: string, target: object | null, extra: Partial<KeyEventLike> = {}) {
    let prevented = false;
    const e: KeyEventLike & { prevented(): boolean } = {
      key,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      target: target as EventTarget | null,
      preventDefault() {
        prevented = true;
      },
      prevented: () => prevented,
      ...extra,
    };
    return e;
  }

  it("the newest handler is asked first and can pass; preventDefault only when handled", () => {
    const calls: string[] = [];
    onShortcut("newMessage", () => {
      calls.push("app");
      return true;
    });
    const off = onShortcut("newMessage", () => {
      calls.push("page");
      return false;
    });
    const listen = createKeyListener(() => 0);

    const e = event("n", { tagName: "TR" });
    listen(e);
    expect(calls).toEqual(["page", "app"]);
    expect(e.prevented()).toBe(true);

    off();
    const e2 = event("n", { tagName: "BUTTON" });
    listen(e2);
    expect(calls).toEqual(["page", "app", "app"]);

    const unhandled = event("x", { tagName: "BODY" });
    listen(unhandled);
    expect(unhandled.prevented()).toBe(false);
  });

  it("a fallback is asked last, even when it registered after the page's handler", () => {
    const calls: string[] = [];
    onShortcut("newMessage", () => {
      calls.push("page");
      return true;
    });
    onShortcut(
      "newMessage",
      () => {
        calls.push("app");
        return true;
      },
      { fallback: true },
    );
    expect(dispatchShortcut("newMessage")).toBe(true);
    expect(calls).toEqual(["page"]);
  });

  it("a key in a text field reaches no handler; Ctrl+Enter and Esc do", () => {
    const seen: string[] = [];
    for (const action of ["newMessage", "send", "cancel"] as const) {
      onShortcut(action, () => {
        seen.push(action);
        return true;
      });
    }
    const listen = createKeyListener(() => 0);
    listen(event("n", { tagName: "TEXTAREA" }));
    listen(event("Enter", { tagName: "TEXTAREA" }, { ctrlKey: true }));
    listen(event("Escape", { tagName: "INPUT", type: "text" }));
    expect(seen).toEqual(["send", "cancel"]);
  });

  it("a key a form already took (defaultPrevented) is left alone", () => {
    let count = 0;
    onShortcut("cancel", () => {
      count += 1;
      return true;
    });
    const listen = createKeyListener(() => 0);
    listen(event("Escape", { tagName: "TEXTAREA" }, { defaultPrevented: true }));
    expect(count).toBe(0);
  });

  it("an unhandled action returns false, and a handler that returns nothing passes", () => {
    onShortcut("reply", () => undefined);
    expect(dispatchShortcut("reply")).toBe(false);
    expect(dispatchShortcut("addNote")).toBe(false);
  });

  it("a deferred action runs when its handler registers, once", () => {
    deferShortcut("addNote");
    expect(pendingShortcut()).toBe("addNote");
    let runs = 0;
    onShortcut("addNote", () => {
      runs += 1;
      return true;
    });
    expect(runs).toBe(1);
    expect(pendingShortcut()).toBeNull();
    onShortcut("addNote", () => true);
    expect(runs).toBe(1);
  });

  it("the next key clears a deferred action", () => {
    deferShortcut("newMessage");
    const listen = createKeyListener(() => 0);
    listen(event("x", { tagName: "BODY" }));
    expect(pendingShortcut()).toBeNull();
  });

  it("the G chord runs through the listener with real timing", () => {
    const seen: string[] = [];
    onShortcut("goSettings", () => {
      seen.push("settings");
      return true;
    });
    let now = 0;
    const listen = createKeyListener(() => now);
    listen(event("g", { tagName: "BODY" }));
    now = 500;
    listen(event("s", { tagName: "BODY" }));
    expect(seen).toEqual(["settings"]);
  });
});
