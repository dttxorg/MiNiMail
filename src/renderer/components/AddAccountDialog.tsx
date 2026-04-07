import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { CreateAccountInput } from '../types';

interface Props {
  t: (key: string) => string;
  isOpen: boolean;
  account?: {
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
  } | null;
  onClose: () => void;
  onSaveAttempt: (input: CreateAccountInput) => Promise<{ success: boolean; error?: string }>;
  onTest: (input: CreateAccountInput) => Promise<{ success: boolean; message: string }>;
}

export interface AddAccountDialogHandle {
  validate: () => boolean;
}

const PROVIDER_PRESETS: Record<string, {
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  auth_type: 'password' | 'oauth';
}> = {
  gmail: { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587, auth_type: 'oauth' },
  outlook: { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587, auth_type: 'password' },
  yahoo: { imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, auth_type: 'password' },
  custom: { imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 587, auth_type: 'password' },
};

export const AddAccountDialog = forwardRef<AddAccountDialogHandle, Props>(
  ({ t, isOpen, account, onClose, onSaveAttempt, onTest }, ref) => {
  const [form, setForm] = useState<CreateAccountInput>({
    email: '',
    display_name: '',
    provider: 'custom',
    auth_type: 'password',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 587,
    username: '',
    password: '',
    use_tls: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Expose validate() so App.tsx can call it before allowing save
  useImperativeHandle(ref, () => ({
    validate: () => {
      const newErrors: Record<string, string> = {};

      // Email required
      if (!form.email.trim()) {
        newErrors.email = t('validateEmailRequired');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        // Strict email format regex - must have @ and domain with dot
        newErrors.email = t('validateEmailInvalid');
      }

      // Display name required (not just whitespace)
      if (form.display_name.trim() === '') {
        // Display name is optional in CreateAccountInput, skip
      } else if (form.display_name.trim().length > 0 && form.display_name.trim().length < 2) {
        newErrors.display_name = t('validateDisplayNameTooShort') || 'Display name must be at least 2 characters';
      }

      // IMAP server required for custom provider
      if (form.provider === 'custom' && !form.imap_host.trim()) {
        newErrors.imap_host = t('validateImapRequired') || 'IMAP server is required';
      }

      // IMAP port must be valid
      if (!form.imap_port || form.imap_port < 1 || form.imap_port > 65535) {
        newErrors.imap_port = t('validatePortInvalid') || 'Port must be between 1 and 65535';
      }

      // SMTP server required for custom provider
      if (form.provider === 'custom' && !form.smtp_host.trim()) {
        newErrors.smtp_host = t('validateSmtpRequired') || 'SMTP server is required';
      }

      // SMTP port must be valid
      if (!form.smtp_port || form.smtp_port < 1 || form.smtp_port > 65535) {
        newErrors.smtp_port = t('validatePortInvalid') || 'Port must be between 1 and 65535';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
  }));

  useEffect(() => {
    if (account) {
      setForm({
        email: account.email,
        display_name: account.display_name,
        provider: account.provider,
        auth_type: account.auth_type,
        imap_host: account.imap_host,
        imap_port: account.imap_port,
        smtp_host: account.smtp_host,
        smtp_port: account.smtp_port,
        username: account.username,
        password: '',
        use_tls: account.use_tls === 1,
      });
    } else {
      setForm({
        email: '',
        display_name: '',
        provider: 'custom',
        auth_type: 'password',
        imap_host: '',
        imap_port: 993,
        smtp_host: '',
        smtp_port: 587,
        username: '',
        password: '',
        use_tls: true,
      });
    }
    setTestResult(null);
    setErrors({});
  }, [account, isOpen]);

  const handleProviderChange = (provider: 'gmail' | 'outlook' | 'yahoo' | 'custom') => {
    const preset = PROVIDER_PRESETS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      auth_type: preset.auth_type,
      imap_host: preset.imap_host,
      imap_port: preset.imap_port,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port,
      username: prev.username || prev.email,
    }));
    // Clear server errors when changing provider
    setErrors(prev => {
      const n = { ...prev };
      delete n.imap_host;
      delete n.smtp_host;
      return n;
    });
  };

  const handleEmailChange = (email: string) => {
    setForm((prev) => ({
      ...prev,
      email,
      username: prev.username || email,
    }));
    if (errors.email) {
      setErrors(prev => { const n = { ...prev }; delete n.email; return n; });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(form);
    setTestResult(result);
    setTesting(false);
  };

  // handleSave is called by the Save button.
  // It validates first. Only calls onSaveAttempt if validation passes.
  // The parent (App.tsx) decides whether to close the dialog based on onSaveAttempt result.
  const handleSave = async () => {
    // Run strict validation - if it fails, errors are shown in UI and save is BLOCKED
    const isValid = (ref as React.RefObject<AddAccountDialogHandle>).current?.validate();
    if (!isValid) {
      // Validation failed - errors are displayed in the form, DO NOT proceed
      return;
    }

    setSaving(true);
    setTestResult(null);

    const result = await onSaveAttempt(form);

    setSaving(false);

    // If save failed (e.g. server error), show error and keep dialog open
    if (!result.success) {
      setErrors({ submit: result.error || 'Failed to save account' });
      return;
    }

    // Success - parent will close the dialog
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-100">
            {account ? 'Edit Account' : t('addEmailAccount')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-96 overflow-y-auto space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              {t('emailProvider')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['gmail', 'outlook', 'yahoo', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    form.provider === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook' : p === 'yahoo' ? 'Yahoo' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              {t('emailAddress')} *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className={`w-full py-2.5 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors ${
                errors.email ? 'border-red-500' : 'border-zinc-800'
              }`}
              placeholder="your@email.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              {t('displayName')}
            </label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, display_name: e.target.value }));
                if (errors.display_name) {
                  setErrors(prev => { const n = { ...prev }; delete n.display_name; return n; });
                }
              }}
              className={`w-full py-2.5 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${
                errors.display_name ? 'border-red-500' : 'border-zinc-800'
              }`}
              placeholder={t('usuallySameAsEmail')}
            />
            {errors.display_name && <p className="mt-1 text-xs text-red-500">{errors.display_name}</p>}
          </div>

          {/* Auth Type for Gmail */}
          {form.provider === 'gmail' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                {t('authMethod')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, auth_type: 'oauth' }))}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    form.auth_type === 'oauth'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {t('googleOAuth')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, auth_type: 'password' }))}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    form.auth_type === 'password'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {t('password')}
                </button>
              </div>
            </div>
          )}

          {/* IMAP Settings */}
          <div>
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
              {t('imapSettings')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">{t('imapServer')}</label>
                <input
                  type="text"
                  value={form.imap_host}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, imap_host: e.target.value }));
                    if (errors.imap_host) {
                      setErrors(prev => { const n = { ...prev }; delete n.imap_host; return n; });
                    }
                  }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${
                    errors.imap_host ? 'border-red-500' : 'border-zinc-800'
                  }`}
                  placeholder="imap.example.com"
                />
                {errors.imap_host && <p className="mt-1 text-xs text-red-500">{errors.imap_host}</p>}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('port')}</label>
                <input
                  type="number"
                  value={form.imap_port}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }));
                    if (errors.imap_port) {
                      setErrors(prev => { const n = { ...prev }; delete n.imap_port; return n; });
                    }
                  }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 ${
                    errors.imap_port ? 'border-red-500' : 'border-zinc-800'
                  }`}
                />
                {errors.imap_port && <p className="mt-1 text-xs text-red-500">{errors.imap_port}</p>}
              </div>
            </div>
          </div>

          {/* SMTP Settings */}
          <div>
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
              {t('smtpSettings')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">{t('smtpServer')}</label>
                <input
                  type="text"
                  value={form.smtp_host}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, smtp_host: e.target.value }));
                    if (errors.smtp_host) {
                      setErrors(prev => { const n = { ...prev }; delete n.smtp_host; return n; });
                    }
                  }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${
                    errors.smtp_host ? 'border-red-500' : 'border-zinc-800'
                  }`}
                  placeholder="smtp.example.com"
                />
                {errors.smtp_host && <p className="mt-1 text-xs text-red-500">{errors.smtp_host}</p>}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('port')}</label>
                <input
                  type="number"
                  value={form.smtp_port}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }));
                    if (errors.smtp_port) {
                      setErrors(prev => { const n = { ...prev }; delete n.smtp_port; return n; });
                    }
                  }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 ${
                    errors.smtp_port ? 'border-red-500' : 'border-zinc-800'
                  }`}
                />
                {errors.smtp_port && <p className="mt-1 text-xs text-red-500">{errors.smtp_port}</p>}
              </div>
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              {t('username')}
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full py-2.5 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              placeholder={t('usuallySameAsEmail')}
            />
          </div>

          {/* Password */}
          {form.auth_type === 'password' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                {t('password')}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full py-2.5 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                placeholder={account ? t('passwordUnchanged') : t('enterPassword')}
              />
            </div>
          )}

          {/* OAuth note */}
          {form.provider === 'gmail' && form.auth_type === 'oauth' && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400 font-medium mb-1">{t('gmailOAuthNote')}</p>
              <p className="text-xs text-zinc-500">{t('gmailOAuthHint')}</p>
            </div>
          )}

          {/* TLS Option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use_tls"
              checked={form.use_tls}
              onChange={(e) => setForm((prev) => ({ ...prev, use_tls: e.target.checked }))}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-blue-600 focus:ring-offset-zinc-900"
            />
            <label htmlFor="use_tls" className="text-sm text-zinc-300 cursor-pointer">
              {t('useTls')}
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
              testResult.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <span>{testResult.success ? '✓' : '✗'}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Submit Error */}
          {errors.submit && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {errors.submit}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !form.imap_host}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            {testing ? t('testing') : t('testConnection')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {saving ? t('saving') || 'Saving...' : account ? 'Update' : t('addEmailAccount')}
          </button>
        </div>
      </div>
    </div>
  );
  }
);

AddAccountDialog.displayName = 'AddAccountDialog';
