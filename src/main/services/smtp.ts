import nodemailer from 'nodemailer';
import log from 'electron-log';
import { getAccountById, getAccountCredentials } from '../database';

export interface SendMailOptions {
  accountId: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

export interface SendMailResult {
  success: boolean;
  message: string;
  messageId?: string;
}

export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const { accountId, to, cc, bcc, subject, body, isHtml = false } = options;

  log.info(`Sending email for account ${accountId}`);

  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, message: 'Account not found' };
  }

  const credentials = getAccountCredentials(accountId);
  if (!credentials) {
    return { success: false, message: 'No credentials found' };
  }

  // Create transporter — use XOAUTH2 for OAuth accounts
  const smtpAuth = account.auth_type === 'oauth' && credentials.oauth_token
    ? { type: 'OAuth2' as const, user: account.username, accessToken: credentials.oauth_token }
    : { user: account.username, pass: credentials.password };

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
    // Verify connection first
    await transporter.verify();
    log.info('SMTP connection verified');

    // Send mail
    const info = await transporter.sendMail({
      from: `"${account.display_name || account.email}" <${account.email}>`,
      to: to.join(', '),
      cc: cc?.join(', '),
      bcc: bcc?.join(', '),
      subject,
      text: isHtml ? undefined : body,
      html: isHtml ? body : undefined,
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

  const credentials = getAccountCredentials(accountId);
  if (!credentials) {
    return { success: false, message: 'No credentials found' };
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    requireTLS: account.use_tls === 1,
    auth: {
      user: account.username,
      pass: credentials.password,
    },
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
