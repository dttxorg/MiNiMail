import React, { useState, useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { toPng } from 'html-to-image';
import { RendererMailSummary, RendererMailDetail } from '../hooks/useMail';
import { useAI } from '../hooks/useAI';
import { Icons } from './Icons';
import { SenderAvatar } from './SenderAvatar';

type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

type MailEmail = RendererMailSummary | RendererMailDetail;

interface MailDetailProps {
  t: (key: string) => string;
  email: MailEmail | null;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onShare?: (blob: Blob, filename: string) => void;
  aiTargetLanguage: string;
  onReplyWithSuggestion: (content: string) => void;
  mailLoadingState?: MailLoadingState;
  mailError?: string | null;
  onRetry?: () => void;
  threadSiblings?: RendererMailSummary[];
}

type AIFunction = 'translate' | 'summarize' | 'reply';

function isDetail(email: MailEmail): email is RendererMailDetail {
  return 'bodyHtml' in email || 'bodyText' in email;
}

export function MailDetail({
  t,
  email,
  onReply,
  onForward,
  onDelete,
  onShare,
  aiTargetLanguage,
  onReplyWithSuggestion,
  mailLoadingState = 'idle',
  mailError = null,
  onRetry,
  threadSiblings = [],
}: MailDetailProps) {
  const { translate, summarize, suggestReply, loading: aiApiLoading } = useAI();
  const [isStarred, setIsStarred] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoadingLocal] = useState(false);
  const [aiFunction, setAiFunction] = useState<AIFunction | null>(null);
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Reset all transient state when the viewed email changes
  useEffect(() => {
    setIsStarred(false);
    setShowAIPanel(false);
    setAiResult(null);
    setAiLoadingLocal(false);
    setAiFunction(null);
    setCopied(false);
    setCapturing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.accountId, email?.uid]);

  const bodyRef = useRef<HTMLDivElement>(null);

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
    if (!email) return;

    let cleanText = '';

    // ── Path 1: DOM 解析（HTML 邮件）— 浏览器自动剥离 img/媒体标签 ──
    if (isDetail(email) && email.bodyHtml) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = DOMPurify.sanitize(email.bodyHtml, {
        ALLOWED_TAGS: [
          'p','br','b','i','u','strong','em','a','ul','ol','li',
          'h1','h2','h3','h4','h5','h6','blockquote','span','div',
          'table','thead','tbody','tr','th','td','hr','pre','code',
        ],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false,
      });
      cleanText = tempDiv.innerText || tempDiv.textContent || '';
    }

    // ── Path 2: 纯文本回退 — 用正则剥离残留媒体链接 ──
    if (!cleanText) {
      const raw = isDetail(email)
        ? (email.bodyText || email.snippet || email.subject)
        : (email.snippet || email.subject);
      cleanText = raw
        // 剥离 [image: xxx]、![alt](url)、独立图片 URL 等媒体标记
        .replace(/\[image[:\s][^\]]*\]/gi, '')
        .replace(/!\[([^\]]*)\]\([^)]\)/g, '$1')
        .replace(
          /https?:\/\/[^\s\u4e00-\u9fa5]*(?:jpe?g|png|gif|webp|bmp|svg|ico)[^\s\u4e00-\u9fa5]*/gi,
          ''
        )
        // 多个连续空行合并为两个换行（保留段落结构）
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCaptureScreenshot = useCallback(async () => {
    if (!bodyRef.current || !email) return;
    setCapturing(true);

    const el = bodyRef.current;
    const originalOverflow = el.style.overflow;
    const originalHeight = el.style.height;

    try {
      el.style.overflow = 'visible';
      el.style.height = 'auto';

      const dataUrl = await toPng(el, {
        width: el.scrollWidth,
        height: el.scrollHeight,
        pixelRatio: 2,
        style: {
          transform: 'none',
          filter: 'none',
        },
        backgroundColor: '#282A2E',
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `email-${Date.now()}.png`;

      if (onShare) {
        onShare(blob, filename);
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
      }
    } catch (err) {
      console.error('[screenshot] capture failed:', err);
    } finally {
      el.style.overflow = originalOverflow;
      el.style.height = originalHeight;
      setCapturing(false);
    }
  }, [email, onShare]);

  const generateAIResult = async (func: AIFunction): Promise<string> => {
    if (!email) return '';

    const bodyContent = email && isDetail(email)
      ? (email.bodyText || email.snippet || '')
      : (email.snippet || '');

    const emailContent = `Subject: ${email.subject}\nFrom: ${email.fromName || email.from} <${email.from}>\nDate: ${formatDate(email.date)}\n\n${bodyContent}`;

    const langInstruction = `CRITICAL: Your entire response MUST be written exclusively in ${aiTargetLanguage}. Do not mix languages. All text, including labels, headers, and content must be in ${aiTargetLanguage}.`;

    switch (func) {
      case 'translate': {
        const langMap: Record<string, string> = {
          '中文': 'Chinese', 'English': 'English', '日本語': 'Japanese',
          '한국어': 'Korean', 'Español': 'Spanish', 'Français': 'French',
          'Deutsch': 'German', 'Русский': 'Russian',
        };
        const apiLang = langMap[aiTargetLanguage] || 'English';
        const result = await translate(emailContent, apiLang);
        return `[${aiTargetLanguage} 翻译]\n\n${result}`;
      }
      case 'summarize': {
        return await summarize(`${langInstruction}\n\nPlease summarize the following email concisely:\n\n${emailContent}`);
      }
      case 'reply': {
        return await suggestReply(`${langInstruction}\n\nBased on the following received email, suggest a professional reply:\n\n${emailContent}`);
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
    } catch {
      setAiResult('处理失败，请稍后重试。');
    }
    setAiLoadingLocal(false);
  };

  const handleCopyResult = () => {
    if (aiResult) navigator.clipboard.writeText(aiResult);
  };

  const handleUseAsReply = () => {
    if (aiResult) {
      onReplyWithSuggestion(aiResult);
      setShowAIPanel(false);
    }
  };

  // ── Empty states ──────────────────────────────────────────────────────────────
  if (!email && mailLoadingState === 'idle') {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#1F2124' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#282A2E' }}>
          <span className="text-2xl">📧</span>
        </div>
        <p className="text-[12px]" style={{ color: '#48484a' }}>{t('selectMailToRead')}</p>
      </div>
    );
  }

  if (!email && mailLoadingState === 'loading') {
    return (
      <div className="flex-1 h-screen flex flex-col p-6 overflow-hidden" style={{ backgroundColor: '#1F2124' }}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-zinc-800 rounded w-1/2" />
          <div className="h-3 bg-zinc-800 rounded w-1/3" />
          <div className="h-px bg-zinc-800 my-3" />
          <div className="h-3 bg-zinc-800 rounded w-full" />
          <div className="h-3 bg-zinc-800 rounded w-5/6" />
          <div className="h-3 bg-zinc-800 rounded w-4/6" />
        </div>
        <p className="text-center text-[11px] mt-auto" style={{ color: '#3a3a3c' }}>正在从服务器获取内容...</p>
      </div>
    );
  }

  if (!email && (mailLoadingState === 'timeout' || mailLoadingState === 'error')) {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#1F2124' }}>
        <span className="text-2xl">⚠️</span>
        <p className="text-[12px] text-center px-8" style={{ color: '#636366' }}>{mailError || '获取内容超时'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg text-[12px] text-white transition-colors cursor-pointer"
            style={{ backgroundColor: '#0071e3' }}
          >
            点击重试
          </button>
        )}
      </div>
    );
  }

  if (!email) return null;

  const bodyHtml = isDetail(email) ? email.bodyHtml : undefined;
  const bodyText = isDetail(email) ? email.bodyText : undefined;
  const isBodyLoading = mailLoadingState === 'loading';
  const isBodyError = (mailLoadingState === 'error' || mailLoadingState === 'timeout') && !bodyHtml && !bodyText;

  return (
    <div className="flex-1 h-screen flex flex-col relative w-full min-w-0" style={{ backgroundColor: '#1F2124' }}>

      {/* ── Compact Icon-Only Toolbar ── */}
      <div
        className="h-10 px-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid #3a3a3d' }}
      >
        {/* Left group */}
        <div className="flex items-center gap-1">
          <button
            onClick={onReply}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('reply')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Reply}
            </span>
          </button>
          <button
            onClick={onForward}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('forward')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Forward}
            </span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={t('delete')}
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.backgroundColor = 'rgba(255,107,107,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Delete}
            </span>
          </button>
        </div>

        {/* Right group */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCaptureScreenshot}
            disabled={capturing}
            className="p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            title="截图分享"
            style={{ color: '#636366' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="w-[18px] h-[18px] animate-spin" style={{ color: 'currentColor', display: capturing ? 'flex' : 'none' }}>
              {Icons.LoadingSpinner}
            </span>
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: capturing ? 'none' : 'flex' }}>
              {Icons.Share}
            </span>
          </button>

          <button
            onClick={() => setIsStarred(!isStarred)}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title={isStarred ? '取消星标' : '添加星标'}
            style={{ color: isStarred ? '#ff9f0a' : '#636366', backgroundColor: 'transparent' }}
            onMouseEnter={e => { if (!isStarred) { e.currentTarget.style.color = '#ff9f0a'; e.currentTarget.style.backgroundColor = 'rgba(255,159,10,0.08)'; } }}
            onMouseLeave={e => { if (!isStarred) { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {isStarred ? Icons.Starred : Icons.Star}
            </span>
          </button>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title="复制"
            style={{ color: copied ? '#4ade80' : '#636366', backgroundColor: 'transparent' }}
            onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = '#282A2E'; } }}
            onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = '#636366'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: copied ? 'none' : 'flex' }}>
              {Icons.Copy}
            </span>
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: copied ? 'flex' : 'none' }}>
              {Icons.Check}
            </span>
          </button>

          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            title="AI 助手"
            style={{
              backgroundColor: showAIPanel ? 'rgba(0,113,227,0.15)' : 'transparent',
              color: showAIPanel ? '#0071e3' : '#636366',
            }}
            onMouseEnter={e => { if (!showAIPanel) { e.currentTarget.style.backgroundColor = 'rgba(0,113,227,0.08)'; e.currentTarget.style.color = '#0071e3'; } }}
            onMouseLeave={e => { if (!showAIPanel) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; } }}
          >
            <span className="w-[18px] h-[18px]" style={{ color: 'currentColor', display: 'flex' }}>
              {Icons.Sparkle}
            </span>
          </button>
        </div>
      </div>

      {/* ── Email Header ── */}
      <div className="px-4 pt-3 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #3a3a3d' }}>
        <h1 className="text-[14px] font-semibold text-white leading-tight mb-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"', letterSpacing: '-0.01em' }}>{email.subject}</h1>
        <div className="flex items-center gap-2">
          <SenderAvatar name={email.fromName || email.from} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-white truncate" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{email.fromName || email.from}</span>
              <span className="text-[11px] flex-shrink-0" style={{ color: '#48484a' }}>{formatRelativeTime(email.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Email Body ── */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3a3d transparent' }}>

        {/* AI Panel — inside scroll, expands without disrupting layout */}
        {showAIPanel && (
          <div className="mb-4 rounded-xl" style={{ backgroundColor: '#282A2E', padding: '12px 16px' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5" style={{ color: '#0071e3', display: 'flex' }}>
                  {Icons.Sparkle}
                </span>
                <span className="text-[12px] font-medium text-white">{t('aiAssistant')}</span>
                <span className="text-[10px]" style={{ color: '#48484a' }}>{aiTargetLanguage}</span>
              </div>
              <button
                onClick={() => setShowAIPanel(false)}
                className="p-1 cursor-pointer transition-colors"
                style={{ color: '#636366' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#636366'; }}
              >
                <span className="w-3.5 h-3.5" style={{ color: 'currentColor', display: 'flex' }}>
                  {Icons.Close}
                </span>
              </button>
            </div>

            <div className="flex gap-1.5">
              {([
                { fn: 'translate' as AIFunction, icon: Icons.Translate, label: t('translate') },
                { fn: 'summarize' as AIFunction, icon: Icons.Summarize, label: t('summarize') },
                { fn: 'reply' as AIFunction, icon: Icons.SendIcon, label: t('reply') },
              ] as { fn: AIFunction; icon: React.ReactNode; label: string }[]).map(({ fn, icon, label }) => (
                <button
                  key={fn}
                  onClick={() => handleAIFunction(fn)}
                  disabled={aiLoading || aiApiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white transition-colors cursor-pointer disabled:opacity-40"
                  style={{ backgroundColor: '#3a3a3d' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#48484a')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3a3a3d')}
                >
                  <span className="w-3.5 h-3.5" style={{ color: 'currentColor', display: 'flex' }}>
                    {icon as React.ReactElement}
                  </span>
                  {label}
                </button>
              ))}
            </div>

            {(aiLoading || aiApiLoading) && (
              <div className="flex items-center gap-2 mt-2" style={{ color: '#636366' }}>
                <span className="w-3.5 h-3.5 animate-spin" style={{ color: 'currentColor', display: 'flex' }}>
                  {Icons.LoadingSpinner}
                </span>
                <span className="text-[11px]">{t('aiProcessing')}</span>
              </div>
            )}

            {aiResult && (
              <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: '#1F2124' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: '#0071e3' }}>{t(aiFunction === 'translate' ? 'translationResult' : aiFunction === 'summarize' ? 'summary' : 'replySuggestion')}</span>
                  <div className="flex items-center gap-2">
                    {aiFunction === 'reply' && (
                      <button onClick={handleUseAsReply} className="text-[10px] px-2 py-1 rounded-md text-white cursor-pointer transition-colors" style={{ backgroundColor: '#0071e3' }}>{t('useThisReply')}</button>
                    )}
                    <button
                      onClick={handleCopyResult}
                      className="text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      style={{ color: '#636366' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#636366'; }}
                    >
                      <span className="w-3 h-3" style={{ color: 'currentColor', display: 'flex' }}>
                        {Icons.Copy}
                      </span>
                      {t('copy')}
                    </button>
                  </div>
                </div>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed" style={{ color: '#D1D1D6', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>{aiResult}</pre>
              </div>
            )}
          </div>
        )}

        {/* ── Thread: historical messages (collapsed) above current ── */}
        {threadSiblings.length > 0 && (
          <div className="mb-3">
            {threadSiblings.map(sibling => (
              <ThreadMessage key={`${sibling.accountId}:${sibling.uid}`} email={sibling} />
            ))}
          </div>
        )}

        {/* ── Email Body ── */}
        <div className="rounded-xl p-4 text-[13px] leading-relaxed min-h-[100px]" style={{ backgroundColor: '#282A2E', color: '#D1D1D6', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
          {isBodyLoading ? (
            <div className="flex items-center justify-center gap-2 py-8" style={{ color: '#636366' }}>
              <span className="w-4 h-4 animate-spin" style={{ color: 'currentColor', display: 'flex' }}>
                {Icons.LoadingSpinner}
              </span>
              <span className="text-[12px]">正在加载正文...</span>
            </div>
          ) : bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(bodyHtml, {
                  ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','span','div','table','thead','tbody','tr','th','td','img','hr','pre','code'],
                  ALLOWED_ATTR: ['href','src','alt','title','style','class','target'],
                  ALLOW_DATA_ATTR: false,
                }),
              }}
            />
          ) : bodyText ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{bodyText}</pre>
          ) : isBodyError ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]" style={{ backgroundColor: 'rgba(255,159,10,0.1)', color: '#ff9f0a' }}>
                ⚠️ 无法加载正文（{mailError || '连接失败'}）
                {onRetry && (
                  <button onClick={onRetry} className="ml-auto text-[11px] px-2 py-0.5 rounded-md cursor-pointer" style={{ backgroundColor: '#3a3a3d', color: '#a1a1a6' }}>重试</button>
                )}
              </div>
              {email.snippet && <pre style={{ whiteSpace: 'pre-wrap', color: '#D1D1D6', margin: 0 }}>{email.snippet}</pre>}
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', color: '#D1D1D6', margin: 0 }}>{email.snippet || '（无内容）'}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

interface ThreadMessageProps {
  email: RendererMailSummary;
}

function ThreadMessage({ email }: ThreadMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RendererMailDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && !detail && !loading) {
      setLoading(true);
      try {
        const res = await window.electronAPI.invoke(
          'mail:fetchFull',
          email.accountId,
          email.uid,
          email.folder
        ) as { success: boolean; data?: RendererMailDetail };
        if (res.success && res.data) setDetail(res.data);
      } catch (err) {
        console.error('[ThreadMessage] fetchFull failed:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const bodyHtml = detail?.bodyHtml;
  const bodyText = detail?.bodyText;

  return (
    <div className="mb-2 rounded-xl overflow-hidden" style={{ backgroundColor: '#282A2E' }}>
      {/* Header row — always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ color: '#D1D1D6' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#3a3a3d'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <SenderAvatar name={email.fromName || email.from} size={22} />
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-[12px] font-medium truncate">{email.fromName || email.from}</span>
          {email.to && (
            <span className="text-[11px] truncate" style={{ color: '#636366' }}>
              → {email.to.split(',')[0]}
            </span>
          )}
        </div>
        <span className="text-[11px] flex-shrink-0" style={{ color: '#636366' }}>
          {formatRelativeTime(email.date)}
        </span>
        <span className="text-[10px] flex-shrink-0 ml-1" style={{ color: '#636366' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Body — only when expanded */}
      {expanded && (
        <div
          className="px-3 pb-3 text-[12px] leading-relaxed"
          style={{ borderTop: '1px solid #3a3a3d', color: '#D1D1D6', paddingTop: 8 }}
        >
          {loading ? (
            <div className="flex items-center gap-2 py-3" style={{ color: '#636366' }}>
              <span className="w-3.5 h-3.5 animate-spin" style={{ display: 'flex' }}>
                {Icons.LoadingSpinner}
              </span>
              <span>加载中...</span>
            </div>
          ) : bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(bodyHtml, {
                  ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','span','div','table','thead','tbody','tr','th','td','img','hr','pre','code'],
                  ALLOWED_ATTR: ['href','src','alt','title','style','class','target'],
                  ALLOW_DATA_ATTR: false,
                }),
              }}
            />
          ) : bodyText ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{bodyText}</pre>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{email.snippet || '（无内容）'}</pre>
          )}
        </div>
      )}
    </div>
  );
}
