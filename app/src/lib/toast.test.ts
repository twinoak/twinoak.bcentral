import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadToast() {
  vi.resetModules();
  return await import("./toast.svelte.ts");
}

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a confirmation and drops it after four seconds", async () => {
    const toast = await loadToast();
    expect(toast.toast()).toBeNull();
    toast.showToast("Saved.");
    expect(toast.toast()).toBe("Saved.");
    vi.advanceTimersByTime(toast.TOAST_MS - 1);
    expect(toast.toast()).toBe("Saved.");
    vi.advanceTimersByTime(1);
    expect(toast.toast()).toBeNull();
  });

  // One at a time: the newer confirmation replaces the older and gets its own four seconds.
  it("a second toast replaces the first and restarts the clock", async () => {
    const toast = await loadToast();
    toast.showToast("Saved.");
    vi.advanceTimersByTime(3000);
    toast.showToast("Exported journal.json");
    expect(toast.toast()).toBe("Exported journal.json");
    vi.advanceTimersByTime(3000);
    expect(toast.toast()).toBe("Exported journal.json");
    vi.advanceTimersByTime(1000);
    expect(toast.toast()).toBeNull();
  });

  it("dismiss clears it at once", async () => {
    const toast = await loadToast();
    toast.showToast("Printed");
    toast.dismissToast();
    expect(toast.toast()).toBeNull();
    vi.advanceTimersByTime(toast.TOAST_MS);
    expect(toast.toast()).toBeNull();
  });
});
