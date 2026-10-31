import { describe, expect, it } from "vitest";
import { groupByStreet, groupChoice } from "./recipientGroups.ts";

const entries = [
  { id: "a", label: "Hans", street: "Nørregade" },
  { id: "b", label: "Peter", street: "Søndergade" },
  { id: "c", label: "radio #4" },
  { id: "d", label: "Lise", street: " Nørregade " },
  { id: "e", label: "Ole", street: "Østergade 2" },
  { id: "f", label: "Eva", street: "Østergade 10" },
  { id: "g", label: "Bo", street: "" },
];

describe("groupByStreet", () => {
  it("groups by the trimmed street, in the collator's order, the entries in their order", () => {
    const groups = groupByStreet(entries, "da");
    expect(groups.map((group) => group.street)).toEqual([
      "Nørregade",
      "Søndergade",
      "Østergade 2",
      "Østergade 10",
      null,
    ]);
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(["a", "d"]);
    expect(groups[4]?.entries.map((entry) => entry.id)).toEqual(["c", "g"]);
  });

  it("has no empty group: no 'no street' group when every entry has one", () => {
    const groups = groupByStreet(
      entries.filter((entry) => (entry.street ?? "").trim() !== ""),
      "da",
    );
    expect(groups.some((group) => group.street === null)).toBe(false);
    expect(groupByStreet([], "da")).toEqual([]);
  });

  it("two spellings are two streets: nothing is matched loosely", () => {
    const groups = groupByStreet(
      [
        { id: "a", street: "Nørregade" },
        { id: "b", street: "Nørregade 4" },
      ],
      "da",
    );
    expect(groups).toHaveLength(2);
  });
});

describe("groupChoice", () => {
  const members = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("is all, some or none by how many members are chosen", () => {
    expect(groupChoice(members, () => true)).toBe("all");
    expect(groupChoice(members, () => false)).toBe("none");
    expect(groupChoice(members, (id) => id === "b")).toBe("some");
  });

  it("an empty group is none", () => {
    expect(groupChoice([], () => true)).toBe("none");
  });
});
