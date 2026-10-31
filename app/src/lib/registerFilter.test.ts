import { describe, expect, it } from "vitest";
import { filterRegister, matchesQuery } from "./registerFilter.ts";

const hans = { label: "Hans", person: "Hans Jensen", street: "Nørregade", role: "vejkontakt" };
const radio = { label: "radio #7", notes: "out of service since 12:40" };

describe("matchesQuery", () => {
  it("matches a substring of any field, case-folded", () => {
    expect(matchesQuery(hans, "jens")).toBe(true);
    expect(matchesQuery(hans, "NØRRE")).toBe(true);
    expect(matchesQuery(hans, "kontakt")).toBe(true);
    expect(matchesQuery(radio, "#7")).toBe(true);
    expect(matchesQuery(radio, "service")).toBe(true);
  });

  it("is a substring, not a word or a fuzzy match", () => {
    expect(matchesQuery(hans, "Hans Jensen")).toBe(true);
    expect(matchesQuery(hans, "Jensen Hans")).toBe(false);
    expect(matchesQuery(hans, "Hanz")).toBe(false);
  });

  it("an empty or blank query matches everything", () => {
    expect(matchesQuery(radio, "")).toBe(true);
    expect(matchesQuery(radio, "   ")).toBe(true);
  });

  it("filterRegister keeps the order", () => {
    expect(filterRegister([hans, radio], "o").map((entry) => entry.label)).toEqual([
      "Hans",
      "radio #7",
    ]);
    expect(filterRegister([hans, radio], "zzz")).toEqual([]);
  });
});
