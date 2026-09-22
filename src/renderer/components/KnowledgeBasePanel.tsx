// Layer 1 of the knowledge bedrock series: Sidebar "Knowledge Base" panel.
// Provides a global full-text search over the persisted mail_ai_summary and
// mail_ai_thread_summary tables. Rendered with native macOS dark design tokens.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Sparkles, MessageSquare, Mail } from 'lucide-react';
import type { MailAiSummarySearchHit, PreheatMode, PreheatStatus } from '../../shared/email-ai/mailSummaryTypes';

const DEBOUNCE_MS = 250;

type KnowledgeBasePanelProps = {
  accountId: number;
  onOpenMail: (mailId: string) => void;
  onClose: () => void;
};

export function KnowledgeBasePanel({ accountId, onOpenMail, onClose }: KnowledgeBasePanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MailAiSummarySearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preheatStatus, setPreheatStatus] = useState<PreheatStatus | null>(null);
  const [preheatBusy, setPreheatBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = typeof window.electronAPI?.getMailSummaryPreheatStatus === 'function'
          ? await window.electronAPI.getMailSummaryPreheatStatus(accountId)
          : await (window.electronAPI?.invoke?.('ai:getMailSummaryPreheatStatus', accountId) as any);
        if (!cancelled && res?.success && res?.data) setPreheatStatus(res.data);
      } catch {
        // Safe fallback
      }
    };
    void fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const onChangePreheatMode = useCallback(
    async (mode: PreheatMode) => {
      setPreheatBusy(true);
      try {
        const res = typeof window.electronAPI?.setMailSummaryPreheatMode === 'function'
          ? await window.electronAPI.setMailSummaryPreheatMode(mode)
          : await (window.electronAPI?.invoke?.('ai:setMailSummaryPreheatMode', mode) as any);
      } finally {
        setPreheatBusy(false);
      }
    },
    [],
  );

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q) {
        setHits([]);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const res = typeof window.electronAPI?.searchSummaries === 'function'
          ? await window.electronAPI.searchSummaries(accountId, q, 25)
          : await (window.electronAPI?.invoke?.('ai:searchSummaries', accountId, q, 25) as any);
        if (res && res.success && res.data) {
          setHits(res.data);
          setError(null);
        } else {
          setHits([]);
          setError(res.error || 'search_failed');
        }
      } catch (err) {
        setHits([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void runSearch(trimmedQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmedQuery, runSearch]);

  const mailHits = useMemo(() => hits.filter((h) => h.source === 'mail'), [hits]);
  const threadHits = useMemo(() => hits.filter((h) => h.source === 'thread'), [hits]);

  return (
    <div
      className="flex h-full flex-col text-white"
      style={{
        backgroundColor: '#161618',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"',
      }}
    >
      {/* Search Header */}
      <div className="flex items-center gap-2 border-b border-[#2a2a2d] p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#8e8e93]" />
          <input
            className="w-full rounded-lg border border-[#2a2a2d] bg-[#0d0d0f] pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#636366] focus:border-[#0071e3] focus:outline-none"
            placeholder={t('knowledgeBase.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label={t('knowledgeBase.searchPlaceholder')}
          />
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-[#8e8e93] hover:bg-[#2a2a2d] hover:text-white transition-colors cursor-pointer"
          onClick={onClose}
          aria-label={t('knowledgeBase.closePanel')}
        >
          <X size={15} />
        </button>
      </div>

      {/* Preheat status & mode control */}
      {preheatStatus && (
        <div className="flex items-center justify-between border-b border-[#2a2a2d] bg-[#1c1c1e] px-3 py-2 text-[11px] text-[#8e8e93]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[#0a84ff]" />
            <span className="font-medium text-[#c7c7cc]">{t('knowledgeBase.preheat.label')}</span>
            <select
              className="rounded-md border border-[#2a2a2d] bg-[#0d0d0f] px-2 py-0.5 text-[11px] text-white focus:border-[#0071e3] focus:outline-none"
              value={preheatStatus.mode}
              disabled={preheatBusy}
              onChange={(e) => {
                void onChangePreheatMode(e.target.value as PreheatMode);
              }}
            >
              <option value="off">{t('knowledgeBase.preheat.off')}</option>
              <option value="conservative">{t('knowledgeBase.preheat.conservative')}</option>
              <option value="aggressive">{t('knowledgeBase.preheat.aggressive')}</option>
            </select>
          </div>
          <span className="text-[10px] text-[#636366]">
            {t('knowledgeBase.preheat.usage', {
              used: preheatStatus.dailyUsed,
              cap: preheatStatus.dailyCap,
            })}
          </span>
        </div>
      )}

      {/* Result list */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-4">
        {!trimmedQuery && !loading && (
          <div className="flex flex-col items-center justify-center pt-16 text-center text-[#636366]">
            <Search className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{t('knowledgeBase.empty')}</p>
          </div>
        )}

        {loading && (
          <div className="pt-8 text-center text-xs text-[#8e8e93]">
            {t('common.loading', '检索中...')}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-900/50 p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {trimmedQuery && !loading && hits.length === 0 && !error && (
          <div className="pt-16 text-center text-xs text-[#636366]">
            {t('knowledgeBase.noResults')}
          </div>
        )}

        {/* Thread level lineage hits */}
        {threadHits.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2 text-[#0a84ff] font-medium text-[11px]">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('knowledgeBase.threadLevel', '会话脉络')}</span>
              <span className="rounded bg-[#0a84ff]/15 px-1.5 py-0.2 text-[10px] text-[#0a84ff]">
                {threadHits.length}
              </span>
            </div>
            <ul className="space-y-2">
              {threadHits.map((h) => (
                <li key={h.mailId}>
                  <button
                    type="button"
                    onClick={() => onOpenMail(h.mailId)}
                    className="block w-full rounded-xl border border-[#2a2a2d] bg-[#1c1c1e] p-2.5 text-left hover:border-[#0a84ff] hover:bg-[#252528] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-xs truncate group-hover:text-[#0a84ff] transition-colors">
                        {h.subject || '(no thread)'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0a84ff]/20 text-[#0a84ff] font-medium">
                        🧵 Thread
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-[#8e8e93] line-clamp-3">
                      {h.snippet}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Mail level summary hits */}
        {mailHits.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2 text-[#30d158] font-medium text-[11px]">
              <Mail className="w-3.5 h-3.5" />
              <span>{t('knowledgeBase.mailLevel', '单邮件摘要')}</span>
              <span className="rounded bg-[#30d158]/15 px-1.5 py-0.2 text-[10px] text-[#30d158]">
                {mailHits.length}
              </span>
            </div>
            <ul className="space-y-2">
              {mailHits.map((h) => (
                <li key={h.mailId}>
                  <button
                    type="button"
                    onClick={() => onOpenMail(h.mailId)}
                    className="block w-full rounded-xl border border-[#2a2a2d] bg-[#1c1c1e] p-2.5 text-left hover:border-[#30d158] hover:bg-[#252528] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-xs truncate group-hover:text-[#30d158] transition-colors">
                        {h.subject || '(no subject)'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#30d158]/20 text-[#30d158] font-medium">
                        📧 Mail
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-[#8e8e93] line-clamp-2">
                      {h.snippet}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trimmedQuery && hits.length > 0 && (
          <div className="pt-1 text-center text-[10px] text-[#636366]">
            {t('knowledgeBase.resultsCount', { count: hits.length })}
          </div>
        )}
      </div>
    </div>
  );
}
