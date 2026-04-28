import nodemailer from 'nodemailer';
import log from 'electron-log';
import { getAccountById, getAccountCredentials, type Account } from '../database';
import { refreshTokenForAccount } from './oauth';

export interface SendMailAttachment {
  filename: string;
  contentType?: string;
  content: Buffer;
}

export interface SendMailOptions {
  accountId: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: SendMailAttachment[];
}

export interface SendMailResult {
  success: boolean;
  message: string;
  messageId?: string;
}

type AccountCredentials = NonNullable<ReturnType<typeof getAccountCredentials>>;
type SmtpAuth =
  | { type: 'OAuth2'; user: string; accessToken: string }
  | { user: string; pass?: string };

async function getFreshSmtpCredentials(accountId: number, account: Account): Promise<AccountCredentials | null> {
  let credentials = getAccountCredentials(accountId);
  if (!credentials || account.auth_type !== 'oauth') {
    return credentials;
  }

  const fiveMinMs = 5 * 60 * 1000;
  const tokenMissingOrExpiring = !credentials.oauth_token
    || !credentials.oauth_expiry
    || Date.now() > credentials.oauth_expiry - fiveMinMs;

  if (tokenMissingOrExpiring) {
    log.info(`[smtp] OAuth token missing or expiring for account ${accountId}, refreshing before SMTP`);
    const refreshed = await refreshTokenForAccount(accountId);
    if (refreshed) {
      credentials = getAccountCredentials(accountId) ?? credentials;
    }
  }

  return credentials;
}

function buildSmtpAuth(account: Account, credentials: AccountCredentials): { auth?: SmtpAuth; error?: string } {
  if (account.auth_type === 'oauth') {
    if (!credentials.oauth_token) {
      return {
        error: 'OAuth account temporarily unavailable. Please reconnect this account or wait a moment before retrying.',
      };
    }

    return {
      auth: {
        type: 'OAuth2',
        user: account.username || account.email,
        accessToken: credentials.oauth_token,
      },
    };
  }

  return {
    auth: {
      user: account.username || account.email,
      pass: credentials.password,
    },
  };
}

export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const { accountId, to, cc, bcc, subject, body, isHtml = false, attachments = [] } = options;

  log.info(`Sending email for account ${accountId}`);

  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, message: 'Account not found' };
  }

  const credentials = await getFreshSmtpCredentials(accountId, account);
  if (!credentials) {
    return { success: false, message: 'No credentials found' };
  }

  const { auth: smtpAuth, error: authError } = buildSmtpAuth(account, credentials);
  if (!smtpAuth) {
    return { success: false, message: authError || 'SMTP authentication is unavailable' };
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    requireTLS: account.use_tls === 1,
    auth: smtpAuth,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
    log.info('SMTP connection verified');

    const info = await transporter.sendMail({
      from: `"${account.display_name || account.email}" <${account.email}>`,
      to: to.join(', '),
      cc: cc?.join(', '),
      bcc: bcc?.join(', '),
      subject,
      text: isHtml ? undefined : body,
      html: isHtml ? body : undefined,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
      })),
    });

    log.info(`Email sent successfully. MessageId: ${info.messageId}`);
    return {
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to send email: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

export async function testSmtpConnection(accountId: number): Promise<{ success: boolean; message: string }> {
  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, message: 'Account not found' };
  }

  const credentials = await getFreshSmtpCredentials(accountId, account);
  if (!credentials) {
    return { success: false, message: 'No credentials found' };
  }

  const { auth: smtpAuth, error: authError } = buildSmtpAuth(account, credentials);
  if (!smtpAuth) {
    return { success: false, message: authError || 'SMTP authentication is unavailable' };
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    requireTLS: account.use_tls === 1,
    auth: smtpAuth,
    connectionTimeout: 10000,
  });

  try {
    await transporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: errorMsg };
  }
}
