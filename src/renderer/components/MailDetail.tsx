import React, { useState } from 'react';
import {
  Reply,
  Forward,
  Trash2,
  Sparkles,
  Star,
  Copy,
  Check,
  Loader2,
  X,
  Languages,
  FileText,
  Send,
} from 'lucide-react';
import { MockEmail } from '../data/mockData';
import { useAI } from '../hooks/useAI';

type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

interface MailDetailProps {
  t: (key: string) => string;
  email: MockEmail | null;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  aiTargetLanguage: string;
  onReplyWithSuggestion: (content: string) => void;
  mailLoadingState?: MailLoadingState;
  mailError?: string | null;
  onRetry?: () => void;
}

type AIFunction = 'translate' | 'summarize' | 'reply';

export function MailDetail({
  t,
  email,
  onReply,
  onForward,
  onDelete,
  aiTargetLanguage,
  onReplyWithSuggestion,
  mailLoadingState = 'idle',
  mailError = null,
  onRetry,
}: MailDetailProps) {
  const { translate, summarize, suggestReply, loading: aiApiLoading } = useAI();
  const [isStarred, setIsStarred] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoadingLocal] = useState(false);
  const [aiFunction, setAiFunction] = useState<AIFunction | null>(null);
  const [copied, setCopied] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCopy = () => {
    if (email) {
      navigator.clipboard.writeText(email.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateAIResult = async (func: AIFunction): Promise<string> => {
    if (!email) return '';

    const emailContent = `Subject: ${email.subject}\nFrom: ${email.from.name} <${email.from.email}>\nDate: ${formatDate(email.date)}\n\n${email.body}`;

    // Language instruction for AI - CRITICAL directive
    const langInstruction = `CRITICAL: Your entire response MUST be written exclusively in ${aiTargetLanguage}. Do not mix languages. All text, including labels, headers, and content must be in ${aiTargetLanguage}.`;

    switch (func) {
      case 'translate': {
        // Map aiTargetLanguage to API format
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
        const apiLang = langMap[aiTargetLanguage] || 'English';
        const result = await translate(emailContent, apiLang);
        return `[${aiTargetLanguage} 翻译]\n\n${result}`;
      }

      case 'summarize': {
        // Summarize with language instruction embedded in prompt
        const result = await summarize(`${langInstruction}\n\nPlease summarize the following email concisely:\n\n${emailContent}`);
        return result;
      }

      case 'reply': {
        // Generate reply suggestion
        const result = await suggestReply(`${langInstruction}\n\nBased on the following received email, suggest a professional reply:\n\n${emailContent}`);
        return result;
      }

      default:
        return '';
    }
  };

  const handleAIFunction = async (func: AIFunction) => {
    if (!email) return;

    setAiFunction(func);
    setAiLoadingLocal(true);
    setAiResult(null);

    try {
      const result = await generateAIResult(func);
      setAiResult(result);
    } catch (error) {
      setAiResult('处理失败，请稍后重试。');
    }

    setAiLoadingLocal(false);
  };

  const handleCopyResult = () => {
    if (aiResult) {
      navigator.clipboard.writeText(aiResult);
    }
  };

  const handleUseAsReply = () => {
    if (aiResult) {
      onReplyWithSuggestion(aiResult);
      setShowAIPanel(false);
    }
  };

  // No email selected + not loading = show placeholder
  if (!email && mailLoadingState === 'idle') {
    return (
      <div className="flex-1 h-screen bg-zinc-900 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <span className="text-4xl">✨</span>
        </div>
        <p className="text-lg font-medium text-zinc-400 mb-2">{t('selectMailToRead')}</p>
        <p className="text-sm">{t('chooseMailToView')}</p>
      </div>
    );
  }

  // Loading skeleton
  if (mailLoadingState === 'loading') {
    return (
      <div className="flex-1 h-screen bg-zinc-900 flex flex-col p-6 overflow-y-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-zinc-700 rounded w-1/2" />
          <div className="h-4 bg-zinc-700 rounded w-1/3" />
          <div className="border-t border-zinc-700 my-4" />
          <div className="h-4 bg-zinc-700 rounded w-full" />
          <div className="h-4 bg-zinc-700 rounded w-5/6" />
          <div className="h-4 bg-zinc-700 rounded w-4/6" />
        </div>
        <p className="text-center text-zinc-500 mt-6 text-sm">正在从服务器获取内容...</p>
      </div>
    );
  }

  // Timeout / Error state
  if (mailLoadingState === 'timeout' || mailLoadingState === 'error') {
    return (
      <div className="flex-1 h-screen bg-zinc-900 flex flex-col items-center justify-center text-zinc-400 gap-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm text-center px-8">{mailError || '获取内容超时，请检查网络后重试'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors"
          >
            点击重试
          </button>
        )}
      </div>
    );
  }

  // Safety check - should not reach here without email in success state
  if (!email) return null;

  return (
    <div className="flex-1 h-screen bg-zinc-900 flex flex-col relative">
      {/* Action Bar */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onReply}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <Reply className="w-4 h-4" />
            {t('reply')}
          </button>
          <button
            onClick={onForward}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <Forward className="w-4 h-4" />
            {t('forward')}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('delete')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsStarred(!isStarred)}
            className={`p-2 rounded-lg transition-colors ${
              isStarred
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
            }`}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-500' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              showAIPanel
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI
          </button>
        </div>
      </div>

      {/* AI Panel */}
      {showAIPanel && (
        <div className="border-b border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              {t('aiAssistant')}
              <span className="text-zinc-500 text-xs font-normal">
                ({t('aiTargetLanguage')}: {aiTargetLanguage})
              </span>
            </h3>
            <button
              onClick={() => setShowAIPanel(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* AI Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => handleAIFunction('translate')}
              disabled={aiLoading || aiApiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Languages className="w-4 h-4" />
              {t('translate')}
            </button>
            <button
              onClick={() => handleAIFunction('summarize')}
              disabled={aiLoading || aiApiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {t('summarize')}
            </button>
            <button
              onClick={() => handleAIFunction('reply')}
              disabled={aiLoading || aiApiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {t('reply')}
            </button>
          </div>

          {/* AI Result */}
          {(aiLoading || aiApiLoading) && (
            <div className="flex items-center gap-3 text-zinc-400 py-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{t('aiProcessing')}</span>
            </div>
          )}

          {aiResult && (
            <div className="bg-zinc-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-500 text-sm font-medium">
                  {aiFunction === 'translate' && t('translationResult')}
                  {aiFunction === 'summarize' && t('summary')}
                  {aiFunction === 'reply' && t('replySuggestion')}
                </span>
                <div className="flex gap-2">
                  {aiFunction === 'reply' && (
                    <button
                      onClick={handleUseAsReply}
                      className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      {t('useThisReply')}
                    </button>
                  )}
                  <button
                    onClick={handleCopyResult}
                    className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {t('copy')}
                  </button>
                </div>
              </div>
              <pre className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                {aiResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Email Header */}
      <div className="p-6 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-zinc-100 mb-4">{email.subject}</h1>

        <div className="flex items-start gap-4">
          {email.from.avatar ? (
            <img
              src={email.from.avatar}
              alt={email.from.name}
              className="w-12 h-12 rounded-full bg-zinc-700 flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {email.from.name.charAt(0)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-zinc-100 font-semibold">{email.from.name}</span>
                <span className="text-zinc-500 text-sm ml-2">&lt;{email.from.email}&gt;</span>
              </div>
              <span className="text-zinc-500 text-sm">{formatDate(email.date)}</span>
            </div>
            <div className="text-zinc-400 text-sm">
              <span className="text-zinc-500">{t('to')}：</span>
              {email.to.join(', ')}
            </div>
          </div>
        </div>
      </div>

      {/* Email Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* White card for email body */}
        <div className="bg-zinc-100 rounded-2xl p-6 text-zinc-800">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {email.body}
          </pre>
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-6">
            <h4 className="text-zinc-400 text-sm font-medium mb-3">
              {email.attachments.length} {t('attachments')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((att, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm"
                >
                  <span className="text-zinc-400">{att.type}</span>
                  <span className="text-zinc-300">{att.name}</span>
                  <span className="text-zinc-500">({att.size})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
