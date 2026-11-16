import { describe, expect, it } from "vitest";
import {
  filterByRadio,
  filterRegister,
  matchesQuery,
  matchesRadioFilter,
  RADIO_FILTERS,
} from "./registerFilter.ts";

const hans = {
  label: "Hans",
  person: "Hans Jensen",
  street: "Nørregade",
  role: "vejkontakt",
  publicKey: "7a".repeat(32),
};
const radio = {
  label: "radio #7",
  notes: "out of service since 12:40",
  publicKey: "7b".repeat(32),
};
const grethe: { label: string; phone: string; publicKey?: string } = {
  label: "Grethe",
  phone: "12 34 56 78",
};

describe("matchesQuery", () => {
  it("matches a substring of any field, case-folded, the phone too", () => {
    expect(matchesQuery(hans, "jens")).toBe(true);
    expect(matchesQuery(hans, "NØRRE")).toBe(true);
    expect(matchesQuery(hans, "kontakt")).toBe(true);
    expect(matchesQuery(radio, "#7")).toBe(true);
    expect(matchesQuery(radio, "service")).toBe(true);
    expect(matchesQuery(grethe, "34 56")).toBe(true);
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

describe("the radio filter (P3-06)", () => {
  it("All, Has radio, No radio, in the select's order", () => {
    expect(RADIO_FILTERS).toEqual(["all", "radio", "noRadio"]);
    expect(matchesRadioFilter(hans, "all")).toBe(true);
    expect(matchesRadioFilter(grethe, "all")).toBe(true);
    expect(matchesRadioFilter(hans, "radio")).toBe(true);
    expect(matchesRadioFilter(grethe, "radio")).toBe(false);
    expect(matchesRadioFilter(hans, "noRadio")).toBe(false);
    expect(matchesRadioFilter(grethe, "noRadio")).toBe(true);
  });

  it("filterByRadio keeps the order and composes with the search", () => {
    const all = [hans, grethe, radio];
    expect(filterByRadio(all, "radio").map((entry) => entry.label)).toEqual(["Hans", "radio #7"]);
    expect(filterByRadio(all, "noRadio").map((entry) => entry.label)).toEqual(["Grethe"]);
    expect(filterByRadio(filterRegister(all, "e"), "noRadio").map((entry) => entry.label)).toEqual([
      "Grethe",
    ]);
  });
});
