import type { RendererMailDetail } from '../hooks/useMail';

type ElectronInvoker = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

type MailIdentity = {
  accountId: number;
  uid: number;
  folder: string;
};

export type SharedMailBodyLoadResult = {
  source: 'memory' | 'cache' | 'imap' | 'missing';
  bodyHtml?: string;
  bodyText?: string;
  detail?: RendererMailDetail;
  attachments?: RendererMailDetail['attachments'];
};

type RememberedMailBody = {
  result: SharedMailBodyLoadResult;
  bytes: number;
};

function buildMailBodyCacheKey(identity: MailIdentity): string {
  return `${identity.accountId}:${identity.folder}:${identity.uid}`;
}

function estimateMailBodyBytes(result: SharedMailBodyLoadResult): number {
  const bodyHtml = result.bodyHtml ?? result.detail?.bodyHtml ?? '';
  const bodyText = result.bodyText ?? result.detail?.bodyText ?? '';
  const snippet = result.detail?.snippet ?? '';
  const subject = result.detail?.subject ?? '';
  return (bodyHtml.length + bodyText.length + snippet.length + subject.length) * 2;
}

export class SharedMailBodyStore {
  private readonly memory = new Map<string, RememberedMailBody>();
  private readonly inFlight = new Map<string, Promise<SharedMailBodyLoadResult>>();
  private currentBytes = 0;

  constructor(
    private readonly maxEntries: number = 80,
    private readonly maxBytes: number = 32 * 1024 * 1024,
    private readonly maxEntryBytes: number = 2 * 1024 * 1024,
  ) {}

  private remember(key: string, result: SharedMailBodyLoadResult): SharedMailBodyLoadResult {
    const bytes = estimateMailBodyBytes(result);
    if (bytes > this.maxEntryBytes) {
      this.forget(key);
      return result;
    }

    this.forget(key);
    this.memory.set(key, { result, bytes });
    this.currentBytes += bytes;

    while (this.memory.size > this.maxEntries || this.currentBytes > this.maxBytes) {
      const oldestKey = this.memory.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.forget(oldestKey);
    }

    return result;
  }

  private forget(key: string) {
    const existing = this.memory.get(key);
    if (existing) {
      this.currentBytes = Math.max(0, this.currentBytes - existing.bytes);
      this.memory.delete(key);
    }
  }

  clear(identity: MailIdentity) {
    const key = buildMailBodyCacheKey(identity);
    this.forget(key);
    this.inFlight.delete(key);
  }

  has(identity: MailIdentity): boolean {
    return this.memory.has(buildMailBodyCacheKey(identity));
  }

  async load(api: ElectronInvoker, identity: MailIdentity): Promise<SharedMailBodyLoadResult> {
    const key = buildMailBodyCacheKey(identity);
    const cached = this.memory.get(key);
    if (cached) {
      return this.remember(key, { ...cached.result, source: 'memory' });
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const task = (async (): Promise<SharedMailBodyLoadResult> => {
      const cachedBody = await api.invoke('mail:loadCachedBody', identity.accountId, identity.uid, identity.folder) as {
        success: boolean;
        data?: { bodyHtml?: string; bodyText?: string; attachments?: RendererMailDetail['attachments'] } | null;
      };

      if (cachedBody.success && cachedBody.data && (cachedBody.data.bodyHtml || cachedBody.data.bodyText || cachedBody.data.attachments?.length)) {
        return this.remember(key, {
          source: 'cache',
          bodyHtml: cachedBody.data.bodyHtml,
          bodyText: cachedBody.data.bodyText,
          attachments: cachedBody.data.attachments ?? [],
        });
      }

      const fullResp = await api.invoke('mail:fetchFull', identity.accountId, identity.uid, identity.folder) as {
        success: boolean;
        data?: RendererMailDetail;
      };

      if (fullResp.success && fullResp.data) {
        return this.remember(key, {
          source: 'imap',
          detail: fullResp.data,
          bodyHtml: fullResp.data.bodyHtml,
          bodyText: fullResp.data.bodyText,
        });
      }

      return { source: 'missing' };
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, task);
    return task;
  }
}

export const sharedMailBodyStore = new SharedMailBodyStore();
