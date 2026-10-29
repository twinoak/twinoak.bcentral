// Persistent storage (P1-04). On start the app asks the browser to keep its storage
// (navigator.storage.persist()): with "persistent" storage the browser does not evict the
// journal under storage pressure. Chromium grants it without a prompt to an installed PWA
// and refuses it quietly otherwise; a refusal is shown in the top bar with the remedy (set a
// journal folder). The usage estimate is shown under Settings → About.
//
// Session state, not stored. The browser's StorageManager is a dependency so tests pass a
// fake; a browser without the API counts as a refusal, since nothing was promised.

export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface StorageUsage {
  usage: number;
  quota: number;
}

export interface PersistenceDeps {
  storage: () => StorageManagerLike | undefined;
}

export interface Persistence {
  start(): Promise<void>;
  // null until start() has an answer; then whether the browser promised to keep the storage.
  persisted(): boolean | null;
  // null until estimated, or when the browser gives no estimate.
  usage(): StorageUsage | null;
  refreshUsage(): Promise<void>;
}

export function createPersistence(deps: PersistenceDeps): Persistence {
  let isPersisted: boolean | null = $state(null);
  let estimate: StorageUsage | null = $state(null);

  async function refreshUsage(): Promise<void> {
    const storage = deps.storage();
    if (storage?.estimate === undefined) {
      estimate = null;
      return;
    }
    try {
      const result = await storage.estimate();
      estimate =
        result.usage === undefined || result.quota === undefined
          ? null
          : { usage: result.usage, quota: result.quota };
    } catch {
      estimate = null;
    }
  }

  async function start(): Promise<void> {
    const storage = deps.storage();
    if (storage?.persist === undefined) {
      isPersisted = false;
    } else {
      try {
        isPersisted = await storage.persist();
      } catch {
        isPersisted = false;
      }
    }
    await refreshUsage();
  }

  return {
    start,
    persisted: () => isPersisted,
    usage: () => estimate,
    refreshUsage,
  };
}

// "12.3 MB" / "1.2 GB", for the About section.
export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  const format = (value: number, unit: "megabyte" | "gigabyte") =>
    new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: 1 }).format(value);
  return mb >= 1024 ? format(mb / 1024, "gigabyte") : format(mb, "megabyte");
}

// The app's persistence. main.ts starts it.
export const persistence: Persistence = createPersistence({
  storage: () => (typeof navigator === "undefined" ? undefined : navigator.storage),
});
