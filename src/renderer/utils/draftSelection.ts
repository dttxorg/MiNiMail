export type DraftSelectionCandidate = {
  id: string;
};

export function resolveNextDraftSelectionAfterDelete<T extends DraftSelectionCandidate>(
  visibleDrafts: readonly T[],
  deletedDraftId: string,
  selectedDraftId?: string | null,
): T | null | undefined {
  if (!selectedDraftId || selectedDraftId !== deletedDraftId) {
    return undefined;
  }

  const deletedIndex = visibleDrafts.findIndex((draft) => draft.id === deletedDraftId);
  const remainingDrafts = visibleDrafts.filter((draft) => draft.id !== deletedDraftId);
  if (remainingDrafts.length === 0) {
    return null;
  }

  if (deletedIndex < 0) {
    return remainingDrafts[0] ?? null;
  }

  return remainingDrafts[Math.min(deletedIndex, remainingDrafts.length - 1)] ?? null;
}
