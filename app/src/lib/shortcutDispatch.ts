// The wiring of the shortcuts (P1-09): one keydown listener on the window resolves the key
// (lib/shortcuts.ts) and hands the action to whoever has registered for it. Screens and
// forms register handlers while they are mounted (an $effect that returns the unsubscribe);
// the newest registration is asked first and passes by returning false. App.svelte
// registers the defaults (navigation, the overlay) first, so they are the last resort.
//
// A shortcut that needs a screen that is not open (N on the register page) is deferred: the
// default handler navigates to the journal and leaves the action pending; the form that
// owns it runs it the moment it registers. The next key clears anything pending.

import {
  IDLE,
  isTextFieldTarget,
  resolveShortcut,
  type ShortcutAction,
  type ShortcutState,
} from "./shortcuts.ts";

// Returns true when the action was taken; false (or nothing) passes it on.
export type ShortcutHandler = () => boolean | void;

export interface ShortcutOptions {
  // A fallback is asked last, whenever it registered: App.svelte's defaults.
  fallback?: boolean;
}

const handlers = new Map<ShortcutAction, ShortcutHandler[]>();
let pending: ShortcutAction | null = null;

export function onShortcut(
  action: ShortcutAction,
  handler: ShortcutHandler,
  options: ShortcutOptions = {},
): () => void {
  const list = handlers.get(action) ?? [];
  if (options.fallback === true) {
    list.unshift(handler);
  } else {
    list.push(handler);
  }
  handlers.set(action, list);
  if (pending === action) {
    pending = null;
    handler();
  }
  return () => {
    const current = handlers.get(action) ?? [];
    const index = current.lastIndexOf(handler);
    if (index !== -1) {
      current.splice(index, 1);
    }
  };
}

export function dispatchShortcut(action: ShortcutAction): boolean {
  const list = handlers.get(action) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.() === true) {
      return true;
    }
  }
  return false;
}

// Run the action when a handler for it appears (after a navigation).
export function deferShortcut(action: ShortcutAction): void {
  pending = action;
}

export function pendingShortcut(): ShortcutAction | null {
  return pending;
}

// For tests: forget every handler and anything pending.
export function resetShortcuts(): void {
  handlers.clear();
  pending = null;
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

// The listener: skips keys a form already took (Esc that dropped a reply link, Ctrl+Enter
// that sent), resolves the rest and prevents the browser's default only when a handler
// acted, so Enter on a button or Space in a page stays the browser's.
export function createKeyListener(now: () => number = Date.now) {
  let state: ShortcutState = IDLE;
  return (event: KeyEventLike): void => {
    if (event.defaultPrevented) {
      state = IDLE;
      return;
    }
    const inTextField = isTextFieldTarget(event.target as { tagName?: string } | null);
    const resolved = resolveShortcut(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
        inTextField,
      },
      state,
      now(),
    );
    state = resolved.state;
    if (resolved.action === null) {
      if (state.goPrefixAtMs === null) {
        pending = null;
      }
      return;
    }
    pending = null;
    if (dispatchShortcut(resolved.action)) {
      event.preventDefault();
    }
  };
}

// Installs the listener on the window; returns the uninstall.
export function installShortcuts(target: {
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
}): () => void {
  const listener = createKeyListener();
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
