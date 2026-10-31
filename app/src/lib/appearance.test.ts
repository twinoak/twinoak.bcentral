import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "../test-support/fakeStorage.ts";
import {
  applyAppearance,
  CONTRAST_ATTRIBUTE,
  FONT_SIZE_ATTRIBUTE,
  type RootLike,
} from "./appearance.ts";

function fakeRoot(): RootLike & { attributes: Map<string, string> } {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

async function loadSettings() {
  vi.resetModules();
  return await import("./settings.svelte.ts");
}

describe("appearance", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normal size and normal contrast leave the root without the attributes", () => {
    const root = fakeRoot();
    root.setAttribute(FONT_SIZE_ATTRIBUTE, "large");
    root.setAttribute(CONTRAST_ATTRIBUTE, "high");
    applyAppearance(root, { fontSize: "normal", highContrast: false });
    expect([...root.attributes.keys()]).toEqual([]);
  });

  it("large and largest set data-font-size; high contrast sets data-contrast", () => {
    const root = fakeRoot();
    applyAppearance(root, { fontSize: "large", highContrast: false });
    expect(root.attributes.get(FONT_SIZE_ATTRIBUTE)).toBe("large");
    expect(root.attributes.has(CONTRAST_ATTRIBUTE)).toBe(false);

    applyAppearance(root, { fontSize: "largest", highContrast: true });
    expect(root.attributes.get(FONT_SIZE_ATTRIBUTE)).toBe("largest");
    expect(root.attributes.get(CONTRAST_ATTRIBUTE)).toBe("high");
  });

  // Acceptance: the font-size setting persists and applies on reload.
  it("the stored text size is applied to the root after a reload", async () => {
    const first = await loadSettings();
    first.updateSettings({ fontSize: "largest", highContrast: true });

    const reloaded = await loadSettings();
    const root = fakeRoot();
    applyAppearance(root, reloaded.settings);
    expect(root.attributes.get(FONT_SIZE_ATTRIBUTE)).toBe("largest");
    expect(root.attributes.get(CONTRAST_ATTRIBUTE)).toBe("high");
  });

  it("the token sheet keys the sizes and the mode on those attributes", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
    expect(css).toContain(`:root[${FONT_SIZE_ATTRIBUTE}="large"]`);
    expect(css).toContain(`:root[${FONT_SIZE_ATTRIBUTE}="largest"]`);
    expect(css).toContain(`:root[${CONTRAST_ATTRIBUTE}="high"]`);
  });
});
