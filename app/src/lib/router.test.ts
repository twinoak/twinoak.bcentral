import { describe, expect, it } from "vitest";
import { hashFor, parseHash } from "./router.svelte.ts";

describe("hash routing", () => {
  // Acceptance (P2-02): there is no home page; `/#/` renders the journal.
  it("the root, no hash and an unknown hash open the journal", () => {
    expect(parseHash("#/")).toBe("journal");
    expect(parseHash("")).toBe("journal");
    expect(parseHash("#")).toBe("journal");
    expect(parseHash("#/home")).toBe("journal");
    expect(parseHash("#/send")).toBe("journal");
  });

  it("every screen round-trips through hashFor", () => {
    for (const route of [
      "settings",
      "journal",
      "queue",
      "register",
      "printRegister",
      "radio",
      "print",
      "handover",
      "styleguide",
    ] as const) {
      expect(parseHash(hashFor(route))).toBe(route);
    }
    expect(hashFor("printRegister")).toBe("#/register/print");
  });
});
