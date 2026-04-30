export const COMPOSE_SIGNATURES_SETTING_KEY = 'compose_signatures_v1';

export type ComposeSignatureSettings = {
  version: 1;
  byAccountId: Record<string, ComposeAccountSignature>;
};

export type ComposeAccountSignature = {
  enabled: boolean;
  text: string;
  updatedAt: string;
};

const EMPTY_SIGNATURE_SETTINGS: ComposeSignatureSettings = {
  version: 1,
  byAccountId: {},
};

const SIGNATURE_MARKER_START = '[[MINIMAIL_SIGNATURE_START]]';
const SIGNATURE_MARKER_END = '[[MINIMAIL_SIGNATURE_END]]';
const SIGNATURE_SEPARATOR = '-- ';

export function createEmptyComposeSignatureSettings(): ComposeSignatureSettings {
  return {
    version: 1,
    byAccountId: {},
  };
}

export function normalizeSignatureText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export function parseComposeSignatureSettings(value: string | null | undefined): ComposeSignatureSettings {
  if (!value) return createEmptyComposeSignatureSettings();

  try {
    const parsed = JSON.parse(value) as Partial<ComposeSignatureSettings> | null;
    if (!parsed || parsed.version !== 1 || !parsed.byAccountId || typeof parsed.byAccountId !== 'object') {
      return createEmptyComposeSignatureSettings();
    }

    const byAccountId: ComposeSignatureSettings['byAccountId'] = {};
    for (const [accountId, signature] of Object.entries(parsed.byAccountId)) {
      if (!accountId || !signature || typeof signature !== 'object') continue;
      byAccountId[accountId] = {
        enabled: Boolean((signature as Partial<ComposeAccountSignature>).enabled),
        text: normalizeSignatureText(String((signature as Partial<ComposeAccountSignature>).text || '')),
        updatedAt: String((signature as Partial<ComposeAccountSignature>).updatedAt || ''),
      };
    }

    return { version: 1, byAccountId };
  } catch {
    return createEmptyComposeSignatureSettings();
  }
}

export function serializeComposeSignatureSettings(settings: ComposeSignatureSettings): string {
  return JSON.stringify({
    version: 1,
    byAccountId: settings.byAccountId || {},
  } satisfies ComposeSignatureSettings);
}

export function getSignatureForAccount(
  settings: ComposeSignatureSettings | null | undefined,
  accountId: number | string | null | undefined,
): ComposeAccountSignature | null {
  if (accountId == null) return null;
  const signature = (settings || EMPTY_SIGNATURE_SETTINGS).byAccountId[String(accountId)];
  if (!signature || !signature.enabled) return null;
  const text = normalizeSignatureText(signature.text);
  if (!text) return null;
  return { ...signature, text };
}

export function updateComposeSignatureForAccount(
  settings: ComposeSignatureSettings | null | undefined,
  accountId: number | string,
  input: Pick<ComposeAccountSignature, 'enabled' | 'text'>,
  updatedAt = new Date().toISOString(),
): ComposeSignatureSettings {
  return {
    version: 1,
    byAccountId: {
      ...(settings || EMPTY_SIGNATURE_SETTINGS).byAccountId,
      [String(accountId)]: {
        enabled: Boolean(input.enabled),
        text: normalizeSignatureText(input.text),
        updatedAt,
      },
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSignatureBlock(signatureText: string): string {
  return `${SIGNATURE_SEPARATOR}\n${normalizeSignatureText(signatureText)}`;
}

function removeMarkedSignatureBlock(body: string): string {
  const markerPattern = new RegExp(
    `\\n*${escapeRegExp(SIGNATURE_MARKER_START)}[\\s\\S]*?${escapeRegExp(SIGNATURE_MARKER_END)}\\n*`,
    'g',
  );
  return body.replace(markerPattern, '\n\n').trimEnd();
}

function removeKnownPlainSignature(body: string, signatureText: string): string {
  const normalizedSignature = normalizeSignatureText(signatureText);
  if (!normalizedSignature) return body;

  const signatureBlock = buildSignatureBlock(normalizedSignature);
  const pattern = new RegExp(`(?:\\n\\s*){0,3}${escapeRegExp(signatureBlock)}\\s*$`);
  return body.replace(pattern, '').trimEnd();
}

export function removeExistingMinimailSignature(
  body: string,
  knownSignatures: string[] = [],
): string {
  let nextBody = removeMarkedSignatureBlock(body.replace(/\r\n/g, '\n'));
  for (const signature of knownSignatures) {
    nextBody = removeKnownPlainSignature(nextBody, signature);
  }
  return nextBody.trimEnd();
}

export function applySignatureToBody(
  body: string,
  signature: ComposeAccountSignature | string | null | undefined,
  options: { knownSignatures?: string[] } = {},
): string {
  const signatureText = typeof signature === 'string' ? signature : signature?.text;
  const normalizedSignature = normalizeSignatureText(signatureText || '');
  const cleanedBody = removeExistingMinimailSignature(body || '', [
    ...(options.knownSignatures || []),
    normalizedSignature,
  ]);

  if (!normalizedSignature) return cleanedBody;
  const spacer = cleanedBody.trim() ? '\n\n' : '';
  return `${cleanedBody}${spacer}${buildSignatureBlock(normalizedSignature)}`;
}

export function stripSignatureMarkerBeforeSend(body: string): string {
  return removeMarkedSignatureBlock(body || '').trim();
}

export function collectEnabledSignatureTexts(settings: ComposeSignatureSettings | null | undefined): string[] {
  return Object.values((settings || EMPTY_SIGNATURE_SETTINGS).byAccountId)
    .filter((signature) => signature.enabled)
    .map((signature) => normalizeSignatureText(signature.text))
    .filter(Boolean);
}

export function collectSignatureTexts(settings: ComposeSignatureSettings | null | undefined): string[] {
  return Object.values((settings || EMPTY_SIGNATURE_SETTINGS).byAccountId)
    .map((signature) => normalizeSignatureText(signature.text))
    .filter(Boolean);
}
