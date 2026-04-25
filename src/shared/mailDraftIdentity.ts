const LOCAL_DRAFT_ID_RE = /^draft-[A-Za-z0-9_-]+$/;
const UI_LOCAL_DRAFT_ID_RE = /^\d+:(draft-[A-Za-z0-9_-]+)$/;
const LOCAL_DRAFT_MESSAGE_ID_RE = /^<(draft-[A-Za-z0-9_-]+)@minimail>$/i;

export interface DraftIdentityParts {
  id?: string | null;
  messageId?: string | null;
  localDraftId?: string | null;
}

export function isLocalDraftId(value: string | null | undefined): boolean {
  return Boolean(value && LOCAL_DRAFT_ID_RE.test(value));
}

export function extractLocalDraftIdFromUiId(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isLocalDraftId(value)) return value;
  return value.match(UI_LOCAL_DRAFT_ID_RE)?.[1] ?? null;
}

export function extractLocalDraftIdFromMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.match(LOCAL_DRAFT_MESSAGE_ID_RE)?.[1] ?? null;
}

export function resolveLocalDraftId(parts: DraftIdentityParts): string | null {
  if (isLocalDraftId(parts.localDraftId)) return parts.localDraftId ?? null;
  return extractLocalDraftIdFromMessageId(parts.messageId) || extractLocalDraftIdFromUiId(parts.id);
}
