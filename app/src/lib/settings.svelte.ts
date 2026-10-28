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
}

export const STORAGE_KEY = "bcentral.settings";
export const DEFAULT_BLIND_AFTER_MINUTES = 15;

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
  const storedMinutes = stored["blindAfterMinutes"];
  const settings: Settings = {
    operatorName: typeof stored["operatorName"] === "string" ? stored["operatorName"] : "",
    deviceId:
      typeof storedDeviceId === "string" && ULID_PATTERN.test(storedDeviceId)
        ? storedDeviceId
        : ulid(),
    hubUrl: typeof stored["hubUrl"] === "string" ? stored["hubUrl"] : "",
    blindAfterMinutes:
      typeof storedMinutes === "number" && Number.isInteger(storedMinutes) && storedMinutes >= 1
        ? storedMinutes
        : DEFAULT_BLIND_AFTER_MINUTES,
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
  persist(settings);
}

// The operator name is required before anything else can be done.
export function hasOperatorName(): boolean {
  return settings.operatorName.trim() !== "";
}
