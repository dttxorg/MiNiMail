import React, { useState, useEffect } from 'react';
import { Loader2, X, Globe } from 'lucide-react';
import type { Account } from '../types';

interface ComposeDialogProps {
  t: (key: string) => string;
  isOpen: boolean;
  onClose: () => void;
  accounts: Array<{
    id: number;
    email: string;
    name: string;
    avatar?: string;
  }>;
  selectedAccount: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
  } | null;
  onSend: (options: {
    accountId: number;
    to: string[];
    subject: string;
    body: string;
  }) => Promise<{ success: boolean; message: string }>;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  aiTargetLanguage: string;
}

const aiLanguages = [
  { value: '中文', label: '中文' },
  { value: 'English', label: 'English' },
  { value: '日本語', label: '日本語' },
  { value: '한국어', label: '한국어' },
  { value: 'Español', label: 'Español' },
  { value: 'Français', label: 'Français' },
  { value: 'Deutsch', label: 'Deutsch' },
  { value: 'Русский', label: 'Русский' },
];

export function ComposeDialog({
  t,
  isOpen,
  onClose,
  accounts,
  selectedAccount,
  onSend,
  initialTo,
  initialSubject,
  initialBody,
  aiTargetLanguage,
}: ComposeDialogProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFrom(selectedAccount?.email || accounts[0]?.email || '');
      setTo(initialTo || '');
      setSubject(initialSubject || '');
      setBody(initialBody || '');
      setError(null);
    }
  }, [isOpen, selectedAccount, accounts, initialTo, initialSubject, initialBody]);

  const handleSend = async () => {
    if (!to.trim()) {
      setError(t('validateRecipientRequired') || '请输入收件人');
      return;
    }
    if (!subject.trim()) {
      setError(t('validateSubjectRequired') || '请输入主题');
      return;
    }

    setSending(true);
    setError(null);

    const toEmails = to.split(',').map(e => e.trim()).filter(e => e);
    const account = accounts.find(a => a.email === from);

    if (!account) {
      setError(t('validateAccountRequired') || '请选择发件账号');
      setSending(false);
      return;
    }

    const result = await onSend({
      accountId: account.id,
      to: toEmails,
      subject: subject.trim(),
      body: body.trim(),
    });

    setSending(false);

    if (result.success) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  const handlePolish = async () => {
    if (!body.trim()) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.invoke('ai:polish', body, 'formal') as {
        success: boolean; content?: string; error?: string;
      };
      if (res.success && res.content) {
        setBody(res.content);
      } else {
        setError(res.error || '润色失败，请检查 AI 配置');
      }
    } catch (err) {
      setError((err as Error).message || '润色请求异常');
    } finally {
      setAiLoading(false);
    }
  };

  const handleTranslate = async (targetLang: string) => {
    if (!body.trim()) return;
    setAiLoading(true);
    setError(null);
    setShowLangMenu(false);

    const langMap: Record<string, string> = {
      '中文': 'Chinese',
      'English': 'English',
      '日本語': 'Japanese',
      '한국어': 'Korean',
      'Español': 'Spanish',
      'Français': 'French',
      'Deutsch': 'German',
      'Русский': 'Russian',
    };
    const apiLang = langMap[targetLang] || targetLang;

    try {
      const res = await window.electronAPI.invoke('ai:translate', body, apiLang) as {
        success: boolean; content?: string; error?: string;
      };
      if (res.success && res.content) {
        setBody(res.content);
      } else {
        setError(res.error || '翻译失败，请检查 AI 配置');
      }
    } catch (err) {
      setError((err as Error).message || '翻译请求异常');
    } finally {
      setAiLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-2xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-100">{t('newMail')}</h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* From */}
        <div className="flex items-center px-5 py-3 border-b border-zinc-800">
          <label className="text-sm text-zinc-500 w-12 flex-shrink-0">{t('from')}</label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1 bg-transparent text-zinc-100 text-sm focus:outline-none cursor-pointer"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.email} className="bg-zinc-900">
                {account.email}
              </option>
            ))}
          </select>
        </div>

        {/* To */}
        <div className="flex items-center px-5 py-3 border-b border-zinc-800">
          <label className="text-sm text-zinc-500 w-12 flex-shrink-0">{t('to')}</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-zinc-100 text-sm focus:outline-none"
            placeholder={t('multipleRecipients')}
          />
        </div>

        {/* Subject */}
        <div className="flex items-center px-5 py-3 border-b border-zinc-800">
          <label className="text-sm text-zinc-500 w-12 flex-shrink-0">{t('subject')}</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-zinc-100 text-sm focus:outline-none"
            placeholder={t('subject')}
          />
        </div>

        {/* AI Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-zinc-800 bg-zinc-950">
          <span className="text-xs text-zinc-500 mr-2">{t('aiAssistant')}:</span>
          <button
            onClick={handlePolish}
            disabled={aiLoading || !body.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            ✨ {t('aiPolish')}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              disabled={aiLoading || !body.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs transition-colors disabled:opacity-50"
            >
              <Globe className="w-3 h-3" />
              {t('aiTranslate')}
            </button>
            {showLangMenu && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden shadow-xl z-10">
                {aiLanguages.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => handleTranslate(lang.value)}
                    className="block w-full px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors text-left"
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {aiLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
        </div>

        {/* Body */}
        <div className="p-5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full h-64 bg-transparent text-zinc-100 text-sm focus:outline-none resize-none placeholder:text-zinc-600"
            placeholder={t('body')}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {sending ? t('sending') : t('send')}
          </button>
        </div>
      </div>
    </div>
  );
}
