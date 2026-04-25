export function getSearchTrailingActions(searchQuery: string): Array<'clear'> {
  return searchQuery.trim() ? ['clear'] : [];
}

export function shouldCloseSearchAfterMailSelect(options: { isCtrlKey: boolean; isShiftKey: boolean }): boolean {
  return !options.isCtrlKey && !options.isShiftKey;
}
