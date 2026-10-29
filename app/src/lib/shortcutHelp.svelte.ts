// Whether the `?` overlay (components/ShortcutHelp.svelte) is open. Session state; opened by
// the ? key, the top bar's ? button and the settings page, closed by Esc or its button.

let open = $state(false);

export function helpOpen(): boolean {
  return open;
}

export function openHelp(): void {
  open = true;
}

export function closeHelp(): void {
  open = false;
}

export function toggleHelp(): void {
  open = !open;
}
