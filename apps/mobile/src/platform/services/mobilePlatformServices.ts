import type {
  AIService,
  AccountService,
  AttachmentService,
  MailService,
  MiNiMailPlatformServices,
  OAuthService,
  SchedulerService,
  SettingsService,
  VectorMemoryService,
} from '@minimail/core';

function notImplemented(method: string): Promise<never> {
  return Promise.reject(new Error(`Mobile platform service is not implemented yet: ${method}`));
}

const accounts: AccountService = {
  getAll: () => notImplemented('accounts.getAll'),
  get: () => notImplemented('accounts.get'),
  create: () => notImplemented('accounts.create'),
  update: () => notImplemented('accounts.update'),
  delete: () => notImplemented('accounts.delete'),
  setDefault: () => notImplemented('accounts.setDefault'),
  testImap: () => notImplemented('accounts.testImap'),
  testSmtp: () => notImplemented('accounts.testSmtp'),
};

const settingsStore = new Map<string, string>();

const settings: SettingsService = {
  async get(key) {
    return { success: true, data: settingsStore.get(key) ?? null };
  },
  async set(key, value) {
    settingsStore.set(key, value);
    return { success: true };
  },
};

const mail: MailService = {
  getFolders: () => notImplemented('mail.getFolders'),
  getList: () => notImplemented('mail.getList'),
  getDetail: () => notImplemented('mail.getDetail'),
  sync: () => notImplemented('mail.sync'),
  send: () => notImplemented('mail.send'),
  setRead: () => notImplemented('mail.setRead'),
  setStarred: () => notImplemented('mail.setStarred'),
  move: () => notImplemented('mail.move'),
  delete: () => notImplemented('mail.delete'),
};

const ai: AIService = {
  summarize: () => notImplemented('ai.summarize'),
  translate: () => notImplemented('ai.translate'),
  suggestReply: () => notImplemented('ai.suggestReply'),
  classifyBatch: () => notImplemented('ai.classifyBatch'),
};

const attachments: AttachmentService = {
  pickOutgoing: () => notImplemented('attachments.pickOutgoing'),
  download: () => notImplemented('attachments.download'),
  open: () => notImplemented('attachments.open'),
};

const scheduler: SchedulerService = {
  schedule: () => notImplemented('scheduler.schedule'),
  list: () => notImplemented('scheduler.list'),
  cancel: () => notImplemented('scheduler.cancel'),
  sendNow: () => notImplemented('scheduler.sendNow'),
  retry: () => notImplemented('scheduler.retry'),
  markMissed: () => notImplemented('scheduler.markMissed'),
};

const oauth: OAuthService = {
  startFlow: () => notImplemented('oauth.startFlow'),
  refreshToken: () => notImplemented('oauth.refreshToken'),
  getClientConfig: () => notImplemented('oauth.getClientConfig'),
};

const vectorMemory: VectorMemoryService = {
  upsert: () => notImplemented('vectorMemory.upsert'),
  search: async () => ({ success: true, data: [] }),
  deleteBySource: () => notImplemented('vectorMemory.deleteBySource'),
  clearAccount: () => notImplemented('vectorMemory.clearAccount'),
};

export function createMobilePlatformServices(): MiNiMailPlatformServices {
  return {
    accounts,
    settings,
    mail,
    ai,
    attachments,
    scheduler,
    oauth,
    vectorMemory,
  };
}
