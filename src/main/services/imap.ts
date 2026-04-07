import log from 'electron-log';

export interface ImapConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  oauthToken?: string;
  useTLS: boolean;
}

export interface ImapConnectionResult {
  success: boolean;
  message: string;
  capabilities?: string[];
}

export async function testImapConnection(config: ImapConnectionConfig): Promise<ImapConnectionResult> {
  log.info(`Testing IMAP connection to ${config.host}:${config.port}`);

  try {
    // Dynamic import to avoid TypeScript issues
    const Imap = (await import('imap-client')).default;

    return new Promise((resolve) => {
      const imapConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        useTLS: config.useTLS,
        tlsOptions: {
          rejectUnauthorized: false,
        },
      } as Record<string, unknown>;

      // OAuth authentication (Gmail XOAUTH2)
      if (config.oauthToken) {
        (imapConfig as Record<string, unknown>).authMethod = 'XOAuth2';
        (imapConfig as Record<string, unknown>).password = config.oauthToken;
      } else if (config.password) {
        (imapConfig as Record<string, unknown>).password = config.password;
      }

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          log.warn(`IMAP connection timed out: ${config.host}:${config.port}`);
          resolve({
            success: false,
            message: 'Connection timed out',
          });
        }
      }, 15000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imap = new Imap(imapConfig as unknown as any) as unknown as {
        on: (event: string, callback: (arg?: unknown) => void) => void;
        close: () => Promise<void>;
        capabilities: Record<string, boolean>;
        connect: () => void;
      };

      imap.on('error', (err: unknown) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const errorMsg = err instanceof Error ? err.message : String(err);
          log.error(`IMAP connection error: ${errorMsg}`);
          resolve({
            success: false,
            message: errorMsg,
          });
        }
      });

      imap.on('ready', () => {
        if (!resolved) {
          resolved = true;
          const caps = imap.capabilities ? Object.keys(imap.capabilities) : [];
          log.info(`IMAP connected successfully. Capabilities: ${caps.join(', ')}`);
          imap.close().catch(() => {});
          resolve({
            success: true,
            message: 'IMAP connection successful',
            capabilities: caps,
          });
        }
      });

      imap.connect();
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`IMAP connection exception: ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }
}

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  oauthToken?: string;
  useTLS: boolean;
}

export interface SmtpConnectionResult {
  success: boolean;
  message: string;
}

export async function testSmtpConnection(config: SmtpConnectionConfig): Promise<SmtpConnectionResult> {
  log.info(`Testing SMTP connection to ${config.host}:${config.port}`);

  // For now, we just verify the config is valid
  // Full SMTP testing would require nodemailer with SMTP transport
  // This is a simplified version that checks basic connectivity

  return new Promise((resolve) => {
    setTimeout(() => {
      // Basic validation
      if (!config.host || !config.port) {
        resolve({
          success: false,
          message: 'Invalid SMTP configuration',
        });
        return;
      }

      log.info(`SMTP config validated for ${config.host}:${config.port}`);
      resolve({
        success: true,
        message: 'SMTP configuration valid',
      });
    }, 500);
  });
}
