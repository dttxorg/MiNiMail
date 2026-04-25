export interface MailViewAutoSyncDecisionInput {
  previousViewKey: string | null;
  nextViewKey: string;
  loadedCount: number;
  wasInitialHydration: boolean;
  syncInFlight: boolean;
}

export interface StagedHistorySyncDecisionInput {
  cachedCount: number;
  forceHistoryRange: boolean;
}

export function shouldAutoSyncView(input: MailViewAutoSyncDecisionInput): boolean {
  if (input.syncInFlight) return false;
  if (input.wasInitialHydration) {
    return input.loadedCount === 0;
  }
  return input.previousViewKey !== input.nextViewKey && input.loadedCount === 0;
}

export function shouldUseStagedHistorySync(input: StagedHistorySyncDecisionInput): boolean {
  return input.forceHistoryRange && input.cachedCount <= 0;
}
