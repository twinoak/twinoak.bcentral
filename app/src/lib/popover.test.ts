import { describe, expect, it, vi } from "vitest";

async function loadPopover() {
  vi.resetModules();
  return await import("./popover.svelte.ts");
}

describe("popover state", () => {
  it("starts with none open", async () => {
    const popover = await loadPopover();
    expect(popover.popoverOpen()).toBeNull();
    expect(popover.isPopoverOpen("radio")).toBe(false);
  });

  // Acceptance: only one popover is open at a time.
  it("opening a second popover closes the first", async () => {
    const popover = await loadPopover();
    popover.openPopover("radio");
    expect(popover.isPopoverOpen("radio")).toBe(true);
    popover.openPopover("clock");
    expect(popover.popoverOpen()).toBe("clock");
    expect(popover.isPopoverOpen("radio")).toBe(false);
  });

  it("toggle opens, then closes, the same popover", async () => {
    const popover = await loadPopover();
    popover.togglePopover("storage");
    expect(popover.popoverOpen()).toBe("storage");
    popover.togglePopover("storage");
    expect(popover.popoverOpen()).toBeNull();
  });

  it("closing by id leaves another popover alone; closing without an id closes whatever is open", async () => {
    const popover = await loadPopover();
    popover.openPopover("incident");
    popover.closePopover("radio");
    expect(popover.popoverOpen()).toBe("incident");
    popover.closePopover("incident");
    expect(popover.popoverOpen()).toBeNull();
    popover.openPopover("update");
    popover.closePopover();
    expect(popover.popoverOpen()).toBeNull();
  });
});
