export type AutoConfigProvider = 'gmail' | 'outlook' | 'yahoo' | 'custom';

export interface EmailProviderAutoConfig {
  domain: string;
  provider: AutoConfigProvider;
  authType: 'password' | 'oauth';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export type EmailServerField = 'imap_host' | 'imap_port' | 'smtp_host' | 'smtp_port';

export type EmailServerForm = {
  provider: AutoConfigProvider;
  auth_type: 'password' | 'oauth';
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username?: string;
  email?: string;
  use_tls?: boolean | number;
};

export type ManualEmailServerFields = Partial<Record<EmailServerField, boolean>>;

const CONFIGS: Record<string, Omit<EmailProviderAutoConfig, 'domain'>> = {
  'gmail.com': {
    provider: 'gmail',
    authType: 'oauth',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  'googlemail.com': {
    provider: 'gmail',
    authType: 'oauth',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  'outlook.com': {
    provider: 'outlook',
    authType: 'oauth',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'hotmail.com': {
    provider: 'outlook',
    authType: 'oauth',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'hotmail.co.uk': {
    provider: 'outlook',
    authType: 'oauth',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'live.com': {
    provider: 'outlook',
    authType: 'oauth',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'msn.com': {
    provider: 'outlook',
    authType: 'oauth',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'yahoo.com': {
    provider: 'yahoo',
    authType: 'oauth',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  'icloud.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'me.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'mac.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
  },
  'qq.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  '163.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.163.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  '126.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.126.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.126.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  'sohu.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.sohu.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.sohu.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  'zoho.com': {
    provider: 'custom',
    authType: 'password',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
  },
};

export function getEmailDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split('@')[1];
  return domain && domain.includes('.') ? domain : null;
}

export function resolveEmailProviderAutoConfig(email: string): EmailProviderAutoConfig | null {
  const domain = getEmailDomain(email);
  if (!domain) return null;

  const exact = CONFIGS[domain];
  if (exact) return { domain, ...exact };

  if (domain.endsWith('.yahoo.com')) return { domain, ...CONFIGS['yahoo.com'] };
  if (domain.endsWith('.zoho.com')) return { domain, ...CONFIGS['zoho.com'] };
  return {
    domain,
    provider: 'custom',
    authType: 'password',
    imapHost: `imap.${domain}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: `smtp.${domain}`,
    smtpPort: 587,
    smtpSecure: false,
  };
}

function shouldFillString(value: string | undefined, manual: boolean | undefined): boolean {
  return !manual || !String(value ?? '').trim();
}

function shouldFillNumber(value: number | undefined, manual: boolean | undefined, defaultValue: number): boolean {
  return !manual || !value || value <= 0 || value === defaultValue;
}

export function applyEmailProviderAutoConfig<T extends EmailServerForm>(
  form: T,
  email: string,
  manualFields: ManualEmailServerFields = {},
): { form: T; applied: boolean; domain: string | null } {
  const config = resolveEmailProviderAutoConfig(email);
  const next = { ...form, email, username: form.username || email };
  if (!config) {
    return { form: next, applied: false, domain: getEmailDomain(email) };
  }

  let applied = false;
  const withConfig = {
    ...next,
    provider: config.provider,
    auth_type: config.authType,
    use_tls: true,
  };

  if (shouldFillString(withConfig.imap_host, manualFields.imap_host)) {
    withConfig.imap_host = config.imapHost;
    applied = true;
  }
  if (shouldFillNumber(withConfig.imap_port, manualFields.imap_port, 993)) {
    withConfig.imap_port = config.imapPort;
    applied = true;
  }
  if (shouldFillString(withConfig.smtp_host, manualFields.smtp_host)) {
    withConfig.smtp_host = config.smtpHost;
    applied = true;
  }
  if (shouldFillNumber(withConfig.smtp_port, manualFields.smtp_port, 587)) {
    withConfig.smtp_port = config.smtpPort;
    applied = true;
  }

  return { form: withConfig as T, applied, domain: config.domain };
}
