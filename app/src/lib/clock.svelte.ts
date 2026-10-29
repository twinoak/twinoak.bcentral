// How far this device's clock can be trusted right now (contract: clockTrust). Session state,
// never persisted: a browser restart is a new session, so the operator confirms again.
//
//   ntp      the app has checked its clock against a trusted source this session. Phase 0
//            never does; markClockSynced() is the hook for when it can.
//   manual   the operator has confirmed in settings that the PC's clock is correct.
//   unknown  neither.

import type { ClockReading, ClockTrust } from "../store/types.ts";

let trust: ClockTrust = $state("unknown");

export function clockTrust(): ClockTrust {
  return trust;
}

// The settings control "the clock on this PC is correct". Unticking goes back to unknown.
// A clock already confirmed against a trusted source is not downgraded by hand.
export function setClockConfirmed(confirmed: boolean): void {
  if (trust === "ntp") {
    return;
  }
  trust = confirmed ? "manual" : "unknown";
}

// Hook for a later phase: call when the clock has been confirmed against a trusted source
// during this session. Not called anywhere in phase 0.
export function markClockSynced(): void {
  trust = "ntp";
}

// What every write to the journal is stamped with.
export function now(): ClockReading {
  return { timestamp: new Date().toISOString(), clockTrust: trust };
}
