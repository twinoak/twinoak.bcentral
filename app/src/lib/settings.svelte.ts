// Device-local settings in localStorage. The device id is a ULID minted the first time the
// app runs in a browser and never changes afterwards; it is what every journal entry made
// here will carry as deviceId (contract/journal.schema.json).

import { ulid } from "ulid";
import { readStorage, writeStorage } from "./storage.ts";

export interface Settings {
  operatorName: string;
  deviceId: string;
  hubUrl: string;
  blindAfterMinutes: number;
  // How many times a mesh message is transmitted before the app gives up (text-protocol.md:
  // "default 3 attempts, configurable").
  maxSendAttempts: number;
  // The least time between two transmissions of the send-to-all queue (P0-08): the mesh
  // tolerates a handful of messages a minute.
  sendGapSeconds: number;
}

export const STORAGE_KEY = "bcentral.settings";
export const DEFAULT_BLIND_AFTER_MINUTES = 15;
export const DEFAULT_MAX_SEND_ATTEMPTS = 3;
export const MAX_SEND_ATTEMPTS_LIMIT = 10;
export const DEFAULT_SEND_GAP_SECONDS = 10;
export const SEND_GAP_SECONDS_LIMIT = 600;

function positiveInteger(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
}

// Same pattern as $defs/ulid in contract/journal.schema.json.
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStored(raw: string | null): Record<string, unknown> {
  if (raw === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function load(): Settings {
  const stored = parseStored(readStorage(STORAGE_KEY));
  const storedDeviceId = stored["deviceId"];
  const settings: Settings = {
    operatorName: typeof stored["operatorName"] === "string" ? stored["operatorName"] : "",
    deviceId:
      typeof storedDeviceId === "string" && ULID_PATTERN.test(storedDeviceId)
        ? storedDeviceId
        : ulid(),
    hubUrl: typeof stored["hubUrl"] === "string" ? stored["hubUrl"] : "",
    blindAfterMinutes: positiveInteger(stored["blindAfterMinutes"], DEFAULT_BLIND_AFTER_MINUTES),
    maxSendAttempts: positiveInteger(
      stored["maxSendAttempts"],
      DEFAULT_MAX_SEND_ATTEMPTS,
      MAX_SEND_ATTEMPTS_LIMIT,
    ),
    sendGapSeconds: positiveInteger(
      stored["sendGapSeconds"],
      DEFAULT_SEND_GAP_SECONDS,
      SEND_GAP_SECONDS_LIMIT,
    ),
  };
  if (settings.deviceId !== storedDeviceId) {
    // First run (or a damaged record): persist the freshly minted id at once, so a reload
    // before the first save still sees the same device id.
    persist(settings);
  }
  return settings;
}

function persist(value: Settings): void {
  writeStorage(STORAGE_KEY, JSON.stringify(value));
}

export const settings: Settings = $state(load());

export function updateSettings(patch: Partial<Omit<Settings, "deviceId">>): void {
  if (patch.operatorName !== undefined) {
    settings.operatorName = patch.operatorName;
  }
  if (patch.hubUrl !== undefined) {
    settings.hubUrl = patch.hubUrl;
  }
  if (patch.blindAfterMinutes !== undefined) {
    settings.blindAfterMinutes = patch.blindAfterMinutes;
  }
  if (patch.maxSendAttempts !== undefined) {
    settings.maxSendAttempts = patch.maxSendAttempts;
  }
  if (patch.sendGapSeconds !== undefined) {
    settings.sendGapSeconds = patch.sendGapSeconds;
  }
  persist(settings);
}

// The operator name is required before anything else can be done.
export function hasOperatorName(): boolean {
  return settings.operatorName.trim() !== "";
}
