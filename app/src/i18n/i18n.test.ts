import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "./en.json";
import da from "./da.json";
import { fakeStorage } from "../test-support/fakeStorage.ts";

const enKeys = Object.keys(en);
const daKeys = Object.keys(da);

describe("catalog completeness (en.json is the reference)", () => {
  it("da.json has every key that en.json has", () => {
    const missing = enKeys.filter((key) => !daKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("da.json has no key that en.json lacks", () => {
    const stale = daKeys.filter((key) => !enKeys.includes(key));
    expect(stale).toEqual([]);
  });

  it("no value is empty", () => {
    const empty = [
      ...Object.entries(en).filter(([, value]) => value.trim() === ""),
      ...Object.entries(da).filter(([, value]) => value.trim() === ""),
    ].map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("every placeholder in an English string is also in the Danish one", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const daCatalog: Record<string, string> = da;
    const mismatched = enKeys.filter(
      (key) =>
        JSON.stringify(placeholders(en[key as keyof typeof en])) !==
        JSON.stringify(placeholders(daCatalog[key] ?? "")),
    );
    expect(mismatched).toEqual([]);
  });
});

async function loadI18n() {
  vi.resetModules();
  return await import("./index.svelte.ts");
}

describe("language selection and t()", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
    vi.stubGlobal("navigator", { languages: ["de-DE", "de"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to Danish when the browser language is not supported", async () => {
    const i18n = await loadI18n();
    expect(i18n.language()).toBe("da");
    expect(i18n.t("settings.save")).toBe(da["settings.save"]);
  });

  it("takes the first supported browser language", async () => {
    vi.stubGlobal("navigator", { languages: ["sv-SE", "en-GB", "da"] });
    const i18n = await loadI18n();
    expect(i18n.language()).toBe("en");
    expect(i18n.t("settings.save")).toBe(en["settings.save"]);
  });

  it("prefers the stored language over the browser language", async () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    localStorage.setItem("bcentral.language", "da");
    const i18n = await loadI18n();
    expect(i18n.language()).toBe("da");
  });

  it("ignores a stored value that is not a supported language", async () => {
    localStorage.setItem("bcentral.language", "klingon");
    const i18n = await loadI18n();
    expect(i18n.language()).toBe("da");
  });

  it("setLanguage switches t() and persists the choice", async () => {
    const i18n = await loadI18n();
    i18n.setLanguage("en");
    expect(i18n.t("settings.save")).toBe(en["settings.save"]);
    expect(localStorage.getItem("bcentral.language")).toBe("en");

    const reloaded = await loadI18n();
    expect(reloaded.language()).toBe("en");
  });

  it("interpolates params and leaves unknown placeholders alone", async () => {
    const i18n = await loadI18n();
    i18n.setLanguage("en");
    expect(i18n.t("topbar.operator", { name: "Thomas" })).toBe("Operator: Thomas");
    expect(i18n.t("topbar.operator")).toBe("Operator: {name}");
    expect(i18n.t("topbar.operator", { other: 1 })).toBe("Operator: {name}");
  });

  it("returns the key itself when no catalog has it", async () => {
    const i18n = await loadI18n();
    expect(i18n.t("no.such.key")).toBe("no.such.key");
  });

  it("detectLanguage picks the first supported tag, else Danish", async () => {
    const { detectLanguage } = await loadI18n();
    expect(detectLanguage(["en-GB"])).toBe("en");
    expect(detectLanguage(["EN"])).toBe("en");
    expect(detectLanguage(["da-DK"])).toBe("da");
    expect(detectLanguage(["de", "fr"])).toBe("da");
    expect(detectLanguage(["nb", "en-US", "da"])).toBe("en");
    expect(detectLanguage([])).toBe("da");
  });
});
