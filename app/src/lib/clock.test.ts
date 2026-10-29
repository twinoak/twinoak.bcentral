import { describe, expect, it, vi } from "vitest";

// A fresh module per test is a fresh session: clock trust is never persisted.
async function loadClock() {
  vi.resetModules();
  return await import("./clock.svelte.ts");
}

describe("clock trust", () => {
  it("starts as unknown in a new session", async () => {
    const clock = await loadClock();
    expect(clock.clockTrust()).toBe("unknown");
    expect(clock.now().clockTrust).toBe("unknown");
  });

  it("becomes manual when the operator confirms the clock, and unknown again when unticked", async () => {
    const clock = await loadClock();
    clock.setClockConfirmed(true);
    expect(clock.clockTrust()).toBe("manual");
    expect(clock.now().clockTrust).toBe("manual");
    clock.setClockConfirmed(false);
    expect(clock.clockTrust()).toBe("unknown");
  });

  it("reports ntp once synced this session and is not downgraded by hand", async () => {
    const clock = await loadClock();
    clock.markClockSynced();
    expect(clock.clockTrust()).toBe("ntp");
    clock.setClockConfirmed(false);
    expect(clock.clockTrust()).toBe("ntp");
    clock.setClockConfirmed(true);
    expect(clock.clockTrust()).toBe("ntp");
  });

  it("does not carry a confirmation over to the next session", async () => {
    const first = await loadClock();
    first.setClockConfirmed(true);
    const second = await loadClock();
    expect(second.clockTrust()).toBe("unknown");
  });

  it("stamps the current time as an RFC 3339 UTC timestamp", async () => {
    const clock = await loadClock();
    const before = Date.now();
    const reading = clock.now();
    const after = Date.now();
    expect(reading.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const stamped = Date.parse(reading.timestamp);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});
