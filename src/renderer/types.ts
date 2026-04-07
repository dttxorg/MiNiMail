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
