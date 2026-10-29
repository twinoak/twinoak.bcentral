// A journal store on fake-indexeddb for tests: fresh database name per call, the walkthrough's
// device id, and a clock that steps one second per reading so timestamps are deterministic.
// Importing this module installs the fake IndexedDB globals.

import "fake-indexeddb/auto";
import { openJournalStore, type JournalStore } from "../store/journalStore.ts";
import type { Clock, ClockReading, ClockTrust } from "../store/types.ts";

// The device in contract/examples/walkthrough.json.
export const TEST_DEVICE_ID = "01JB8ZK3QX9V2M4N6P8R0T2W4Y";

export const TEST_CLOCK_START = Date.parse("2026-10-28T19:00:00Z");

let databases = 0;

export function uniqueDatabaseName(): string {
  databases += 1;
  return `test-${Date.now()}-${databases}`;
}

export function steppingClock(start = TEST_CLOCK_START, clockTrust: ClockTrust = "manual"): Clock {
  let ticks = 0;
  return (): ClockReading => {
    const reading = { timestamp: new Date(start + ticks * 1000).toISOString(), clockTrust };
    ticks += 1;
    return reading;
  };
}

export interface TestStoreOptions {
  name?: string;
  deviceId?: string;
  clock?: Clock;
}

export async function openTestStore(options: TestStoreOptions = {}): Promise<JournalStore> {
  return await openJournalStore({
    name: options.name ?? uniqueDatabaseName(),
    deviceId: options.deviceId ?? TEST_DEVICE_ID,
    clock: options.clock ?? steppingClock(),
  });
}
