// Plain JSON i18n with a tiny t(). en.json is the reference; da.json must have every key
// (i18n.test.ts fails otherwise). The current language is rune state, so t() calls in
// templates re-render when the language changes.

import en from "./en.json";
import da from "./da.json";
import { readStorage, writeStorage } from "../lib/storage.ts";

export type Language = "en" | "da";

export const languages: readonly Language[] = ["da", "en"];
export const FALLBACK_LANGUAGE: Language = "da";

const STORAGE_KEY = "bcentral.language";

const catalogs: Record<Language, Record<string, string>> = { en, da };

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "da";
}

// First browser language we have a catalog for, else Danish.
export function detectLanguage(browserLanguages: readonly string[]): Language {
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base)) {
      return base;
    }
  }
  return FALLBACK_LANGUAGE;
}

function initialLanguage(): Language {
  const stored = readStorage(STORAGE_KEY);
  if (isLanguage(stored)) {
    return stored;
  }
  if (typeof navigator === "undefined") {
    return FALLBACK_LANGUAGE;
  }
  return detectLanguage(navigator.languages ?? []);
}

let current: Language = $state(initialLanguage());

export function language(): Language {
  return current;
}

export function setLanguage(next: Language): void {
  current = next;
  writeStorage(STORAGE_KEY, next);
}

export type Params = Record<string, string | number>;

// Looks the key up in the current language, then English, then returns the key itself.
// `{name}` placeholders are replaced from params; unknown placeholders are left as they are.
export function t(key: string, params?: Params): string {
  const template = catalogs[current][key] ?? catalogs.en[key] ?? key;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
