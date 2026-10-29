// The installed app's updates. The service worker is registered with registerType "prompt"
// (vite.config.ts): a new build is downloaded and then waits; it takes over only when the
// operator clicks "reload" (reload() below). Nothing ever swaps under a running staff.
//
// Session state, never persisted: "last checked" is this session's checks. The browser
// checks for a new worker on its own on every launch (that is onRegisteredSW) and about
// once a day while the app is open; "Check now" asks explicitly.
//
// The virtual module `virtual:pwa-register` is imported by main.ts, not here, so nothing a
// test imports pulls it into the node environment; main.ts hands registerSW to start().

export interface RegisterOptions {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (
    swScriptUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  onRegisterError?: (error: unknown) => void;
}

// The shape of registerSW from virtual:pwa-register: registers, returns the function that
// activates a waiting worker (and reloads the page when it has taken over).
export type RegisterSW = (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;

// The part of ServiceWorkerRegistration the updater uses; a test passes a fake.
export interface UpdateChecker {
  update(): Promise<unknown>;
}

export interface UpdaterDeps {
  now: () => string;
}

export interface Updater {
  start(register: RegisterSW): void;
  // True once the service worker is registered in this browser; false in the dev server and
  // in a browser without service workers, where there is nothing to check.
  registered(): boolean;
  updateAvailable(): boolean;
  // ISO timestamp of the last completed check for a new version this session, or null.
  lastCheckedAt(): string | null;
  checking(): boolean;
  // Why the last explicit check failed (offline, for one), or null.
  lastCheckError(): string | null;
  checkNow(): Promise<void>;
  // Activates the waiting worker and reloads. Does nothing when no update is waiting.
  reload(): Promise<void>;
}

export function createUpdater(deps: UpdaterDeps): Updater {
  let isRegistered = $state(false);
  let available = $state(false);
  let lastChecked: string | null = $state(null);
  let isChecking = $state(false);
  let lastError: string | null = $state(null);
  let registration: UpdateChecker | undefined;
  let activate: ((reloadPage?: boolean) => Promise<void>) | undefined;

  function start(register: RegisterSW): void {
    activate = register({
      onNeedRefresh() {
        available = true;
      },
      onRegisteredSW(_url, reg) {
        isRegistered = true;
        registration = reg;
        // Registration includes the browser's own check for a new worker.
        lastChecked = deps.now();
      },
      onRegisterError(error) {
        lastError = error instanceof Error ? error.message : String(error);
      },
    });
  }

  async function checkNow(): Promise<void> {
    if (!registration || isChecking) {
      return;
    }
    isChecking = true;
    try {
      await registration.update();
      lastChecked = deps.now();
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      isChecking = false;
    }
  }

  async function reload(): Promise<void> {
    if (!available || !activate) {
      return;
    }
    await activate(true);
  }

  return {
    start,
    registered: () => isRegistered,
    updateAvailable: () => available,
    lastCheckedAt: () => lastChecked,
    checking: () => isChecking,
    lastCheckError: () => lastError,
    checkNow,
    reload,
  };
}

// The app's updater. main.ts starts it with registerSW from virtual:pwa-register.
export const updater: Updater = createUpdater({ now: () => new Date().toISOString() });
