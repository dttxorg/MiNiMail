// Layer 1 of the knowledge bedrock series: Sidebar "Knowledge Base" panel.
// Provides a global full-text search over the persisted mail_ai_summary
// table (FTS5 + LIKE fallback). Clicking a result opens the original mail
// via the parent callback.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
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

  // Layer 1 of the knowledge bedrock series: load the preheat worker status
  // on mount so the user can see (and toggle) the cost-control mode from
  // inside the panel header. The status includes daily usage / cap which is
  // useful feedback even when the user is not actively searching.
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      .getMailSummaryPreheatStatus(accountId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setPreheatStatus(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const onChangePreheatMode = useCallback(
    async (mode: PreheatMode) => {
      setPreheatBusy(true);
      try {
        const res = await window.electronAPI.setMailSummaryPreheatMode(mode);
        if (res.success && res.data) setPreheatStatus(res.data);
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
        const res = await window.electronAPI.searchSummaries(accountId, q, 20);
        if (res.success && res.data) {
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
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder={t('knowledgeBase.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label={t('knowledgeBase.searchPlaceholder')}
        />
        <button
          type="button"
          className="rounded p-2 text-slate-600 hover:bg-slate-200"
          onClick={onClose}
          aria-label={t('knowledgeBase.closePanel')}
        >
          <X size={16} />
        </button>
      </div>

      {preheatStatus && (
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium">{t('knowledgeBase.preheat.label')}</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
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
          <span className="ml-auto text-slate-500">
            {t('knowledgeBase.preheat.usage', {
              used: preheatStatus.dailyUsed,
              cap: preheatStatus.dailyCap,
            })}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {!trimmedQuery && !loading && (
          <div className="text-slate-500">{t('knowledgeBase.empty')}</div>
        )}
        {error && (
          <div className="mb-2 text-xs text-red-600">{error}</div>
        )}
        {trimmedQuery && !loading && hits.length === 0 && !error && (
          <div className="text-slate-500">{t('knowledgeBase.noResults')}</div>
        )}
        {mailHits.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 font-medium text-slate-700">{t('knowledgeBase.mailLevel')}</h3>
            <ul className="space-y-2">
              {mailHits.map((h) => (
                <li key={h.mailId}>
                  <button
                    type="button"
                    onClick={() => onOpenMail(h.mailId)}
                    className="block w-full rounded border border-slate-200 bg-white p-2 text-left hover:border-blue-400"
                  >
                    <div className="font-medium text-slate-800">{h.subject || '(no subject)'}</div>
                    <div className="text-xs text-slate-500">{h.snippet}</div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {threadHits.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 font-medium text-slate-700">{t('knowledgeBase.threadLevel')}</h3>
            <ul className="space-y-2">
              {threadHits.map((h) => (
                <li key={h.mailId}>
                  <button
                    type="button"
                    onClick={() => onOpenMail(h.mailId)}
                    className="block w-full rounded border border-slate-200 bg-white p-2 text-left hover:border-blue-400"
                  >
                    <div className="font-medium text-slate-800">{h.subject || '(no thread)'}</div>
                    <div className="text-xs text-slate-500">{h.snippet}</div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {trimmedQuery && (
          <div className="mt-2 text-xs text-slate-400">
            {t('knowledgeBase.resultsCount', { count: hits.length })}
          </div>
        )}
      </div>
    </div>
  );
}
