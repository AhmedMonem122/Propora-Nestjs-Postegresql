/**
 * Splits free-text search into terms. Multi-word queries ("QA Resident")
 * must match across fields (firstName=QA AND lastName=Resident) — a single
 * `contains: <whole-string>` per field can never match split values.
 */
export function splitSearchTerms(search: string | undefined | null): string[] {
  if (!search) {
    return [];
  }
  return search
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}
