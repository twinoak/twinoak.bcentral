// The contrast check that `npm run test` runs over app.css (scripts/check-contrast.mjs),
// exercised here: the maths, the token reading, and the real stylesheet in both modes.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHROME_MIN,
  checkCss,
  checkPairs,
  contrastRatio,
  HIGH_CONTRAST_SELECTOR,
  luminance,
  MIN_FONT_SIZE_PX,
  MIN_LINE_HEIGHT,
  PAIRS,
  readTokens,
  resolveColour,
  TEXT_MIN,
  topLevelCss,
} from "../../scripts/contrast.mjs";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");

describe("WCAG contrast maths", () => {
  it("black on white is 21:1, white on white 1:1, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("luminance follows the sRGB curve", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBe(0);
    // Mid grey #808080 is about 0.2159.
    expect(luminance("#808080")).toBeCloseTo(0.2159, 3);
  });

  it("the thresholds are the task's: 7:1 for text, 3:1 for chrome, 18 px, 1.4", () => {
    expect(TEXT_MIN).toBe(7);
    expect(CHROME_MIN).toBe(3);
    expect(MIN_FONT_SIZE_PX).toBe(18);
    expect(MIN_LINE_HEIGHT).toBe(1.4);
  });
});

describe("reading the tokens", () => {
  const css = `
    /* a comment with :root { --x: #000 } inside */
    :root { --a: #ffffff; --b: var(--a); --c: #123; font-size: 18px; line-height: 1.4; }
    :root[data-contrast="high"] { --a: #000000; }
    @media print { :root { font-size: 11pt; --a: #ff0000; } }
    .other { --a: #00ff00; }
  `;

  it("drops comments and at-rule blocks, keeps top-level rules", () => {
    const top = topLevelCss(css);
    expect(top).not.toContain("11pt");
    expect(top).not.toContain("comment");
    expect(top).toContain(".other");
  });

  it("the high-contrast block overrides the normal one, token by token", () => {
    const { normal, high } = readTokens(css);
    expect(normal["--a"]).toBe("#ffffff");
    expect(normal["font-size"]).toBe("18px");
    expect(high["--a"]).toBe("#000000");
    expect(high["--c"]).toBe("#123");
  });

  it("resolves var() references and refuses a missing or circular token", () => {
    const { normal } = readTokens(css);
    expect(resolveColour(normal, "--b")).toBe("#ffffff");
    expect(() => resolveColour(normal, "--nope")).toThrow(/not declared/);
    expect(() => resolveColour({ "--x": "var(--x)" }, "--x")).toThrow(/itself/);
  });

  it("a failing pair is reported with its ratio and its threshold", () => {
    const results = checkPairs({ "--fg": "#777777", "--bg": "#ffffff" }, [
      { fg: "--fg", bg: "--bg", kind: "text", what: "a test" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.min).toBe(7);
    expect(results[0]?.ratio).toBeLessThan(7);
  });
});

describe("app.css", () => {
  it("declares both modes", () => {
    expect(appCss).toContain(HIGH_CONTRAST_SELECTOR);
  });

  // Acceptance: 7:1 for text and 3:1 for UI chrome in normal and high-contrast mode.
  it("passes every pair in normal and in high-contrast mode, at 18 px and 1.4", () => {
    const { modes, type, failures } = checkCss(appCss);
    expect(failures).toEqual([]);
    expect(modes.normal).toHaveLength(PAIRS.length);
    expect(modes.high).toHaveLength(PAIRS.length);
    expect(modes.normal.every((r) => r.ok)).toBe(true);
    expect(modes.high.every((r) => r.ok)).toBe(true);
    expect(type.fontSizeOk).toBe(true);
    expect(type.lineHeightOk).toBe(true);
  });

  it("a muted grey lightened back to the old value would fail", () => {
    const tampered = appCss.replace("--muted: #475059;", "--muted: #5b6672;");
    const { failures } = checkCss(tampered);
    expect(failures.some((f) => f.startsWith("normal: --muted"))).toBe(true);
  });
});
