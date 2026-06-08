// Shared delivery state union for the renderer + main process.
//
// IMPORTANT: keep this in sync with `ScheduledSendJobStatus` in
// `src/main/services/scheduledSendService.ts` and with the
// `mail_cache.delivery_state` column (free text in SQLite, no CHECK
// constraint at the DB level for the cache table).
//
// Any new status must be added in three places:
//   1. `ScheduledSendJobStatus` in scheduledSendService.ts (DB CHECK + business logic)
//   2. `MailDeliveryState` here (shared type for renderer + main IPC)
//   3. Renderer state machines that branch on this union
//      (e.g. mailListViewModel.isDraftMailForDisplay, mailCacheRef casts)

export type MailDeliveryState =
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'
  | 'missed';

export const MAIL_DELIVERY_STATES: readonly MailDeliveryState[] = [
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
  'missed',
] as const;

export function isMailDeliveryState(value: unknown): value is MailDeliveryState {
  return typeof value === 'string' && (MAIL_DELIVERY_STATES as readonly string[]).includes(value);
}
