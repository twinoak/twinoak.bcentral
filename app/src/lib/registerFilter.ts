// The register's search field (P2-04): an entry matches when the query, trimmed and
// case-folded, is a substring of its label, person, street, role or notes. Exact substring,
// nothing fuzzy; an empty query matches everything.

export interface Searchable {
  label: string;
  person?: string;
  street?: string;
  role?: string;
  notes?: string;
}

export function matchesQuery(entry: Searchable, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return true;
  }
  return [entry.label, entry.person, entry.street, entry.role, entry.notes].some(
    (field) => field !== undefined && field.toLocaleLowerCase().includes(needle),
  );
}

export function filterRegister<T extends Searchable>(entries: readonly T[], query: string): T[] {
  return entries.filter((entry) => matchesQuery(entry, query));
}
