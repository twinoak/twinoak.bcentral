import { describe, expect, it } from "vitest";
import { createPersistence, formatBytes, type StorageManagerLike } from "./persistence.svelte.ts";

function fakeStorage(options: {
  persist?: boolean | Error;
  estimate?: { usage?: number; quota?: number } | Error;
}): StorageManagerLike {
  const storage: StorageManagerLike = {};
  if (options.persist !== undefined) {
    const answer = options.persist;
    storage.persist = async () => {
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    };
  }
  if (options.estimate !== undefined) {
    const answer = options.estimate;
    storage.estimate = async () => {
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    };
  }
  return storage;
}

describe("persistent storage", () => {
  it("knows nothing before start", () => {
    const persistence = createPersistence({ storage: () => fakeStorage({ persist: true }) });
    expect(persistence.persisted()).toBeNull();
    expect(persistence.usage()).toBeNull();
  });

  it("persist() granted drives persisted() true, with the estimate", async () => {
    const persistence = createPersistence({
      storage: () =>
        fakeStorage({ persist: true, estimate: { usage: 1_500_000, quota: 2_000_000_000 } }),
    });
    await persistence.start();
    expect(persistence.persisted()).toBe(true);
    expect(persistence.usage()).toEqual({ usage: 1_500_000, quota: 2_000_000_000 });
  });

  it("persist() refused drives persisted() false", async () => {
    const persistence = createPersistence({ storage: () => fakeStorage({ persist: false }) });
    await persistence.start();
    expect(persistence.persisted()).toBe(false);
    expect(persistence.usage()).toBeNull();
  });

  it("no storage API, or one that throws, is a refusal: nothing was promised", async () => {
    const none = createPersistence({ storage: () => undefined });
    await none.start();
    expect(none.persisted()).toBe(false);

    const noPersist = createPersistence({
      storage: () => fakeStorage({ estimate: { usage: 1, quota: 2 } }),
    });
    await noPersist.start();
    expect(noPersist.persisted()).toBe(false);
    expect(noPersist.usage()).toEqual({ usage: 1, quota: 2 });

    const throwing = createPersistence({
      storage: () => fakeStorage({ persist: new TypeError("no"), estimate: new TypeError("no") }),
    });
    await throwing.start();
    expect(throwing.persisted()).toBe(false);
    expect(throwing.usage()).toBeNull();
  });

  it("an estimate without both numbers is no estimate; refreshUsage reads it again", async () => {
    const answer: { usage: number; quota?: number } = { usage: 10 };
    const persistence = createPersistence({
      storage: () => fakeStorage({ persist: true, estimate: { ...answer } }),
    });
    await persistence.start();
    expect(persistence.usage()).toBeNull();
    answer.quota = 100;
    await persistence.refreshUsage();
    expect(persistence.usage()).toEqual({ usage: 10, quota: 100 });
  });

  it("formats bytes as MB under a GB and as GB from there", () => {
    expect(formatBytes(1_500_000, "en")).toBe("1.4 MB");
    expect(formatBytes(0, "en")).toBe("0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024, "en")).toBe("2 GB");
    expect(formatBytes(1_500_000, "da")).toBe("1,4 MB");
  });
});
