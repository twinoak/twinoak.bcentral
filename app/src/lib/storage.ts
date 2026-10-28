// The one place that touches localStorage. Everything persisted in phase 0 that is not
// journal data (settings, language) goes through here, so tests can stub a single global.

function storage(): Storage | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  return localStorage;
}

export function readStorage(key: string): string | null {
  const store = storage();
  if (!store) {
    return null;
  }
  return store.getItem(key);
}

export function writeStorage(key: string, value: string): void {
  const store = storage();
  if (!store) {
    return;
  }
  store.setItem(key, value);
}
