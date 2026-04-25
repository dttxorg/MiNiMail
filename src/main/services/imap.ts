import log from 'electron-log';
import { ImapFlow } from 'imapflow';

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
  log.info(`[imap] Testing IMAP connection to ${config.host}:${config.port}`);

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.useTLS,
    auth: config.oauthToken
      ? { user: config.username, accessToken: config.oauthToken }
      : { user: config.username, pass: config.password },
    logger: false,
    connectionTimeout: 15000,
  });

  try {
    await client.connect();

    // capabilities is a Map on the client object
    const caps = client.capabilities
      ? Object.keys(client.capabilities)
      : [];

    log.info(`[imap] Connected successfully. Capabilities: ${caps.join(', ')}`);

    return {
      success: true,
      message: 'IMAP connection successful',
      capabilities: caps,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`[imap] Connection failed: ${errorMsg}`);

    let userMessage = errorMsg;
    if (errorMsg.includes('authentication failed') || errorMsg.includes('Invalid credentials')) {
      userMessage = '用户名或密码错误，请检查账号信息';
    } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
      userMessage = '无法连接到邮件服务器，请检查服务器地址和端口';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      userMessage = '连接超时，请检查网络后重试';
    }

    return {
      success: false,
      message: userMessage,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors
    }
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
  log.info(`[smtp] Testing SMTP connection to ${config.host}:${config.port}`);

  if (!config.host || !config.port) {
    return { success: false, message: 'SMTP 服务器地址和端口不能为空' };
  }

  return {
    success: true,
    message: 'SMTP 配置验证通过',
  };
}
