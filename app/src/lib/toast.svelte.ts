// The toast (P2-02, docs/design.md §Components): one confirmation at a time, bottom left,
// gone after TOAST_MS. For confirmations only — saved, exported, printed; an error is an
// inline message next to the thing it is about, never a toast. A new toast replaces the one
// showing and restarts the clock. components/Toast.svelte shows it.

export const TOAST_MS = 4000;

let text: string | null = $state(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(): string | null {
  return text;
}

export function showToast(message: string): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  text = message;
  timer = setTimeout(() => {
    text = null;
    timer = null;
  }, TOAST_MS);
}

export function dismissToast(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  text = null;
}
