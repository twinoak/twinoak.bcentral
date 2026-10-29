import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fakeStorage } from "../test-support/fakeStorage.ts";

const STORAGE_KEY = "bcentral.settings";

// The device id must be a ULID exactly as the contract defines one.
function contractUlidPattern(): RegExp {
  const text = readFileSync(new URL("../../../contract/journal.schema.json", import.meta.url), "utf8");
  const schema = JSON.parse(text) as { $defs: { ulid: { pattern: string } } };
  return new RegExp(schema.$defs.ulid.pattern);
}

async function loadSettings() {
  vi.resetModules();
  return await import("./settings.svelte.ts");
}

describe("settings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with defaults and no operator name", async () => {
    const { settings, hasOperatorName, DEFAULT_BLIND_AFTER_MINUTES } = await loadSettings();
    expect(settings.operatorName).toBe("");
    expect(settings.hubUrl).toBe("");
    expect(settings.blindAfterMinutes).toBe(15);
    expect(DEFAULT_BLIND_AFTER_MINUTES).toBe(15);
    expect(hasOperatorName()).toBe(false);
  });

  it("mints a device id that matches the contract's ULID pattern", async () => {
    const { settings, ULID_PATTERN } = await loadSettings();
    const pattern = contractUlidPattern();
    expect(ULID_PATTERN.source).toBe(pattern.source);
    expect(settings.deviceId).toMatch(pattern);
  });

  it("keeps the same device id across reloads, even before the first save", async () => {
    const first = await loadSettings();
    const second = await loadSettings();
    expect(second.settings.deviceId).toBe(first.settings.deviceId);
  });

  it("persists updates across a reload", async () => {
    const first = await loadSettings();
    first.updateSettings({
      operatorName: "Thomas",
      hubUrl: "https://hub.example.org",
      blindAfterMinutes: 30,
    });
    expect(first.hasOperatorName()).toBe(true);

    const second = await loadSettings();
    expect(second.settings.operatorName).toBe("Thomas");
    expect(second.settings.hubUrl).toBe("https://hub.example.org");
    expect(second.settings.blindAfterMinutes).toBe(30);
    expect(second.settings.deviceId).toBe(first.settings.deviceId);
  });

  it("treats a whitespace-only operator name as missing", async () => {
    const { updateSettings, hasOperatorName } = await loadSettings();
    updateSettings({ operatorName: "   " });
    expect(hasOperatorName()).toBe(false);
  });

  it("recovers from a damaged record with defaults and a fresh, persisted device id", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { settings } = await loadSettings();
    expect(settings.operatorName).toBe("");
    expect(settings.deviceId).toMatch(contractUlidPattern());

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as { deviceId?: string };
    expect(stored.deviceId).toBe(settings.deviceId);
  });

  it("falls back to the default when the stored blind time is not a positive integer", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ deviceId: "01JB8ZK3QX9V2M4N6P8R0T2W4Y", blindAfterMinutes: 0 }),
    );
    const first = await loadSettings();
    expect(first.settings.blindAfterMinutes).toBe(15);
    expect(first.settings.deviceId).toBe("01JB8ZK3QX9V2M4N6P8R0T2W4Y");

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ deviceId: "01JB8ZK3QX9V2M4N6P8R0T2W4Y", blindAfterMinutes: "20" }),
    );
    const second = await loadSettings();
    expect(second.settings.blindAfterMinutes).toBe(15);
  });

  it("defaults the send attempts to 3, keeps 1–10, and falls back otherwise", async () => {
    const { settings, DEFAULT_MAX_SEND_ATTEMPTS, updateSettings } = await loadSettings();
    expect(settings.maxSendAttempts).toBe(3);
    expect(DEFAULT_MAX_SEND_ATTEMPTS).toBe(3);
    updateSettings({ maxSendAttempts: 5 });
    const reloaded = await loadSettings();
    expect(reloaded.settings.maxSendAttempts).toBe(5);

    for (const bad of [0, 11, 2.5, "3"]) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ deviceId: "01JB8ZK3QX9V2M4N6P8R0T2W4Y", maxSendAttempts: bad }),
      );
      const { settings: fresh } = await loadSettings();
      expect(fresh.maxSendAttempts).toBe(3);
    }
  });

  it("replaces a stored device id that is not a ULID", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId: "not-a-ulid" }));
    const { settings } = await loadSettings();
    expect(settings.deviceId).not.toBe("not-a-ulid");
    expect(settings.deviceId).toMatch(contractUlidPattern());
  });
});
