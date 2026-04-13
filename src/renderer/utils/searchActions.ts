export function getSearchTrailingActions(searchQuery: string): Array<'clear'> {
  return searchQuery.trim() ? ['clear'] : [];
}
