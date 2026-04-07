import React, { useState } from 'react';
import { Modal } from './Modal';
import { Globe, User, Key, Check, Loader2, Trash2 } from 'lucide-react';

interface SettingsModalProps {
  t: (key: string) => string;
  isOpen: boolean;
  onClose: () => void;
  appLanguage: 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru';
  onAppLanguageChange: (lang: 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru') => void;
  aiTargetLanguage: string;
  onAiTargetLanguageChange: (lang: string) => void;
  onAddAccount: () => void;
  accounts: Array<{
    id: number;
    email: string;
    name: string;
    avatar?: string;
  }>;
  onDeleteAccount: (accountId: number) => void;
  currentAccountId: number;
}

const appLanguages = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
];

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

export function SettingsModal({
  t,
  isOpen,
  onClose,
  appLanguage,
  onAppLanguageChange,
  aiTargetLanguage,
  onAiTargetLanguageChange,
  onAddAccount,
  accounts,
  onDeleteAccount,
  currentAccountId,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'account' | 'ai'>('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold text-zinc-100">{t('settingsTitle')}</h2>
        <button
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { id: 'general', label: t('general') },
          { id: 'account', label: t('account') },
          { id: 'ai', label: 'AI' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5 max-h-96 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="space-y-5">
            {/* App Language */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-3">
                <Globe className="w-4 h-4" />
                {t('appLanguage')}
              </label>
              <select
                value={appLanguage}
                onChange={(e) => onAppLanguageChange(e.target.value as typeof appLanguage)}
                className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                {appLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-2">
                {t('appLanguageHint')}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div className="space-y-4">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded-xl">
                <div className="flex items-center gap-3">
                  {account.avatar ? (
                    <img src={account.avatar} alt={account.name} className="w-10 h-10 rounded-full bg-zinc-600" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                      {account.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{account.name}</p>
                    <p className="text-xs text-zinc-500">{account.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {account.id === currentAccountId && (
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-500 text-xs rounded-full">
                      {t('default')}
                    </span>
                  )}
                  {accounts.length > 1 && (
                    <button
                      onClick={() => onDeleteAccount(account.id)}
                      className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
                      title={t('deleteAccount')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={onAddAccount}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
            >
              + {t('addEmailAccount')}
            </button>

            <div className="pt-4 border-t border-zinc-800">
              <button className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <User className="w-4 h-4" />
                {t('manageGoogleAccount')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-5">
            {/* AI API Settings */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-3">
                <Key className="w-4 h-4" />
                {t('apiConfig')}
              </label>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder={t('apiUrl')}
                  className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
                <input
                  type="password"
                  placeholder={t('apiKey')}
                  className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
                <input
                  type="text"
                  placeholder={t('model')}
                  className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            {/* AI Target Language */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-3 block">
                {t('aiTargetLanguage')}
              </label>
              <select
                value={aiTargetLanguage}
                onChange={(e) => onAiTargetLanguageChange(e.target.value)}
                className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                {aiLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-2">
                {t('aiTargetLanguageHint')}
              </p>
            </div>

            <button
              onClick={handleSave}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {t('saveSettings')}
            </button>

            {saved && (
              <p className="text-center text-green-500 text-sm py-2">
                {t('settingsSaved')}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
