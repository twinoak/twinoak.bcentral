// The register's search field (P2-04): an entry matches when the query, trimmed and
// case-folded, is a substring of its label, person, street, role, phone or notes. Exact
// substring, nothing fuzzy; an empty query matches everything. And the toolbar's radio
// filter (P3-06): every contact, the ones with a radio, or the ones without.

export interface Searchable {
  label: string;
  person?: string;
  street?: string;
  role?: string;
  phone?: string;
  notes?: string;
}

export function matchesQuery(entry: Searchable, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return true;
  }
  return [entry.label, entry.person, entry.street, entry.role, entry.phone, entry.notes].some(
    (field) => field !== undefined && field.toLocaleLowerCase().includes(needle),
  );
}

export function filterRegister<T extends Searchable>(entries: readonly T[], query: string): T[] {
  return entries.filter((entry) => matchesQuery(entry, query));
}

// The toolbar's filter, in the order the select lists them.
export const RADIO_FILTERS = ["all", "radio", "noRadio"] as const;
export type RadioFilter = (typeof RADIO_FILTERS)[number];

export function matchesRadioFilter(entry: { publicKey?: string }, filter: RadioFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return (entry.publicKey !== undefined) === (filter === "radio");
}

export function filterByRadio<T extends { publicKey?: string }>(
  entries: readonly T[],
  filter: RadioFilter,
): T[] {
  return entries.filter((entry) => matchesRadioFilter(entry, filter));
}
