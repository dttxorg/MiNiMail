export interface Account {
  id: number;
  email: string;
  display_name: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'custom';
  auth_type: 'password' | 'oauth';
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  use_tls: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountInput {
  email: string;
  display_name?: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'custom';
  auth_type: 'password' | 'oauth';
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password?: string;
  oauth_token?: string;
  oauth_refresh_token?: string;
  oauth_expiry?: number;
  use_tls?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ImapConnectionResult {
  success: boolean;
  message: string;
  capabilities?: string[];
}

export interface SmtpConnectionResult {
  success: boolean;
  message: string;
}

// Six-way mail category produced by the AI scan pipeline. Keep in sync
// with the renderer-side `AI_CATEGORY_IDS` in App.tsx and with the
// category routing tables in src/shared/email-ai/*.
export type AIMailCategory =
  | '工作/业务类'
  | '账单/财务类'
  | '社交/个人类'
  | '广告/营销类'
  | '安全/风险类'
  | '通知类';
