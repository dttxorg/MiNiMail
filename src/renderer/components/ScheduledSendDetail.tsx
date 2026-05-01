import React, { useMemo } from 'react';
import { CalendarClock, Clock, Send, XCircle } from 'lucide-react';
import { sanitizeMailHtml } from '../utils/mailHtmlSanitizer';
import { buildPanelStyle, uiColor } from '../utils/uiDesignTokens';
import { formatScheduledSendCountdown } from '../../shared/compose/scheduleSend';
import type { AppLanguage } from '../../shared/mailFolders';

export interface ScheduledSendDetailJob {
  id: string;
  accountId: number;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  scheduledAt: string;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'missed';
  failureReason?: string;
}

interface ScheduledSendDetailProps {
  job: ScheduledSendDetailJob | null;
  appLanguage: AppLanguage;
  now: Date;
  onCancel: (jobId: string) => void;
  onSendNow?: (jobId: string) => void;
  isCancelling?: boolean;
  isSendingNow?: boolean;
}

function getUi(appLanguage: AppLanguage) {
  if (appLanguage === 'zh') {
    return {
      emptyTitle: '选择一封待发送邮件',
      emptySubtitle: '从左侧列表查看已安排的本地定时发送任务。',
      noSubject: '无主题',
      scheduledFor: '计划发送',
      recipients: '收件人',
      cc: '抄送',
      bcc: '密送',
      status: '状态',
      body: '正文',
      riskTitle: '本地定时提示',
      riskBody: 'MiNiMail 需要保持运行；关闭 App 或电脑睡眠可能错过发送。',
      cancel: '取消发送',
      cancelling: '取消中...',
      sendNow: '重新发送',
      sendingNow: '发送中...',
      emptyBody: '暂无内容',
    };
  }
  return {
    emptyTitle: 'Select a scheduled email',
    emptySubtitle: 'Review locally scheduled send jobs from the list.',
    noSubject: 'No subject',
    scheduledFor: 'Scheduled for',
    recipients: 'To',
    cc: 'Cc',
    bcc: 'Bcc',
    status: 'Status',
    body: 'Body',
    riskTitle: 'Local scheduling notice',
    riskBody: 'MiNiMail must stay running; closing the app or computer sleep may miss delivery.',
    cancel: 'Cancel send',
    cancelling: 'Cancelling...',
    sendNow: 'Send now',
    sendingNow: 'Sending...',
    emptyBody: 'No content',
  };
}

function formatDate(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function joinRecipients(values: string[]): string {
  return values.filter(Boolean).join(', ');
}

export function ScheduledSendDetail({
  job,
  appLanguage,
  now,
  onCancel,
  onSendNow,
  isCancelling = false,
  isSendingNow = false,
}: ScheduledSendDetailProps) {
  const ui = getUi(appLanguage);
  const sanitizedHtml = useMemo(() => {
    if (!job?.bodyHtml) return null;
    return sanitizeMailHtml(job.bodyHtml, { allowRemoteImages: false }).html;
  }, [job?.bodyHtml]);

  if (!job) {
    return (
      <div className="flex-1 h-full min-h-0 flex items-center justify-center" style={{ backgroundColor: '#07101D' }}>
        <div className="text-center px-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: '#C4B5FD', backgroundColor: 'rgba(124,58,237,0.14)' }}>
            <CalendarClock className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold text-zinc-100">{ui.emptyTitle}</div>
          <div className="mt-1 text-xs" style={{ color: uiColor.textSubtle }}>{ui.emptySubtitle}</div>
        </div>
      </div>
    );
  }

  const countdown = formatScheduledSendCountdown(job.scheduledAt, job.status, now, appLanguage);
  const canCancel = job.status === 'scheduled' || job.status === 'missed' || job.status === 'failed';
  const canSendNow = job.status === 'missed' || job.status === 'failed';

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto px-6 py-6" style={{ backgroundColor: '#07101D' }}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ color: '#C4B5FD', backgroundColor: 'rgba(124,58,237,0.14)', border: '1px solid rgba(196,181,253,0.18)' }}>
            <Clock className="h-3.5 w-3.5" />
            {countdown.label}
          </div>
          <h2 className="text-2xl font-semibold text-white leading-tight">{job.subject || ui.noSubject}</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl p-4" style={buildPanelStyle()}>
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: uiColor.textSubtle }}>{ui.scheduledFor}</div>
            <div className="mt-2 text-sm text-zinc-100">{formatDate(job.scheduledAt, appLanguage)}</div>
          </div>
          <div className="rounded-2xl p-4" style={buildPanelStyle()}>
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: uiColor.textSubtle }}>{ui.status}</div>
            <div className="mt-2 text-sm text-zinc-100">{job.status}</div>
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-2" style={buildPanelStyle()}>
          <div className="text-sm text-zinc-100"><span style={{ color: uiColor.textSubtle }}>{ui.recipients}: </span>{joinRecipients(job.to)}</div>
          {job.cc.length > 0 && <div className="text-sm text-zinc-100"><span style={{ color: uiColor.textSubtle }}>{ui.cc}: </span>{joinRecipients(job.cc)}</div>}
          {job.bcc.length > 0 && <div className="text-sm text-zinc-100"><span style={{ color: uiColor.textSubtle }}>{ui.bcc}: </span>{joinRecipients(job.bcc)}</div>}
        </div>

        <div className="rounded-2xl p-4" style={{ ...buildPanelStyle(), backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(147,197,253,0.18)' }}>
          <div className="text-sm font-semibold text-blue-100">{ui.riskTitle}</div>
          <div className="mt-1 text-xs text-blue-100/80">{ui.riskBody}</div>
        </div>

        <div className="rounded-2xl p-5" style={buildPanelStyle()}>
          <div className="mb-4 text-[11px] uppercase tracking-[0.18em]" style={{ color: uiColor.textSubtle }}>{ui.body}</div>
          {sanitizedHtml ? (
            <div className="mail-body-content mail-body-html" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
          ) : (
            <pre className="mail-body-content mail-body-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
              {job.bodyText || ui.emptyBody}
            </pre>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canSendNow && onSendNow && (
            <button
              type="button"
              onClick={() => onSendNow(job.id)}
              disabled={isSendingNow || isCancelling}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-emerald-100 transition-colors disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: 'rgba(16,185,129,0.16)', border: '1px solid rgba(110,231,183,0.28)' }}
            >
              <Send className="h-4 w-4" />
              {isSendingNow ? ui.sendingNow : ui.sendNow}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              disabled={isCancelling || isSendingNow}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-red-100 transition-colors disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: 'rgba(239,68,68,0.16)', border: '1px solid rgba(248,113,113,0.28)' }}
            >
              <XCircle className="h-4 w-4" />
              {isCancelling ? ui.cancelling : ui.cancel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
