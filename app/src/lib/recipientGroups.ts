// The recipient picker's street grouping (P2-04, send to all): the register as groups, one
// per street in the collator's order, the entries without a street last. Pure, so the form
// and a test share one rule; nothing is inferred — a street is the string on the entry,
// trimmed, and two spellings are two streets.

export interface RecipientGroup<T> {
  // The street as written on its entries; null for the group of entries without one.
  street: string | null;
  entries: T[];
}

export function groupByStreet<T extends { id: string; street?: string }>(
  entries: readonly T[],
  locale: string,
): RecipientGroup<T>[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const byStreet = new Map<string, T[]>();
  const without: T[] = [];
  for (const entry of entries) {
    const street = entry.street?.trim() ?? "";
    if (street === "") {
      without.push(entry);
      continue;
    }
    const list = byStreet.get(street) ?? [];
    list.push(entry);
    byStreet.set(street, list);
  }
  const groups: RecipientGroup<T>[] = [...byStreet]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([street, members]) => ({ street, entries: members }));
  if (without.length > 0) {
    groups.push({ street: null, entries: without });
  }
  return groups;
}

// What a group's own checkbox shows: every member chosen, none, or some (indeterminate).
export type GroupChoice = "all" | "some" | "none";

export function groupChoice(
  entries: readonly { id: string }[],
  isChosen: (id: string) => boolean,
): GroupChoice {
  let chosen = 0;
  for (const entry of entries) {
    if (isChosen(entry.id)) {
      chosen += 1;
    }
  }
  if (chosen === 0) {
    return "none";
  }
  return chosen === entries.length ? "all" : "some";
}
