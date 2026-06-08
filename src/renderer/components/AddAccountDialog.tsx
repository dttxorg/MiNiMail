import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, useRef } from 'react';
import { X, Loader2, ExternalLink, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import type { CreateAccountInput } from '../types';
import type { AppLanguage } from '../utils/aiLanguages';
import { getOauthProviderGuide, resolveOauthClientConfig, type OAuthProvider } from '../utils/oauthProviderGuide';
import { buildModalShellStyle, uiColor } from '../utils/uiDesignTokens';
import {
  applyEmailProviderAutoConfig,
  getEmailDomain,
  type EmailServerField,
  type ManualEmailServerFields,
} from '../utils/emailProviderAutoConfig';

interface Props {
  t: (key: string) => string;
  appLanguage: AppLanguage;
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

// ─── Provider presets ─────────────────────────────────────────────────────────

const PROVIDER_PRESETS: Record<string, {
  imap_host: string; imap_port: number;
  smtp_host: string; smtp_port: number;
  auth_type: 'password' | 'oauth';
}> = {
  gmail:   { imap_host: 'imap.gmail.com',          imap_port: 993, smtp_host: 'smtp.gmail.com',          smtp_port: 587, auth_type: 'oauth'    },
  outlook: { imap_host: 'outlook.office365.com',    imap_port: 993, smtp_host: 'smtp.office365.com',      smtp_port: 587, auth_type: 'oauth'    },
  yahoo:   { imap_host: 'imap.mail.yahoo.com',      imap_port: 993, smtp_host: 'smtp.mail.yahoo.com',     smtp_port: 465, auth_type: 'oauth'    },
  custom:  { imap_host: '',                          imap_port: 993, smtp_host: '',                        smtp_port: 587, auth_type: 'password' },
};

const OAUTH_PROVIDERS = ['gmail', 'outlook', 'yahoo'] as const;

// ─── OAuth flow result (from IPC) ─────────────────────────────────────────────

interface OAuthFlowResult {
  accessToken:   string;
  refreshToken?: string;
  expiresAt:     number;
  email?:        string;
  imapHost:      string;
  imapPort:      number;
  smtpHost:      string;
  smtpPort:      number;
}

// ─── Component ────────────────────────────────────────────────────────────────

type OAuthStatus = 'idle' | 'waiting' | 'success' | 'error';

type FormData = CreateAccountInput & { oauth_expiry?: number };

const BLANK_FORM: FormData = {
  email: '', display_name: '', provider: 'custom', auth_type: 'password',
  imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 587,
  username: '', password: '', use_tls: true,
};

function getAutoConfigNotice(language: AppLanguage, oauthPreferred: boolean): string {
  const copy: Record<AppLanguage, { applied: string; oauth: string }> = {
    zh: {
      applied: '已根据邮箱域名自动填入服务器配置。',
      oauth: '该邮箱服务商建议使用 OAuth 登录；手动 IMAP/SMTP 通常需要 OAuth 或应用专用密码。',
    },
    en: {
      applied: 'Server settings were filled from the email domain.',
      oauth: 'This provider recommends OAuth; manual IMAP/SMTP usually requires OAuth or an app password.',
    },
    ja: {
      applied: 'メールドメインからサーバー設定を自動入力しました。',
      oauth: 'このプロバイダーは OAuth を推奨しています。手動 IMAP/SMTP では通常 OAuth またはアプリパスワードが必要です。',
    },
    ko: {
      applied: '이메일 도메인에 따라 서버 설정을 자동 입력했습니다.',
      oauth: '이 제공업체는 OAuth 사용을 권장합니다. 수동 IMAP/SMTP에는 일반적으로 OAuth 또는 앱 비밀번호가 필요합니다.',
    },
    es: {
      applied: 'Se completó la configuración del servidor según el dominio del correo.',
      oauth: 'Este proveedor recomienda OAuth; IMAP/SMTP manual normalmente requiere OAuth o una contraseña de aplicación.',
    },
    fr: {
      applied: 'Les paramètres serveur ont été remplis à partir du domaine de l’adresse.',
      oauth: 'Ce fournisseur recommande OAuth ; IMAP/SMTP manuel nécessite généralement OAuth ou un mot de passe d’application.',
    },
    de: {
      applied: 'Die Servereinstellungen wurden anhand der E-Mail-Domain ausgefüllt.',
      oauth: 'Dieser Anbieter empfiehlt OAuth; manuelles IMAP/SMTP benötigt in der Regel OAuth oder ein App-Passwort.',
    },
    ru: {
      applied: 'Параметры сервера заполнены по домену почты.',
      oauth: 'Этот провайдер рекомендует OAuth; ручной IMAP/SMTP обычно требует OAuth или пароль приложения.',
    },
  };
  const selected = copy[language] ?? copy.en;
  return oauthPreferred ? `${selected.applied} ${selected.oauth}` : selected.applied;
}

function normalizeAccountFormForDirtyCheck(formData: FormData): string {
  return JSON.stringify({
    email: formData.email.trim(),
    display_name: (formData.display_name ?? '').trim(),
    provider: formData.provider,
    auth_type: formData.auth_type,
    imap_host: formData.imap_host.trim(),
    imap_port: Number(formData.imap_port) || 0,
    smtp_host: formData.smtp_host.trim(),
    smtp_port: Number(formData.smtp_port) || 0,
    username: formData.username.trim(),
    password: formData.password || '',
    use_tls: Boolean(formData.use_tls),
    oauth_token: formData.oauth_token || '',
    oauth_refresh_token: formData.oauth_refresh_token || '',
    oauth_expiry: formData.oauth_expiry || 0,
  });
}

export const AddAccountDialog = forwardRef<AddAccountDialogHandle, Props>(
  ({ t, appLanguage, isOpen, account, onClose, onSaveAttempt, onTest }, ref) => {

  const [form, setForm]           = useState<FormData>(BLANK_FORM);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [manualServerFields, setManualServerFields] = useState<ManualEmailServerFields>({});
  const [autoConfigNotice, setAutoConfigNotice] = useState<string | null>(null);
  const [lastAutoConfigDomain, setLastAutoConfigDomain] = useState<string | null>(null);

  // ── OAuth state ──────────────────────────────────────────────────────────────
  const [oauthClientId,     setOauthClientId]     = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthStatus,       setOauthStatus]       = useState<OAuthStatus>('idle');
  const [oauthError,        setOauthError]        = useState<string | null>(null);
  const [oauthEmail,        setOauthEmail]        = useState<string | null>(null);
  const [showOauthGuide,    setShowOauthGuide]    = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const initialFormSnapshotRef = useRef(normalizeAccountFormForDirtyCheck(BLANK_FORM));

  const hasUnsavedChanges = useMemo(
    () => normalizeAccountFormForDirtyCheck(form) !== initialFormSnapshotRef.current,
    [form],
  );

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  const discardChangesAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    initialFormSnapshotRef.current = normalizeAccountFormForDirtyCheck(form);
    onClose();
  }, [form, onClose]);

  const validateFormData = (formData: FormData) => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = t('validateEmailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = t('validateEmailInvalid');
    }

    if (formData.provider === 'custom' && !formData.imap_host.trim()) {
      newErrors.imap_host = t('validateImapRequired') || 'IMAP server is required';
    }
    if (!formData.imap_port || formData.imap_port < 1 || formData.imap_port > 65535) {
      newErrors.imap_port = t('validatePortInvalid') || 'Invalid port';
    }
    if (formData.provider === 'custom' && !formData.smtp_host.trim()) {
      newErrors.smtp_host = t('validateSmtpRequired') || 'SMTP server is required';
    }
    if (!formData.smtp_port || formData.smtp_port < 1 || formData.smtp_port > 65535) {
      newErrors.smtp_port = t('validatePortInvalid') || 'Invalid port';
    }

    return newErrors;
  };

  const persistAccount = async (formData: FormData) => {
    const newErrors = validateFormData(formData);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      return false;
    }

    setSaving(true);
    setTestResult(null);

    const result = await onSaveAttempt(formData);
    setSaving(false);

    if (!result.success) {
      setErrors({ submit: result.error || 'Failed to save account' });
      return false;
    }

    setErrors({});
    return true;
  };

  // ── Expose validate() via forwarded ref ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    validate: () => {
      const newErrors = validateFormData(form);
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
  }));

  // ── Reset on open / account change ───────────────────────────────────────────
  useEffect(() => {
    let nextForm: FormData;
    if (account) {
      nextForm = {
        email: account.email, display_name: account.display_name,
        provider: account.provider, auth_type: account.auth_type,
        imap_host: account.imap_host, imap_port: account.imap_port,
        smtp_host: account.smtp_host, smtp_port: account.smtp_port,
        username: account.username, password: '', use_tls: account.use_tls === 1,
      };
    } else {
      nextForm = BLANK_FORM;
    }
    setForm(nextForm);
    initialFormSnapshotRef.current = normalizeAccountFormForDirtyCheck(nextForm);
    setShowDiscardConfirm(false);
    setTestResult(null);
    setErrors({});
    setManualServerFields({});
    setAutoConfigNotice(null);
    setLastAutoConfigDomain(account ? getEmailDomain(account.email) : null);
    resetOAuthState();
    resetOauthCredentials();
    setShowOauthGuide(false);
  }, [account, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  // ── Pre-load saved client credentials when provider changes ──────────────────
  useEffect(() => {
    if (!OAUTH_PROVIDERS.includes(form.provider as OAuthProvider)) return;
    if (form.auth_type !== 'oauth') return;

    let cancelled = false;
    setOauthClientId('');
    setOauthClientSecret('');

    (async () => {
      try {
        const res = await window.electronAPI.invoke('oauth:getClientConfig', form.provider) as {
          success: boolean; data?: { clientId: string; clientSecret: string };
        };
        if (cancelled) return;
        if (res.success) {
          const nextConfig = resolveOauthClientConfig(res.data);
          setOauthClientId(nextConfig.clientId);
          setOauthClientSecret(nextConfig.clientSecret);
        }
      } catch { /* settings not available yet – ignore */ }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider, form.auth_type]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function resetOAuthState() {
    setOauthStatus('idle');
    setOauthError(null);
    setOauthEmail(null);
  }

  function resetOauthCredentials() {
    setOauthClientId('');
    setOauthClientSecret('');
  }

  const handleProviderChange = (provider: 'gmail' | 'outlook' | 'yahoo' | 'custom') => {
    const preset = PROVIDER_PRESETS[provider];
    setForm(prev => ({
      ...prev,
      provider,
      auth_type:  preset.auth_type,
      imap_host:  preset.imap_host,
      imap_port:  preset.imap_port,
      smtp_host:  preset.smtp_host,
      smtp_port:  preset.smtp_port,
      username:   prev.username || prev.email,
    }));
    setErrors(prev => { const n = { ...prev }; delete n.imap_host; delete n.smtp_host; return n; });
    resetOAuthState();
    resetOauthCredentials();
    setShowOauthGuide(false);
  };

  const markServerFieldManual = (field: EmailServerField) => {
    setManualServerFields(prev => ({ ...prev, [field]: true }));
    setAutoConfigNotice(null);
  };

  const handleEmailChange = (email: string) => {
    setForm(prev => {
      getEmailDomain(email); // computed; reserved for future per-domain affordances
      const autoResult = applyEmailProviderAutoConfig(
        prev,
        email,
        manualServerFields,
      );

      if (autoResult.domain !== lastAutoConfigDomain) {
        setLastAutoConfigDomain(autoResult.domain);
      }

      if (autoResult.applied) {
        setAutoConfigNotice(getAutoConfigNotice(appLanguage, autoResult.form.auth_type === 'oauth'));
        setErrors(current => {
          const n = { ...current };
          delete n.imap_host;
          delete n.smtp_host;
          delete n.imap_port;
          delete n.smtp_port;
          return n;
        });
      } else {
        setAutoConfigNotice(null);
      }

      return autoResult.form;
    });
    if (errors.email) setErrors(prev => { const n = { ...prev }; delete n.email; return n; });
  };

  // ── OAuth flow ────────────────────────────────────────────────────────────────
  const handleOAuthLogin = async () => {
    if (!oauthClientId.trim()) {
      const providerGuide = getOauthProviderGuide(form.provider as OAuthProvider, appLanguage);
      setOauthError(providerGuide.clientIdRequired);
      return;
    }
    setOauthStatus('waiting');
    setOauthError(null);

    try {
      const result = await window.electronAPI.invoke('oauth:startFlow', {
        provider:     form.provider,
        clientId:     oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim() || undefined,
      }) as { success: boolean; data?: OAuthFlowResult; error?: string };

      if (result.success && result.data) {
        const d = result.data;
        const nextForm: FormData = {
          ...form,
          email: d.email || form.email,
          username: d.email || form.username,
          display_name: form.display_name || (d.email ? d.email.split('@')[0] : ''),
          imap_host: d.imapHost,
          imap_port: d.imapPort,
          smtp_host: d.smtpHost,
          smtp_port: d.smtpPort,
          oauth_token: d.accessToken,
          oauth_refresh_token: d.refreshToken,
          oauth_expiry: d.expiresAt,
        };
        setOauthEmail(d.email || null);
        setOauthStatus('success');
        setErrors({});
        setForm(nextForm);

        const saved = await persistAccount(nextForm);
        if (!saved) {
          setOauthError('Authorization succeeded, but the account could not be saved.');
        } else {
          initialFormSnapshotRef.current = normalizeAccountFormForDirtyCheck(nextForm);
        }
      } else {
        const providerGuide = getOauthProviderGuide(form.provider as OAuthProvider, appLanguage);
        setOauthError(result.error || providerGuide.oauthFailed);
        setOauthStatus('error');
      }
    } catch (err) {
      setOauthError((err as Error).message);
      setOauthStatus('error');
    }
  };

  // ── Test + Save ───────────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(form);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = async () => {
    // For OAuth accounts, require the flow to have completed
    if (form.auth_type === 'oauth' && OAUTH_PROVIDERS.includes(form.provider as OAuthProvider)) {
      if (oauthStatus !== 'success') {
        setErrors({ submit: '请先完成 OAuth 授权（点击「授权」按钮）' });
        return;
      }
    }

    const saved = await persistAccount(form);
    if (saved) {
      initialFormSnapshotRef.current = normalizeAccountFormForDirtyCheck(form);
      onClose();
    }
  };

  if (!isOpen) return null;

  const isOAuthProvider = OAUTH_PROVIDERS.includes(form.provider as OAuthProvider);
  const providerGuide   = isOAuthProvider ? getOauthProviderGuide(form.provider as OAuthProvider, appLanguage) : null;
  const providerLabel   = providerGuide?.providerLabel ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg overflow-hidden" style={buildModalShellStyle()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${uiColor.borderSubtle}` }}>
          <h2 className="text-lg font-bold text-zinc-100">
            {account ? 'Edit Account' : t('addEmailAccount')}
          </h2>
          <button onClick={requestClose} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-xl hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-5">

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">{t('emailProvider')}</label>
            <div className="grid grid-cols-4 gap-2">
              {(['gmail', 'outlook', 'yahoo', 'custom'] as const).map(p => (
                <button
                  key={p} type="button" onClick={() => handleProviderChange(p)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-colors ${
                    form.provider === p ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook' : p === 'yahoo' ? 'Yahoo' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* Auth type toggle for any provider */}
          {isOAuthProvider && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t('authMethod')}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['oauth', 'password'] as const).map(type => (
                  <button
                    key={type} type="button"
                    onClick={() => { setForm(prev => ({ ...prev, auth_type: type })); resetOAuthState(); }}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-colors ${
                      form.auth_type === type ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {type === 'oauth' ? `${providerLabel} OAuth 2.0` : t('password')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── OAuth 2.0 config panel ── */}
          {isOAuthProvider && form.auth_type === 'oauth' && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                    {providerGuide?.panelTitle} · {providerLabel}
                  </span>
                  {providerGuide && (
                    <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                      {providerGuide.redirectHint}
                    </p>
                  )}
                </div>
                {providerGuide && (
                  <button
                    type="button"
                    onClick={() => setShowOauthGuide(prev => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{showOauthGuide ? providerGuide.guideHide : providerGuide.guideShow}</span>
                    {showOauthGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {providerGuide && showOauthGuide && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{providerGuide.guideTitle}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{providerGuide.guideIntro}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {providerGuide.linksTitle}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {providerGuide.links.map((link) => (
                        <button
                          key={link.url}
                          type="button"
                          onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-blue-300 hover:bg-zinc-950 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{link.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {providerGuide.stepsTitle}
                    </p>
                    <ol className="space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-300 list-decimal">
                      {providerGuide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* Success badge */}
              {oauthStatus === 'success' && oauthEmail && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-400">
                    {providerGuide?.authorizedAs.replace('{email}', oauthEmail) ?? oauthEmail}
                  </span>
                </div>
              )}

              {/* Client ID */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{providerGuide?.clientIdLabel ?? 'Client ID *'}</label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={e => setOauthClientId(e.target.value)}
                  placeholder="your-client-id"
                  className="w-full py-2 px-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              {/* Client Secret */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {providerGuide?.clientSecretLabel ?? 'Client Secret'}
                  {providerGuide?.secretOptional && (
                    <span className="ml-1 text-zinc-600">({providerGuide.clientSecretOptional})</span>
                  )}
                </label>
                <input
                  type="password"
                  value={oauthClientSecret}
                  onChange={e => setOauthClientSecret(e.target.value)}
                  placeholder={providerGuide?.secretOptional ? providerGuide.clientSecretOptional : 'your-client-secret'}
                  className="w-full py-2 px-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              {/* Error */}
              {oauthStatus === 'error' && oauthError && (
                <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-400">{oauthError}</span>
                </div>
              )}

              {/* Authorize button */}
              <button
                type="button"
                onClick={handleOAuthLogin}
                disabled={oauthStatus === 'waiting' || !oauthClientId.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {oauthStatus === 'waiting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{providerGuide?.waitingBrowser ?? 'Waiting for browser authorization...'}</>
                ) : oauthStatus === 'success' ? (
                  <><ExternalLink className="w-4 h-4" />{providerGuide?.authorizeAgain ?? 'Authorize again'}</>
                ) : (
                  <><ExternalLink className="w-4 h-4" />{providerGuide?.authorize.replace('{provider}', providerLabel) ?? `Authorize with ${providerLabel}`}</>
                )}
              </button>

              {oauthStatus === 'waiting' && (
                <p className="text-xs text-zinc-500 text-center leading-relaxed">
                  {providerGuide?.waitingBrowser ?? 'Your system browser is open. Complete the authorization there, then return to this window.'}
                </p>
              )}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">{t('emailAddress')} *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => handleEmailChange(e.target.value)}
              className={`w-full py-2.5 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors ${
                errors.email ? 'border-red-500' : 'border-zinc-800'
              }`}
              placeholder="your@email.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            {autoConfigNotice && <p className="mt-1 text-xs text-emerald-400">{autoConfigNotice}</p>}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">{t('displayName')}</label>
            <input
              type="text"
              value={form.display_name}
              onChange={e => setForm(prev => ({ ...prev, display_name: e.target.value }))}
              className="w-full py-2.5 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              placeholder={t('usuallySameAsEmail')}
            />
          </div>

          {/* IMAP */}
          <div>
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">{t('imapSettings')}</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">{t('imapServer')}</label>
                <input
                  type="text" value={form.imap_host}
                  onChange={e => { markServerFieldManual('imap_host'); setForm(prev => ({ ...prev, imap_host: e.target.value })); if (errors.imap_host) setErrors(prev => { const n={...prev}; delete n.imap_host; return n; }); }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${errors.imap_host ? 'border-red-500' : 'border-zinc-800'}`}
                  placeholder="imap.example.com"
                />
                {errors.imap_host && <p className="mt-1 text-xs text-red-500">{errors.imap_host}</p>}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('port')}</label>
                <input
                  type="number" value={form.imap_port}
                  onChange={e => { markServerFieldManual('imap_port'); setForm(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 })); }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 ${errors.imap_port ? 'border-red-500' : 'border-zinc-800'}`}
                />
              </div>
            </div>
          </div>

          {/* SMTP */}
          <div>
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">{t('smtpSettings')}</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">{t('smtpServer')}</label>
                <input
                  type="text" value={form.smtp_host}
                  onChange={e => { markServerFieldManual('smtp_host'); setForm(prev => ({ ...prev, smtp_host: e.target.value })); if (errors.smtp_host) setErrors(prev => { const n={...prev}; delete n.smtp_host; return n; }); }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${errors.smtp_host ? 'border-red-500' : 'border-zinc-800'}`}
                  placeholder="smtp.example.com"
                />
                {errors.smtp_host && <p className="mt-1 text-xs text-red-500">{errors.smtp_host}</p>}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('port')}</label>
                <input
                  type="number" value={form.smtp_port}
                  onChange={e => { markServerFieldManual('smtp_port'); setForm(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 })); }}
                  className={`w-full py-2 px-3 bg-zinc-950 border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 ${errors.smtp_port ? 'border-red-500' : 'border-zinc-800'}`}
                />
              </div>
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">{t('username')}</label>
            <input
              type="text" value={form.username}
              onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
              className="w-full py-2.5 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              placeholder={t('usuallySameAsEmail')}
            />
          </div>

          {/* Password — only for password auth */}
          {form.auth_type === 'password' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t('password')}</label>
              <input
                type="password" value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full py-2.5 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                placeholder={account ? t('passwordUnchanged') : t('enterPassword')}
              />
            </div>
          )}

          {/* TLS */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id="use_tls" checked={form.use_tls}
              onChange={e => setForm(prev => ({ ...prev, use_tls: e.target.checked }))}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-blue-600 focus:ring-offset-zinc-900"
            />
            <label htmlFor="use_tls" className="text-sm text-zinc-300 cursor-pointer">{t('useTls')}</label>
          </div>

          {/* Test result */}
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

          {/* Submit error */}
          {errors.submit && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {errors.submit}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800">
          <button
            type="button" onClick={handleTest}
            disabled={testing || !form.imap_host}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            {testing ? t('testing') : t('testConnection')}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={requestClose} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
            {t('cancel')}
          </button>
          <button
            type="button" onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {saving ? (t('saving') || 'Saving…') : account ? 'Update' : t('addEmailAccount')}
          </button>
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-100">是否放弃当前修改？</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              当前邮箱配置还没有保存，放弃后已填写的内容将不会保留。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
              >
                继续编辑
              </button>
              <button
                type="button"
                onClick={discardChangesAndClose}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
              >
                放弃修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AddAccountDialog.displayName = 'AddAccountDialog';
