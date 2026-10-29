import { describe, expect, it } from "vitest";
import { createUpdater, type RegisterOptions, type UpdateChecker } from "./updates.svelte.ts";

function setUp() {
  let clock = 0;
  const now = () => new Date(1_761_700_000_000 + clock * 1000).toISOString();
  const tick = () => {
    clock += 1;
  };
  const updater = createUpdater({ now });

  let options: RegisterOptions | undefined;
  const activations: boolean[] = [];
  let updateCalls = 0;
  let failUpdate = false;
  const registration: UpdateChecker = {
    async update() {
      updateCalls += 1;
      if (failUpdate) {
        throw new TypeError("Failed to fetch");
      }
    },
  };
  const register = (opts: RegisterOptions) => {
    options = opts;
    return async (reloadPage?: boolean) => {
      activations.push(reloadPage === true);
    };
  };

  return {
    updater,
    register,
    registration,
    tick,
    now,
    activations,
    get options() {
      if (!options) {
        throw new Error("start() was not called");
      }
      return options;
    },
    get updateCalls() {
      return updateCalls;
    },
    setFailUpdate(value: boolean) {
      failUpdate = value;
    },
  };
}

describe("updater", () => {
  it("knows nothing before the service worker is registered", () => {
    const { updater } = setUp();
    expect(updater.registered()).toBe(false);
    expect(updater.updateAvailable()).toBe(false);
    expect(updater.lastCheckedAt()).toBeNull();
    expect(updater.lastCheckError()).toBeNull();
  });

  it("registration counts as the first check", () => {
    const t = setUp();
    t.updater.start(t.register);
    expect(t.updater.registered()).toBe(false);
    const at = t.now();
    t.options.onRegisteredSW?.("/sw.js", t.registration as unknown as ServiceWorkerRegistration);
    expect(t.updater.registered()).toBe(true);
    expect(t.updater.lastCheckedAt()).toBe(at);
    expect(t.updater.updateAvailable()).toBe(false);
  });

  it("a new worker waiting makes the update available; nothing activates by itself", () => {
    const t = setUp();
    t.updater.start(t.register);
    t.options.onNeedRefresh?.();
    expect(t.updater.updateAvailable()).toBe(true);
    expect(t.activations).toEqual([]);
  });

  it("reload activates the waiting worker and reloads, only when one is waiting", async () => {
    const t = setUp();
    t.updater.start(t.register);
    await t.updater.reload();
    expect(t.activations).toEqual([]);
    t.options.onNeedRefresh?.();
    await t.updater.reload();
    expect(t.activations).toEqual([true]);
  });

  it("checkNow asks the registration and moves the timestamp", async () => {
    const t = setUp();
    t.updater.start(t.register);
    t.options.onRegisteredSW?.("/sw.js", t.registration as unknown as ServiceWorkerRegistration);
    const first = t.updater.lastCheckedAt();
    t.tick();
    await t.updater.checkNow();
    expect(t.updateCalls).toBe(1);
    expect(t.updater.lastCheckedAt()).toBe(t.now());
    expect(t.updater.lastCheckedAt()).not.toBe(first);
    expect(t.updater.checking()).toBe(false);
  });

  it("a failed check keeps the last timestamp and records the error", async () => {
    const t = setUp();
    t.updater.start(t.register);
    t.options.onRegisteredSW?.("/sw.js", t.registration as unknown as ServiceWorkerRegistration);
    const first = t.updater.lastCheckedAt();
    t.tick();
    t.setFailUpdate(true);
    await t.updater.checkNow();
    expect(t.updater.lastCheckedAt()).toBe(first);
    expect(t.updater.lastCheckError()).toBe("Failed to fetch");
    t.setFailUpdate(false);
    await t.updater.checkNow();
    expect(t.updater.lastCheckError()).toBeNull();
    expect(t.updater.lastCheckedAt()).toBe(t.now());
  });

  it("checkNow does nothing without a registration (dev server, no service worker)", async () => {
    const t = setUp();
    t.updater.start(t.register);
    await t.updater.checkNow();
    expect(t.updateCalls).toBe(0);
    expect(t.updater.lastCheckedAt()).toBeNull();
  });

  it("a registration error is shown as the last error", () => {
    const t = setUp();
    t.updater.start(t.register);
    t.options.onRegisterError?.(new Error("SecurityError"));
    expect(t.updater.lastCheckError()).toBe("SecurityError");
    expect(t.updater.registered()).toBe(false);
  });
});
