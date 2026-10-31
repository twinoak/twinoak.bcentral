// Which popover is open (P2-02): the status chips in the top bar and the incident switcher
// each open one, and only one is open at a time — opening another closes the first. Session
// state; Esc (components/Popover.svelte registers the cancel shortcut while open), a click
// outside, or the chip's own button closes it.

let open: string | null = $state(null);

export function popoverOpen(): string | null {
  return open;
}

export function isPopoverOpen(id: string): boolean {
  return open === id;
}

export function openPopover(id: string): void {
  open = id;
}

// Without an id closes whatever is open; with one, only that popover (a stale close from a
// popover that has already been replaced does nothing).
export function closePopover(id?: string): void {
  if (id === undefined || open === id) {
    open = null;
  }
}

export function togglePopover(id: string): void {
  open = open === id ? null : id;
}
