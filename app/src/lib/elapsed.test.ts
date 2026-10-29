import { beforeAll, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { formatElapsed } from "./elapsed.ts";

describe("formatElapsed", () => {
  beforeAll(() => {
    setLanguage("en");
  });

  it("uses seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0 s");
    expect(formatElapsed(999)).toBe("0 s");
    expect(formatElapsed(12_000)).toBe("12 s");
    expect(formatElapsed(59_999)).toBe("59 s");
  });

  it("uses minutes under an hour", () => {
    expect(formatElapsed(60_000)).toBe("1 min");
    expect(formatElapsed(3_599_999)).toBe("59 min");
  });

  it("uses hours and minutes from an hour on", () => {
    expect(formatElapsed(3_600_000)).toBe("1 h 0 min");
    expect(formatElapsed(5_400_000)).toBe("1 h 30 min");
    expect(formatElapsed(90_000_000)).toBe("25 h 0 min");
  });

  it("never goes negative", () => {
    expect(formatElapsed(-5000)).toBe("0 s");
  });

  it("is translated", () => {
    setLanguage("da");
    expect(formatElapsed(3_600_000)).toBe("1 t 0 min");
    setLanguage("en");
  });
});
