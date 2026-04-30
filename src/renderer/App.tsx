import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Sidebar';
import { MailList } from './components/MailList';
import { MailDetail } from './components/MailDetail';
import { ComposeDialog } from './components/ComposeDialog';
import { SettingsModal } from './components/SettingsModal';
import { AddAccountDialog, AddAccountDialogHandle } from './components/AddAccountDialog';
import { ToastContainer, ToastData } from './components/Toast';
import { WindowControls } from './components/WindowControls';
import type { CreateAccountInput } from './types';
import { useAccounts } from './hooks/useAccounts';
import { useMail, RendererMailAttachment, RendererMailDetail, RendererMailSummary } from './hooks/useMail';
import {
  buildClassifiedConversationKey,
  findClassifiedConversationMails,
  findSenderConversationMails,
  getConversationCounterparty,
  isLocalSenderMail,
} from './utils/mailConversations';
import {
  buildComposeQuotedOriginal,
  buildComposeRecipientOption,
  buildRecipientSuggestionsFromMails,
  type ComposeDraftOption,
  type ComposeQuotedOriginal,
  type ComposeRecipientOption,
} from './utils/composeDraft';
import {
  normalizeOutgoingAttachments,
  type OutgoingAttachmentReference,
} from '../shared/outgoingAttachments';
import { applyMailReadState, resolveArchiveOrSpamRemovalAction, resolveDeleteMailAction, shouldMarkMailReadOnOpen } from './utils/mailFolderActions';
import { resolveDisplayedMail } from './utils/mailSelection';
import { resolveComposeSelectedAccount } from './utils/composeAccount';
import { buildMailListViewModel } from './utils/mailListViewModel';
import { resolveActiveAccountAfterAccountsRefresh, resolveActiveAccountAfterDelete } from './utils/accountSelection';
import { buildServerMailIdentitySet, filterOutPersistedLocalThreadMails } from './utils/localThreadMailState';
import { getSyncFoldersForView, isStandardFolder, STANDARD_FOLDERS, type StandardFolderId } from './utils/mailSyncPlanner';
import {
  AppLanguage,
  folderMatches,
  getAiLanguageFromAppLanguage,
  resolveFolderPath,
} from '../shared/mailFolders';
import type { AiPrivacyMode } from '../shared/email-ai';
import {
  mailCacheRangeToMs,
  mailHistoryRangeToMs,
  type MailCacheRange,
  type MailHistoryRange,
} from '../shared/mailSyncSettings';
import type { MailBackupProgress, MailBackupResult, MailExportRequest, MailImportRequest } from '../shared/backup';
import {
  GITHUB_NOTIFICATIONS_VIEW_ENABLED_SETTING_KEY,
  MAIL_CACHE_RANGE_SETTING_KEY,
  MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY,
  MAIL_FETCH_HISTORY_RANGE_SETTING_KEY,
  normalizeMailSettingsSnapshot,
} from './utils/mailSettings';
import { formatStagedHistoryLabel } from './utils/mailHistoryRange';
import { shouldAutoSyncView } from './utils/mailViewSync';
import { pickBodyPrefetchCandidates } from './utils/bodyCachePrefetch';
import { clearMailScanState } from './utils/mailScanState';
import {
  canStartBackupExport,
  createInitialBackupState,
  type BackupUiState,
} from './utils/mailBackupUi';
import {
  filterMailsForRoutingFolder,
  GITHUB_SMART_FOLDER_IDS,
  isGitHubSmartFolderId,
  isPriorityFolderId,
  type MailRoutingFolderId,
  type MailRoutingResultEntry,
} from './utils/mailRoutingAdapter';
import { buildMailRoutingDiagnosticsMap } from './utils/mailRoutingExplanationAdapter';
import { getGitHubPriorityBadgeInfo } from './utils/githubPriorityUi';
import { resolveNextDraftSelectionAfterDelete } from './utils/draftSelection';
import {
  collectRemovedMailIdsForDeletedTarget,
  shouldRemoveMailForDeletedTarget,
  type MailRemovalIdentity,
} from './utils/mailRemoval';
import './i18n';

type ScanMode = 'smart' | 'light' | 'deep';
type LookbackRange = '3d' | '7d' | '1mo' | '6mo' | 'all';

const ACCOUNT_FOLDERS_CACHE_TTL_MS = 5 * 60 * 1000;
const FOLDER_BODY_PREFETCH_LIMIT = 12;
const SEND_UNDO_DELAY_MS = 5000;
const CONVERSATION_BODY_PREFETCH_LIMIT = 8;

function getDraftKeyFromMailId(id: string): string {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

function getLocalDraftMessageId(draftKey: string): string {
  return `<${draftKey}@minimail>`;
}

function extractLocalDraftKeyFromMessageId(messageId?: string | null): string | null {
  if (!messageId) return null;
  const match = messageId.trim().match(/^<([^>]+)@minimail>$/i);
  return match?.[1] || null;
}

function matchesComposeDraftToken(
  mail: Pick<RendererMailSummary, 'id' | 'localDraftKey' | 'messageId'>,
  deletedTokens: Set<string>,
): boolean {
  if (deletedTokens.size === 0) return false;
  if (deletedTokens.has(mail.id)) return true;
  if (mail.localDraftKey && deletedTokens.has(mail.localDraftKey)) return true;
  const extractedDraftKey = extractLocalDraftKeyFromMessageId(mail.messageId);
  if (extractedDraftKey && deletedTokens.has(extractedDraftKey)) return true;
  if (mail.messageId && deletedTokens.has(mail.messageId)) return true;
  return false;
}

type PersistedComposeDraftPayload = {
  draftKey?: string;
  recipients?: ComposeRecipientOption[];
  body?: string;
  quotedOriginal?: ComposeQuotedOriginal | null;
  outgoingAttachments?: OutgoingAttachmentReference[];
};

function parseComposeDraftPayload(value?: string): PersistedComposeDraftPayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as PersistedComposeDraftPayload | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const recipients = Array.isArray(parsed.recipients)
      ? parsed.recipients.filter((item): item is ComposeRecipientOption => (
          Boolean(item)
          && typeof item.email === 'string'
          && typeof item.label === 'string'
        ))
      : undefined;

    const quotedOriginal = parsed.quotedOriginal && typeof parsed.quotedOriginal === 'object'
      ? parsed.quotedOriginal as ComposeQuotedOriginal
      : null;

    return {
      draftKey: typeof parsed.draftKey === 'string' ? parsed.draftKey : undefined,
      recipients,
      body: typeof parsed.body === 'string' ? parsed.body : undefined,
      quotedOriginal,
      outgoingAttachments: normalizeOutgoingAttachments(parsed.outgoingAttachments),
    };
  } catch (error) {
    console.warn('[composeDraft] failed to parse persisted draft payload:', error);
    return null;
  }
}

function buildOutgoingAttachmentMetadata(
  attachments?: OutgoingAttachmentReference[],
): RendererMailAttachment[] {
  const normalizedAttachments = normalizeOutgoingAttachments(attachments);
  if (normalizedAttachments.length === 0) return [];
  return normalizedAttachments.map((attachment) => ({
    cacheId: attachment.id,
    filename: attachment.filename || 'attachment',
    contentType: attachment.contentType || 'application/octet-stream',
    size: Number.isFinite(attachment.size) ? Math.max(0, Math.floor(attachment.size || 0)) : 0,
    inline: false,
    disposition: 'attachment',
  }));
}

function isDraftMailForDisplay(mail: Pick<RendererMailSummary, 'folder' | 'localDraftKey' | 'messageId' | 'deliveryState'>): boolean {
  if (mail.deliveryState === 'cancelled') return true;
  if (mail.deliveryState) return false;
  if (mail.messageId?.startsWith('<local-')) return false;
  if (mail.localDraftKey) return true;
  if (folderMatches(mail.folder, 'drafts')) return true;
  return /^<draft-[^>]+@minimail>$/.test(mail.messageId || '');
}

function filterDraftsForSelectedFolder<T extends Pick<RendererMailSummary, 'folder' | 'localDraftKey' | 'messageId' | 'deliveryState'>>(
  mails: T[],
  selectedFolder: string,
): T[] {
  if (selectedFolder === 'drafts') return mails;
  return mails.filter((mail) => !isDraftMailForDisplay(mail));
}

function isUnsentDraftMail(mail: Pick<RendererMailSummary, 'folder' | 'localDraftKey' | 'messageId' | 'deliveryState'>): boolean {
  if (!isDraftMailForDisplay(mail)) return false;
  return true;
}

function buildComposeDraftOptionFromMail(mail: RendererMailSummary): ComposeDraftOption | null {
  const draftPayload = parseComposeDraftPayload(mail.draftPayload);
  const draftKey = mail.deliveryState === 'cancelled'
    ? draftPayload?.draftKey || mail.localDraftKey || getDraftKeyFromMailId(mail.id)
    : mail.localDraftKey || extractLocalDraftKeyFromMessageId(mail.messageId) || getDraftKeyFromMailId(mail.id);
  if (!draftKey) return null;

  const fallbackRecipients = mail.to
    ? mail.to
        .split(',')
        .map((value) => buildComposeRecipientOption(value, value.split('@')[0]))
        .filter((value): value is ComposeRecipientOption => Boolean(value))
    : [];
  const normalizedDate = mail.date instanceof Date ? mail.date : new Date(mail.date);

  return {
    id: mail.id,
    accountId: mail.accountId,
    uid: mail.uid,
    folder: mail.folder,
    messageId: mail.messageId,
    localOnly: Boolean(mail.localDraftKey) || mail.deliveryState === 'cancelled' || /^<draft-[^>]+@minimail>$/.test(mail.messageId || ''),
    draftKey,
    recipients: draftPayload?.recipients ?? fallbackRecipients,
    subject: mail.subject,
    body: draftPayload?.body ?? mail.bodyText ?? mail.snippet,
    quotedOriginal: draftPayload?.quotedOriginal ?? null,
    outgoingAttachments: draftPayload?.outgoingAttachments ?? [],
    date: Number.isFinite(normalizedDate.getTime()) ? normalizedDate : new Date(),
  };
}

function buildRecoveredDraftFromScheduledMail(
  mail: RendererMailSummary,
  draftFolderPath: string,
): RendererMailSummary {
  const draftPayload = parseComposeDraftPayload(mail.draftPayload);
  const rawDraftKey = draftPayload?.draftKey || mail.localDraftKey || extractLocalDraftKeyFromMessageId(mail.messageId);
  const fallbackKey = `draft-recovered-${String(mail.localSendId || mail.id || Date.now())
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 80)}`;
  const draftKey = rawDraftKey && /^draft-/i.test(rawDraftKey) ? rawDraftKey : fallbackKey;
  const recipients = draftPayload?.recipients || (mail.to
    ? mail.to
        .split(',')
        .map((value) => buildComposeRecipientOption(value, value.split('@')[0]))
        .filter((value): value is ComposeRecipientOption => Boolean(value))
    : []);
  const body = draftPayload?.body ?? mail.bodyText ?? mail.snippet ?? '';
  const recoveredPayload: PersistedComposeDraftPayload = {
    draftKey,
    recipients,
    body,
    quotedOriginal: draftPayload?.quotedOriginal ?? null,
    outgoingAttachments: draftPayload?.outgoingAttachments ?? [],
  };
  const draftDate = new Date();

  return {
    id: `${mail.accountId}:${draftKey}`,
    uid: Number(draftKey.replace(/\D/g, '').slice(-12)) || draftDate.getTime(),
    from: mail.from,
    fromName: mail.fromName,
    to: recipients.map((recipient) => recipient.email).join(', '),
    subject: mail.subject,
    date: draftDate,
    snippet: body.trim().slice(0, 160),
    hasAttachments: (draftPayload?.outgoingAttachments?.length ?? 0) > 0,
    isRead: true,
    isStarred: false,
    folder: draftFolderPath,
    accountId: mail.accountId,
    messageId: getLocalDraftMessageId(draftKey),
    localDraftKey: draftKey,
    draftPayload: JSON.stringify(recoveredPayload),
    bodyText: body,
    attachments: (draftPayload?.outgoingAttachments || []).map((attachment) => ({
      cacheId: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || 0,
      inline: false,
    })),
  };
}

interface CurrentAccount {
  id: number;
  email: string;
  name: string;
  avatar?: string;
}

interface MailFolderInfo {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
}

type BatchClassifyResponse = {
  success: boolean;
  results?: Array<{ id: string; category: string }>;
  routingResults?: MailRoutingResultEntry[];
  failedIds?: string[];
};

interface ComposeContext {
  mode: 'new' | 'reply' | 'forward';
  source: RendererMailSummary | RendererMailDetail | null;
}

interface ComposeRestoreDraft {
  accountId: number;
  recipients: ComposeRecipientOption[];
  subject: string;
  body: string;
  outgoingAttachments?: OutgoingAttachmentReference[];
  mode: ComposeContext['mode'];
  source: RendererMailSummary | RendererMailDetail | null;
}

type StagedHistoryUiState = {
  active: boolean;
  stageRange: MailHistoryRange | null;
  stageIndex: number;
  totalStages: number;
  accountId: number | null;
  folder: string | null;
};

function createEmptyStagedHistorySyncState(): StagedHistoryUiState {
  return {
    active: false,
    stageRange: null,
    stageIndex: 0,
    totalStages: 0,
    accountId: null,
    folder: null,
  };
}

const APP_LANGUAGE_SETTING_KEY = 'app_language';
const AI_CATEGORY_IDS = [
  '工作/业务类',
  '账单/财务类',
  '社交/个人类',
  '广告/营销类',
  '安全/风险类',
  '通知类',
] as const;

function lookbackToMs(range: LookbackRange): number {
  if (range === '3d') return 3 * 24 * 60 * 60 * 1000;
  if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
  if (range === '6mo') return 6 * 30 * 24 * 60 * 60 * 1000;
  if (range === 'all') return Number.POSITIVE_INFINITY;
  return 30 * 24 * 60 * 60 * 1000;
}

function getAccountAvatar(email: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${email.split('@')[0]}`;
}

function getAppUi(appLanguage: AppLanguage) {
  if (appLanguage === 'ja') {
    return {
      shareSuccess: '長いスクリーンショットをコピーしました',
      shareFailed: 'このメールはスクリーンショットとしてコピーできません',
      aiNeedApiKey: '設定で AI API Key を先に設定してください',
      aiNoEligibleShort: '分類対象の未読メールがありません',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `${total} 件のメールを分析開始（${scanLabel}・${rangeLabel}）`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `${processed}/${total} 件を分析中（${scanLabel}）`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI 分析完了: 走査 ${total} 件 / 分類 ${classified} 件${failed > 0 ? ` / 未認識 ${failed} 件` : ''}${unclassified > 0 ? ` / 未分類 ${unclassified} 件` : ''}`,
      aiFailed: 'AI 分析に失敗しました',
      sendSuccess: '送信しました',
      sendFailedFallback: '送信に失敗しました',
      sendScheduled: 'メールは5秒後に送信されます',
      sendUndoAction: '取り消す',
      sendCancelled: '送信を取り消しました',
      archiveSuccess: 'メールをアーカイブしました',
      archiveFailed: 'メールをアーカイブできませんでした',
      archiveAction: 'アーカイブ',
    };
  }

  if (appLanguage === 'en') {
    return {
      shareSuccess: 'Screenshot copied to clipboard',
      shareFailed: 'This email could not be copied as a screenshot',
      aiNeedApiKey: 'Please configure an AI API key in Settings first',
      aiNoEligibleShort: 'No unread uncategorized emails need analysis',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Started analyzing ${total} emails (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analyzing ${processed}/${total} emails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI analysis finished: scanned ${total}, categorized ${classified}${failed > 0 ? `, failed ${failed}` : ''}${unclassified > 0 ? `, uncategorized ${unclassified}` : ''}`,
      aiFailed: 'AI analysis failed',
      sendSuccess: 'Email sent',
      sendFailedFallback: 'Failed to send email',
      sendScheduled: 'Email will be sent in 5 seconds',
      sendUndoAction: 'Undo',
      sendCancelled: 'Send cancelled',
      archiveSuccess: 'Email archived',
      archiveFailed: 'Failed to archive email',
      archiveAction: 'Archive',
    };
  }

  if (appLanguage === 'ko') {
    return {
      shareSuccess: '스크린샷이 클립보드에 복사되었습니다',
      shareFailed: '이 메일은 스크린샷으로 복사할 수 없습니다',
      aiNeedApiKey: '먼저 설정에서 AI API 키를 입력하세요',
      aiNoEligibleShort: '분석할 미분류 메일이 없습니다',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `${total}개의 메일 분석 시작 (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `${processed}/${total}개 메일 분석 중 (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `AI 분석 완료: 스캔 ${total}개 / 분류 ${classified}개${failed > 0 ? ` / 실패 ${failed}개` : ''}${unclassified > 0 ? ` / 미분류 ${unclassified}개` : ''}`,
      aiFailed: 'AI 분석에 실패했습니다',
      sendSuccess: '메일을 보냈습니다',
      sendFailedFallback: '메일 전송에 실패했습니다',
      sendScheduled: '메일이 5초 후 전송됩니다',
      sendUndoAction: '실행 취소',
      sendCancelled: '전송을 취소했습니다',
      archiveSuccess: '메일을 보관했습니다',
      archiveFailed: '메일 보관에 실패했습니다',
      archiveAction: '보관',
    };
  }

  if (appLanguage === 'es') {
    return {
      shareSuccess: 'La captura se copió al portapapeles',
      shareFailed: 'Este correo no se puede copiar como captura',
      aiNeedApiKey: 'Configura primero una clave API de IA en Ajustes',
      aiNoEligibleShort: 'No hay correos sin clasificar para analizar',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Análisis iniciado para ${total} correos (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analizando ${processed}/${total} correos (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Análisis IA completado: escaneados ${total}, clasificados ${classified}${failed > 0 ? `, fallidos ${failed}` : ''}${unclassified > 0 ? `, sin clasificar ${unclassified}` : ''}`,
      aiFailed: 'El análisis de IA falló',
      sendSuccess: 'Correo enviado',
      sendFailedFallback: 'No se pudo enviar el correo',
      sendScheduled: 'El correo se enviará en 5 segundos',
      sendUndoAction: 'Deshacer',
      sendCancelled: 'Envío cancelado',
      archiveSuccess: 'Correo archivado',
      archiveFailed: 'No se pudo archivar el correo',
      archiveAction: 'Archivar',
    };
  }

  if (appLanguage === 'fr') {
    return {
      shareSuccess: 'Capture copiée dans le presse-papiers',
      shareFailed: 'Ce mail ne peut pas être copié en capture',
      aiNeedApiKey: 'Veuillez d’abord configurer une clé API IA dans les réglages',
      aiNoEligibleShort: 'Aucun mail non classé à analyser',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Analyse lancée pour ${total} mails (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analyse de ${processed}/${total} mails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Analyse IA terminée : ${total} scannés, ${classified} classés${failed > 0 ? `, ${failed} échecs` : ''}${unclassified > 0 ? `, ${unclassified} non classés` : ''}`,
      aiFailed: 'Échec de l’analyse IA',
      sendSuccess: 'Mail envoyé',
      sendFailedFallback: 'Échec de l’envoi du mail',
      sendScheduled: 'Le mail sera envoyé dans 5 secondes',
      sendUndoAction: 'Annuler',
      sendCancelled: 'Envoi annulé',
      archiveSuccess: 'Mail archivé',
      archiveFailed: 'Échec de l’archivage du mail',
      archiveAction: 'Archiver',
    };
  }

  if (appLanguage === 'de') {
    return {
      shareSuccess: 'Screenshot in die Zwischenablage kopiert',
      shareFailed: 'Diese Mail konnte nicht als Screenshot kopiert werden',
      aiNeedApiKey: 'Bitte zuerst einen KI-API-Schlüssel in den Einstellungen hinterlegen',
      aiNoEligibleShort: 'Keine unklassifizierten Mails zur Analyse',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Analyse für ${total} Mails gestartet (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Analysiere ${processed}/${total} Mails (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `KI-Analyse fertig: ${total} gescannt, ${classified} klassifiziert${failed > 0 ? `, ${failed} fehlgeschlagen` : ''}${unclassified > 0 ? `, ${unclassified} unklassifiziert` : ''}`,
      aiFailed: 'KI-Analyse fehlgeschlagen',
      sendSuccess: 'Mail gesendet',
      sendFailedFallback: 'Mail konnte nicht gesendet werden',
      sendScheduled: 'Mail wird in 5 Sekunden gesendet',
      sendUndoAction: 'Rückgängig',
      sendCancelled: 'Senden abgebrochen',
      archiveSuccess: 'Mail archiviert',
      archiveFailed: 'Mail konnte nicht archiviert werden',
      archiveAction: 'Archivieren',
    };
  }

  if (appLanguage === 'ru') {
    return {
      shareSuccess: 'Снимок письма скопирован в буфер обмена',
      shareFailed: 'Это письмо не удалось скопировать как снимок',
      aiNeedApiKey: 'Сначала укажите API-ключ ИИ в настройках',
      aiNoEligibleShort: 'Нет писем без категории для анализа',
      aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
        `Запущен анализ ${total} писем (${scanLabel}, ${rangeLabel})`,
      aiProgress: (processed: number, total: number, scanLabel: string) =>
        `Анализ ${processed}/${total} писем (${scanLabel})`,
      aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
        `Анализ ИИ завершён: проверено ${total}, классифицировано ${classified}${failed > 0 ? `, ошибок ${failed}` : ''}${unclassified > 0 ? `, без категории ${unclassified}` : ''}`,
      aiFailed: 'Ошибка анализа ИИ',
      sendSuccess: 'Письмо отправлено',
      sendFailedFallback: 'Не удалось отправить письмо',
      sendScheduled: 'Письмо будет отправлено через 5 секунд',
      sendUndoAction: 'Отменить',
      sendCancelled: 'Отправка отменена',
      archiveSuccess: 'Письмо архивировано',
      archiveFailed: 'Не удалось архивировать письмо',
      archiveAction: 'Архивировать',
    };
  }

  return {
    shareSuccess: '长截图已复制，可直接粘贴发送',
    shareFailed: '该邮件无法截图复制',
    aiNeedApiKey: '请先在设置中配置 AI API Key',
    aiNoEligibleShort: '没有需要分析的未分类邮件',
    aiStarted: (total: number, scanLabel: string, rangeLabel: string) =>
      `开始分析 ${total} 封邮件（${scanLabel}，${rangeLabel}）`,
    aiProgress: (processed: number, total: number, scanLabel: string) =>
      `正在分析 ${processed}/${total} 封邮件（${scanLabel}）`,
    aiFinished: (total: number, classified: number, failed: number, unclassified: number) =>
      `AI 分析完成：已扫描 ${total} 封，已分类 ${classified} 封${failed > 0 ? `，未识别 ${failed} 封` : ''}${unclassified > 0 ? `，未分类 ${unclassified} 封` : ''}`,
    aiFailed: 'AI 分析异常，请稍后重试',
    sendSuccess: '发送成功',
    sendFailedFallback: '发送失败',
    sendScheduled: '邮件将在 5 秒后发送',
    sendUndoAction: '撤销',
    sendCancelled: '已撤销发送',
    archiveSuccess: '已归档邮件',
    archiveFailed: '归档失败',
    archiveAction: '归档',
  };
}

function App() {
  const { t, i18n } = useTranslation();
  const isMacOS = useMemo(() => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform), []);
  const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
  const [selectedEmail, setSelectedEmail] = useState<RendererMailSummary | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: 'new', source: null });
  const [composeRestoreDraft, setComposeRestoreDraft] = useState<ComposeRestoreDraft | null>(null);
  const [composeSessionId, setComposeSessionId] = useState(0);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isMobile, setIsMobile] = useState(false);
  const [mailListWidth, setMailListWidth] = useState(456);
  const [isResizingMailList, setIsResizingMailList] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('zh');
  const [aiAutoSort, setAiAutoSort] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<ScanMode>('smart');
  const [aiLookback, setAiLookback] = useState<LookbackRange>('7d');
  const [aiPrivacyMode, setAiPrivacyMode] = useState<AiPrivacyMode>('cloud_redacted');
  const [mailFetchHistoryRange, setMailFetchHistoryRange] = useState<MailHistoryRange>('1mo');
  const [mailCacheRange, setMailCacheRange] = useState<MailCacheRange>('1mo');
  const [stagedHistorySync, setStagedHistorySync] = useState<StagedHistoryUiState>(() => createEmptyStagedHistorySyncState());
  const [autoFetchMinutes, setAutoFetchMinutes] = useState(0);
  const [githubNotificationsViewEnabled, setGithubNotificationsViewEnabled] = useState(true);
  const [isAutoAnalysisReady, setIsAutoAnalysisReady] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<CurrentAccount | 'all' | null>('all');
  const [replySuggestion, setReplySuggestion] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [accountFoldersById, setAccountFoldersById] = useState<Record<number, MailFolderInfo[]>>({});
  const [isViewHydrating, setIsViewHydrating] = useState(false);
  const [localThreadMails, setLocalThreadMails] = useState<RendererMailSummary[]>([]);
  const [localComposeDrafts, setLocalComposeDrafts] = useState<ComposeDraftOption[]>([]);
  const [deletedComposeDraftTokens, setDeletedComposeDraftTokens] = useState<string[]>([]);
  const [backupState, setBackupState] = useState<BackupUiState>(() => createInitialBackupState());
  const [mailRoutingResults, setMailRoutingResults] = useState<MailRoutingResultEntry[]>([]);

  const addAccountDialogRef = useRef<AddAccountDialogHandle>(null);
  const refreshPending = useRef(false);
  const initialHydrationDoneRef = useRef(false);
  const autoSyncedViewsRef = useRef(new Set<string>());
  const aiLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressToastId = useRef<string>('');
  const mailSettingsMutationRef = useRef(0);
  const mailSettingsSyncInFlightRef = useRef(false);
  const previousAutoSyncViewKeyRef = useRef<string | null>(null);
  const aiAutoSortRef = useRef(aiAutoSort);
  const isAiClassifyingRef = useRef(false);
  const mailListResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const runBatchAnalysisRef = useRef<(() => Promise<void>) | null>(null);
  const knownAutoAnalyzedIdsRef = useRef(new Set<string>());
  const scheduledSendTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeScheduledSendsRef = useRef(new Set<string>());
  const staleScheduledSendIdsRef = useRef(new Set<string>());
  const autoAnalysisBaselineEstablishedRef = useRef(false);
  const appLanguageHydratedRef = useRef(false);
  const accountFoldersFetchedAtRef = useRef(new Map<number, number>());
  const accountFoldersInFlightRef = useRef(new Map<number, Promise<MailFolderInfo[]>>());

  const {
    isSyncing,
    syncMails,
    mailList,
    setMailList,
    currentMail,
    setCurrentMail,
    fetchMailDetail,
    loadMailBody,
    preloadMailBodies,
    mailLoadingState,
    mailError,
    clearCurrentMail,
    clearBodyCacheEntry,
  } = useMail();

  const [isAiClassifying, setIsAiClassifying] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const startMailListResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    mailListResizeRef.current = { startX: event.clientX, startWidth: mailListWidth };
    setIsResizingMailList(true);
    event.preventDefault();
  }, [isMobile, mailListWidth]);

  useEffect(() => {
    if (!isResizingMailList) return;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = mailListResizeRef.current;
      if (!resizeState) return;
      const nextWidth = Math.min(620, Math.max(360, resizeState.startWidth + (event.clientX - resizeState.startX)));
      setMailListWidth(nextWidth);
    };

    const stopResize = () => {
      mailListResizeRef.current = null;
      setIsResizingMailList(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResize);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizingMailList]);

  useEffect(() => {
    aiAutoSortRef.current = aiAutoSort;
    if (!aiAutoSort) {
      autoAnalysisBaselineEstablishedRef.current = false;
    }
  }, [aiAutoSort]);

  useEffect(() => {
    isAiClassifyingRef.current = isAiClassifying;
  }, [isAiClassifying]);

  const effectiveAiTargetLanguage = useMemo(
    () => getAiLanguageFromAppLanguage(appLanguage),
    [appLanguage]
  );

  const appUi = useMemo(() => getAppUi(appLanguage), [appLanguage]);
  const stagedHistoryLabel = useMemo(() => {
    if (!stagedHistorySync.active || !stagedHistorySync.stageRange) {
      return null;
    }
    return formatStagedHistoryLabel(stagedHistorySync.stageRange, appLanguage);
  }, [appLanguage, stagedHistorySync.active, stagedHistorySync.stageRange]);

  useEffect(() => {
    void (async () => {
      try {
        const appLanguageRes = await window.electronAPI.invoke('settings:get', APP_LANGUAGE_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        const res = await window.electronAPI.invoke('ai:getSettings') as {
          success: boolean;
          data?: { autoSort: boolean; scanMode: ScanMode; lookback: LookbackRange; privacyMode: AiPrivacyMode };
        };
        if (appLanguageRes.success && appLanguageRes.data) {
          const normalized = appLanguageRes.data as AppLanguage;
          setAppLanguage(normalized);
        }
        if (res.success && res.data) {
          setAiAutoSort(res.data.autoSort);
          setAiScanMode(res.data.scanMode);
          setAiLookback(res.data.lookback);
          setAiPrivacyMode(res.data.privacyMode);
        }
        const intervalRes = await window.electronAPI.invoke('settings:get', MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        const historyRes = await window.electronAPI.invoke('settings:get', MAIL_FETCH_HISTORY_RANGE_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        const cacheRangeRes = await window.electronAPI.invoke('settings:get', MAIL_CACHE_RANGE_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        const githubViewRes = await window.electronAPI.invoke('settings:get', GITHUB_NOTIFICATIONS_VIEW_ENABLED_SETTING_KEY) as {
          success: boolean;
          data?: string | null;
        };
        if (intervalRes.success || historyRes.success || cacheRangeRes.success || githubViewRes.success) {
          const snapshot = normalizeMailSettingsSnapshot({
            mailAutoFetchIntervalMinutes: intervalRes.success ? intervalRes.data ?? null : null,
            mailFetchHistoryRange: historyRes.success ? historyRes.data ?? null : null,
            mailCacheRange: cacheRangeRes.success ? cacheRangeRes.data ?? null : null,
            githubNotificationsViewEnabled: githubViewRes.success ? githubViewRes.data ?? null : null,
          });
          setAutoFetchMinutes(snapshot.mailAutoFetchIntervalMinutes);
          setMailFetchHistoryRange(snapshot.mailFetchHistoryRange);
          setMailCacheRange(snapshot.mailCacheRange);
          setGithubNotificationsViewEnabled(snapshot.githubNotificationsViewEnabled);
        }
      } catch (err) {
        console.error('[ai:getSettings]', err);
      } finally {
        appLanguageHydratedRef.current = true;
      }
    })();
  }, []);

  const { accounts, fetchAccounts, createAccount, deleteAccount: deleteAccountApi } = useAccounts();

  const accountList = useMemo(
    () => accounts.map((account) => ({
      id: account.id,
      email: account.email,
      name: account.display_name || account.email.split('@')[0],
      avatar: getAccountAvatar(account.email),
    })),
    [accounts]
  );

  const scopedAccounts = useMemo(() => {
    if (currentAccount === null) return [];
    if (currentAccount === 'all') return accounts;
    return accounts.filter((account) => account.id === currentAccount.id);
  }, [accounts, currentAccount]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    setCurrentAccount((prev) => resolveActiveAccountAfterAccountsRefresh(accountList, prev));
  }, [accountList]);

  useEffect(() => {
    const activeAccountIds = new Set(accounts.map((account) => account.id));

    setMailList((prev) => prev.filter((mail) => activeAccountIds.has(mail.accountId)));
    setLocalThreadMails((prev) => prev.filter((mail) => activeAccountIds.has(mail.accountId)));
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const accountId = Number(id.split(':')[0]);
        return Number.isFinite(accountId) && activeAccountIds.has(accountId);
      })
    );
    setCurrentMail((prev) => (prev && !activeAccountIds.has(prev.accountId) ? null : prev));
    setSelectedEmail((prev) => {
      if (!prev || activeAccountIds.has(prev.accountId)) return prev;
      clearCurrentMail();
      return null;
    });
  }, [accounts, clearCurrentMail, setCurrentMail, setMailList]);

  useEffect(() => {
    const validMailIds = new Set([...mailList, ...localThreadMails].map((mail) => mail.id));
    setMailRoutingResults((prev) => prev.filter((entry) => validMailIds.has(entry.id)));
  }, [localThreadMails, mailList]);

  useEffect(() => {
    if (accounts.length === 0) {
      setLocalComposeDrafts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await window.electronAPI.invoke('mail:loadLocalDrafts') as {
          success: boolean;
          data?: RendererMailSummary[];
          error?: string;
        };
        if (cancelled || !response.success || !response.data) return;

        const deletedTokens = new Set(deletedComposeDraftTokens);
        const drafts = response.data
          .filter((mail) => accounts.some((account) => account.id === mail.accountId))
          .filter((mail) => !matchesComposeDraftToken(mail, deletedTokens))
          .map((mail) => buildComposeDraftOptionFromMail(mail))
          .filter((draft): draft is ComposeDraftOption => Boolean(draft));

        setLocalComposeDrafts((prev) => {
          const byId = new Map<string, ComposeDraftOption>();
          for (const draft of drafts) byId.set(draft.id, draft);
          for (const draft of prev) {
            if (!matchesComposeDraftToken({
              id: draft.id,
              localDraftKey: draft.draftKey,
              messageId: draft.messageId,
            }, deletedTokens)) {
              byId.set(draft.id, draft);
            }
          }
          return Array.from(byId.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
        });
      } catch (error) {
        console.error('[mail:loadLocalDrafts]', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts, deletedComposeDraftTokens]);

  useEffect(() => {
    setBackupState((prev) => {
      if (accounts.length === 0) {
        return { ...prev, selectedAccountId: null, selectedFolderPaths: [] };
      }

      if (prev.selectedAccountId && accounts.some((account) => account.id === prev.selectedAccountId)) {
        return prev;
      }

      return {
        ...prev,
        selectedAccountId: currentAccount && currentAccount !== 'all' ? currentAccount.id : accounts[0].id,
        selectedFolderPaths: [],
      };
    });
  }, [accounts, currentAccount]);

  const loadAccountFolders = useCallback(async (accountId: number, force = false): Promise<MailFolderInfo[]> => {
    const now = Date.now();
    const cached = accountFoldersById[accountId];
    const fetchedAt = accountFoldersFetchedAtRef.current.get(accountId) ?? 0;
    if (!force && cached && now - fetchedAt < ACCOUNT_FOLDERS_CACHE_TTL_MS) {
      return cached;
    }

    const inFlight = accountFoldersInFlightRef.current.get(accountId);
    if (!force && inFlight) {
      return inFlight;
    }

    const request = (async () => {
      const res = await window.electronAPI.invoke('mail:getFolders', accountId) as {
        success: boolean;
        data?: MailFolderInfo[];
      };
      if (!res.success || !res.data) {
        return cached ?? [];
      }

      accountFoldersFetchedAtRef.current.set(accountId, Date.now());
      setAccountFoldersById((prev) => ({ ...prev, [accountId]: res.data! }));
      return res.data;
    })().finally(() => {
      if (accountFoldersInFlightRef.current.get(accountId) === request) {
        accountFoldersInFlightRef.current.delete(accountId);
      }
    });

    accountFoldersInFlightRef.current.set(accountId, request);
    return request;
  }, [accountFoldersById]);

  useEffect(() => {
    if (!showSettings || !backupState.selectedAccountId) return;

    void (async () => {
      try {
        await loadAccountFolders(backupState.selectedAccountId!);
      } catch (err) {
        console.error('[mail:getFolders settings]', backupState.selectedAccountId, err);
      }
    })();
  }, [backupState.selectedAccountId, loadAccountFolders, showSettings]);

  useEffect(() => {
    const electronApi = window.electronAPI as typeof window.electronAPI & {
      onOpenSettings?: (callback: () => void) => () => void;
    };
    return electronApi.onOpenSettings?.(() => setShowSettings(true));
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBackupProgress((progress: MailBackupProgress) => {
      setBackupState((prev) => {
        if (prev.taskId && progress.taskId !== prev.taskId) {
          return prev;
        }

        return {
          ...prev,
          taskId: progress.taskId,
          isRunning: !progress.cancelled && progress.stage !== 'finalizing',
          progress,
        };
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!stagedHistorySync.active && stagedHistorySync.accountId === null && stagedHistorySync.folder === null) {
      return;
    }
    setStagedHistorySync(createEmptyStagedHistorySyncState());
  }, [currentAccount, selectedFolder]);

  useEffect(() => {
    if (selectedFolder === 'sent') {
      setSelectedFolder('inbox');
    }
  }, [selectedFolder]);

  useEffect(() => {
    if (!githubNotificationsViewEnabled && (selectedFolder === 'github' || isGitHubSmartFolderId(selectedFolder))) {
      setSelectedFolder('inbox');
    }
  }, [githubNotificationsViewEnabled, selectedFolder]);

  const replaceFolderEntries = useCallback((
    prev: RendererMailSummary[],
    accountId: number,
    genericFolder: StandardFolderId,
    nextMails: RendererMailSummary[]
  ) => {
    const others = prev.filter((mail) => !(mail.accountId === accountId && folderMatches(mail.folder, genericFolder)));
    return [...others, ...nextMails];
  }, []);

  const getResolvedFolderPath = useCallback((accountId: number, folder: StandardFolderId) => {
    return resolveFolderPath(accountFoldersById[accountId], folder);
  }, [accountFoldersById]);

  const loadCachedForCurrentView = useCallback(async () => {
    const foldersToLoad = getSyncFoldersForView(selectedFolder);
    if (foldersToLoad.length === 0 || scopedAccounts.length === 0) {
      setIsViewHydrating(false);
      if (!initialHydrationDoneRef.current) {
        initialHydrationDoneRef.current = true;
        setIsAutoAnalysisReady(true);
      }
      return 0;
    }

    setIsViewHydrating(true);
    let loadedCount = 0;

    for (const account of scopedAccounts) {
      for (const folder of foldersToLoad) {
        try {
          const folderPath = getResolvedFolderPath(account.id, folder);
          const res = await window.electronAPI.invoke('mail:loadCached', account.id, folderPath, mailFetchHistoryRange) as {
            success: boolean;
            data?: RendererMailSummary[];
          };
          const cached = res.success && res.data ? res.data : [];
          loadedCount += cached.length;
          setMailList((prev) => replaceFolderEntries(prev, account.id, folder, cached));
        } catch (err) {
          console.error('[mail:loadCached]', account.id, folder, err);
          setMailList((prev) => replaceFolderEntries(prev, account.id, folder, []));
        }
      }
    }

    setIsViewHydrating(false);

    if (!initialHydrationDoneRef.current) {
      initialHydrationDoneRef.current = true;
      setIsAutoAnalysisReady(true);
    }

    return loadedCount;
  }, [getResolvedFolderPath, mailFetchHistoryRange, replaceFolderEntries, scopedAccounts, selectedFolder, setMailList]);

  const reloadCurrentViewForHistoryRange = useCallback(async (range: MailHistoryRange) => {
    const foldersToLoad = getSyncFoldersForView(selectedFolder);
    for (const account of scopedAccounts) {
      for (const folder of foldersToLoad) {
        try {
          const folderPath = getResolvedFolderPath(account.id, folder);
          const cachedResp = await window.electronAPI.invoke('mail:loadCached', account.id, folderPath, range) as {
            success: boolean;
            data?: RendererMailSummary[];
          };
          setMailList((prev) => replaceFolderEntries(
            prev,
            account.id,
            folder,
            cachedResp.success && cachedResp.data ? cachedResp.data : [],
          ));
        } catch (err) {
          console.error('[mail:loadCached reloadCurrentViewForHistoryRange]', account.id, folder, err);
        }
      }
    }
  }, [getResolvedFolderPath, replaceFolderEntries, scopedAccounts, selectedFolder, setMailList]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMailStagedSyncProgress((progress) => {
      const accountMatches = currentAccount === 'all' || (currentAccount !== null && progress.accountId === currentAccount.id);
      const folderMatchesView = getSyncFoldersForView(selectedFolder).some((folder) => folderMatches(progress.folder, folder));
      if (!accountMatches || !folderMatchesView) {
        return;
      }

      setStagedHistorySync({
        active: !progress.done,
        stageRange: progress.stageRange,
        stageIndex: progress.stageIndex,
        totalStages: progress.totalStages,
        accountId: progress.accountId,
        folder: progress.folder,
      });

      void reloadCurrentViewForHistoryRange(mailFetchHistoryRange);
    });

    return unsubscribe;
  }, [currentAccount, mailFetchHistoryRange, reloadCurrentViewForHistoryRange, selectedFolder]);

  const resolveFolderPathForAction = useCallback(async (accountId: number, folder: StandardFolderId) => {
    const currentFolders = accountFoldersById[accountId];
    const initialPath = resolveFolderPath(currentFolders, folder);
    if ((currentFolders?.length ?? 0) > 0 || folder === 'inbox' || initialPath !== folder) {
      return initialPath;
    }

    try {
      const folders = await loadAccountFolders(accountId);
      if (folders.length > 0) return resolveFolderPath(folders, folder);
    } catch (err) {
      console.error('[mail:getFolders resolveFolderPathForAction]', accountId, folder, err);
    }

    return initialPath;
  }, [accountFoldersById, loadAccountFolders]);

  useEffect(() => {
    let active = true;
    const wasInitialHydration = !initialHydrationDoneRef.current;
    const viewKey = `${currentAccount === null ? 'none' : currentAccount === 'all' ? 'all' : currentAccount.id}:${selectedFolder}`;

    void (async () => {
      const loadedCount = await loadCachedForCurrentView();
      if (!active) return;
      const shouldSyncCurrentView = shouldAutoSyncView({
        previousViewKey: previousAutoSyncViewKeyRef.current,
        nextViewKey: viewKey,
        loadedCount,
        wasInitialHydration,
        syncInFlight: mailSettingsSyncInFlightRef.current,
      });
      previousAutoSyncViewKeyRef.current = viewKey;

      if (
        getSyncFoldersForView(selectedFolder).length > 0 &&
        shouldSyncCurrentView &&
        scopedAccounts.length > 0
      ) {
        if (!autoSyncedViewsRef.current.has(viewKey)) {
          autoSyncedViewsRef.current.add(viewKey);
          void (async () => {
            for (const account of scopedAccounts) {
              for (const folder of getSyncFoldersForView(selectedFolder)) {
                const folderPath = await resolveFolderPathForAction(account.id, folder);
                await syncMails(account.id, folderPath, {
                  notify: folder === 'inbox',
                  folderKind: folder === 'inbox' ? 'inbox' : 'other',
                  historyRange: mailFetchHistoryRange,
                });
              }
            }
          })();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [currentAccount, loadCachedForCurrentView, mailFetchHistoryRange, resolveFolderPathForAction, scopedAccounts, selectedFolder, syncMails]);

  const folderUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      trash: 0,
      spam: 0,
    };

    for (const mail of mailList) {
      if (currentAccount !== 'all' && currentAccount !== null && mail.accountId !== currentAccount.id) continue;
      if (!mail.isRead) {
        for (const folder of STANDARD_FOLDERS) {
          if (folderMatches(mail.folder, folder)) {
            counts[folder] += 1;
            break;
          }
        }
      }
    }

    return counts;
  }, [currentAccount, mailList]);

  const nonDraftMailList = useMemo(
    () => mailList.filter((mail) => !isUnsentDraftMail(mail)),
    [mailList]
  );

  const nonDraftLocalThreadMails = useMemo(
    () => localThreadMails.filter((mail) => !isUnsentDraftMail(mail)),
    [localThreadMails]
  );

  const isAiCategoryView = useMemo(() => AI_CATEGORY_IDS.includes(selectedFolder), [selectedFolder]);
  const isGitHubSmartFolderView = useMemo(() => isGitHubSmartFolderId(selectedFolder), [selectedFolder]);
  const isPriorityFolderView = useMemo(() => isPriorityFolderId(selectedFolder), [selectedFolder]);

  const mailListViewModel = useMemo(
    () => buildMailListViewModel({
      selectedFolder,
      currentAccount,
      accounts,
      nonDraftMailList,
      nonDraftLocalThreadMails,
      mailRoutingResults,
      githubNotificationsViewEnabled,
      aiCategoryIds: AI_CATEGORY_IDS,
    }),
    [
      accounts,
      currentAccount,
      githubNotificationsViewEnabled,
      mailRoutingResults,
      nonDraftLocalThreadMails,
      nonDraftMailList,
      selectedFolder,
    ]
  );

  const {
    threadMailUniverse,
    scopedThreadMailUniverse,
    conversationAccountEmails,
    unreadConversationCount,
    mailRoutingAdapter,
    githubFolderCounts,
    priorityFolderCounts,
    categorySourceEmails,
    folderEmails,
    githubConversationCount,
  } = mailListViewModel;

  useEffect(() => {
    i18n.changeLanguage(appLanguage);
  }, [appLanguage, i18n]);

  useEffect(() => {
    if (!appLanguageHydratedRef.current) return;
    void (async () => {
      try {
        await window.electronAPI.invoke('settings:set', APP_LANGUAGE_SETTING_KEY, appLanguage);
        await window.electronAPI.invoke('app:set-language', appLanguage);
      } catch (err) {
        console.error(`[settings:set ${APP_LANGUAGE_SETTING_KEY}]`, err);
      }
    })();
  }, [appLanguage]);

  useEffect(() => {
    if (!selectedEmail) return;
    if (selectedFolder === 'unread') return;
    if (folderEmails.some((mail) => mail.id === selectedEmail.id)) return;
    const replacement = folderEmails.find((mail) => {
      if (mail.accountId !== selectedEmail.accountId) return false;
      if (isAiCategoryView) {
        return buildClassifiedConversationKey(mail, conversationAccountEmails) ===
          buildClassifiedConversationKey(selectedEmail, conversationAccountEmails);
      }
      return getConversationCounterparty(mail, conversationAccountEmails) ===
        getConversationCounterparty(selectedEmail, conversationAccountEmails);
    });
    if (replacement) {
      setSelectedEmail(replacement);
      return;
    }
    setSelectedEmail(null);
    clearCurrentMail();
  }, [clearCurrentMail, conversationAccountEmails, folderEmails, isAiCategoryView, selectedEmail, selectedFolder]);

  const displayedMail = useMemo(
    () => resolveDisplayedMail(selectedEmail, currentMail),
    [currentMail, selectedEmail]
  );

  const selectedMailForThread = displayedMail as RendererMailSummary | null;

  const conversationMessages = useMemo(() => {
    if (!selectedMailForThread) return [];
    const threadSource = (isGitHubSmartFolderView || isPriorityFolderView)
      ? filterMailsForRoutingFolder(threadMailUniverse, mailRoutingAdapter, selectedFolder as MailRoutingFolderId)
      : threadMailUniverse;
    const selectedIsDraft = isUnsentDraftMail(selectedMailForThread);
    const safeThreadSource = selectedIsDraft
      ? threadSource
      : threadSource.filter((mail) => !isUnsentDraftMail(mail));
    const siblings = isAiCategoryView
      ? findClassifiedConversationMails(selectedMailForThread, safeThreadSource, conversationAccountEmails)
      : findSenderConversationMails(selectedMailForThread, safeThreadSource, conversationAccountEmails);
    return [selectedMailForThread, ...siblings]
      .filter((mail) => selectedIsDraft || !isUnsentDraftMail(mail))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .filter((mail, index, arr) => arr.findIndex((candidate) => candidate.id === mail.id) === index);
  }, [
    conversationAccountEmails,
    isAiCategoryView,
    isGitHubSmartFolderView,
    isPriorityFolderView,
    mailRoutingAdapter,
    selectedFolder,
    selectedMailForThread,
    threadMailUniverse,
  ]);

  const visibleRoutingResults = useMemo(() => {
    if (conversationMessages.length === 0 || mailRoutingResults.length === 0) return [];
    const visibleIds = new Set(conversationMessages.map((mail) => mail.id));
    return mailRoutingResults.filter((entry) => visibleIds.has(entry.id));
  }, [conversationMessages, mailRoutingResults]);

  const githubPriorityById = useMemo(() => Object.fromEntries(
    mailRoutingResults
      .filter((entry) => entry.routing.kind === 'github')
      .map((entry) => [
        entry.id,
        getGitHubPriorityBadgeInfo(
          entry.routing.github.priority_level,
          appLanguage,
          entry.routing.github.priority.friendlyText,
          entry.routing.github.safe_summary,
        ),
      ])
  ), [appLanguage, mailRoutingResults]);

  const routingDiagnostics = useMemo(
    () => buildMailRoutingDiagnosticsMap({
      routingResults: visibleRoutingResults,
      routingAdapter: mailRoutingAdapter,
      contextFolder: selectedFolder,
      appLanguage,
    }),
    [appLanguage, mailRoutingAdapter, selectedFolder, visibleRoutingResults]
  );

  const applyScanResultsToState = useCallback((
    results: Array<{ id: string; category: string }>,
    routingEntries: MailRoutingResultEntry[],
  ) => {
    if (results.length === 0) return;

    const categoryMap = new Map(results.map((result) => [result.id, result.category]));
    const scanResultMap = new Map(
      routingEntries.map((entry) => [entry.id, entry.routing.smart_folder?.folder ?? undefined])
    );

    const applyToMail = <T extends RendererMailSummary>(mail: T): T => {
      if (!categoryMap.has(mail.id)) return mail;
      return {
        ...mail,
        category: categoryMap.get(mail.id),
        isScanned: true,
        scanResult: scanResultMap.get(mail.id) ?? categoryMap.get(mail.id),
      };
    };

    setMailList((prev) => prev.map(applyToMail));
    setLocalThreadMails((prev) => prev.map(applyToMail));
    setSelectedEmail((prev) => (prev ? applyToMail(prev) : prev));
    setCurrentMail((prev) => (prev ? applyToMail(prev) : prev));
  }, []);

  const bodyPrefetchHistoryRange = useMemo(
    () => (stagedHistorySync.active ? stagedHistorySync.stageRange : mailFetchHistoryRange),
    [mailFetchHistoryRange, stagedHistorySync.active, stagedHistorySync.stageRange]
  );

  const folderBodyPrefetchCandidates = useMemo(
    () => pickBodyPrefetchCandidates(folderEmails, {
      historyRange: bodyPrefetchHistoryRange,
      cacheRange: mailCacheRange,
      limit: FOLDER_BODY_PREFETCH_LIMIT,
    }),
    [bodyPrefetchHistoryRange, folderEmails, mailCacheRange]
  );

  const conversationBodyPrefetchCandidates = useMemo(
    () => pickBodyPrefetchCandidates(conversationMessages, {
      historyRange: bodyPrefetchHistoryRange,
      cacheRange: mailCacheRange,
      limit: CONVERSATION_BODY_PREFETCH_LIMIT,
    }),
    [bodyPrefetchHistoryRange, conversationMessages, mailCacheRange]
  );

  useEffect(() => {
    if (folderBodyPrefetchCandidates.length === 0) return;
    void preloadMailBodies(folderBodyPrefetchCandidates, FOLDER_BODY_PREFETCH_LIMIT);
  }, [folderBodyPrefetchCandidates, preloadMailBodies]);

  useEffect(() => {
    if (conversationBodyPrefetchCandidates.length === 0) return;
    void preloadMailBodies(conversationBodyPrefetchCandidates, CONVERSATION_BODY_PREFETCH_LIMIT);
  }, [conversationBodyPrefetchCandidates, preloadMailBodies]);

  const serverMailIdentitySet = useMemo(
    () => buildServerMailIdentitySet(mailList),
    [mailList]
  );

  useEffect(() => {
    setLocalThreadMails((prev) => filterOutPersistedLocalThreadMails(prev, serverMailIdentitySet));
  }, [serverMailIdentitySet]);

  const fetchMails = useCallback(async (options?: { manual?: boolean; forceHistoryRange?: boolean }): Promise<void> => {
    const foldersToSync = getSyncFoldersForView(selectedFolder);
    if (foldersToSync.length === 0) return;
    if (mailSettingsSyncInFlightRef.current) return;
    if (currentAccount === null) return;

    if (currentAccount === 'all') {
      for (const account of accounts) {
        for (const folder of foldersToSync) {
          const folderPath = await resolveFolderPathForAction(account.id, folder);
          await syncMails(account.id, folderPath, {
            notify: folder === 'inbox',
            folderKind: folder === 'inbox' ? 'inbox' : 'other',
            historyRange: mailFetchHistoryRange,
            forceHistoryRange: options?.forceHistoryRange === true,
          });
        }
      }
      return;
    }

    for (const folder of foldersToSync) {
      const folderPath = await resolveFolderPathForAction(currentAccount.id, folder);
      await syncMails(currentAccount.id, folderPath, {
        notify: folder === 'inbox',
        folderKind: folder === 'inbox' ? 'inbox' : 'other',
        historyRange: mailFetchHistoryRange,
        forceHistoryRange: options?.forceHistoryRange === true,
      });
    }
  }, [accounts, currentAccount, mailFetchHistoryRange, resolveFolderPathForAction, selectedFolder, syncMails]);

  const handleRefresh = useCallback(async () => {
    if (isSyncing) {
      refreshPending.current = false;
      return;
    }

    setSelectedIds([]);
    setStagedHistorySync(createEmptyStagedHistorySyncState());
    refreshPending.current = false;
    await fetchMails({ manual: true });
  }, [fetchMails, isSyncing]);

  useEffect(() => {
    if (autoFetchMinutes <= 0) return;
    if (getSyncFoldersForView(selectedFolder).length === 0) return;
    if (!isAutoAnalysisReady) return;

    const timer = setInterval(() => {
      if (isSyncing || scopedAccounts.length === 0 || mailSettingsSyncInFlightRef.current) return;
      void fetchMails();
    }, autoFetchMinutes * 60 * 1000);

    return () => clearInterval(timer);
  }, [autoFetchMinutes, fetchMails, isAutoAnalysisReady, isSyncing, scopedAccounts.length, selectedFolder]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    return () => {
      for (const timer of scheduledSendTimersRef.current.values()) {
        clearTimeout(timer);
      }
      scheduledSendTimersRef.current.clear();
      activeScheduledSendsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const staleScheduled = mailList.filter((mail) => {
      const key = mail.localSendId || mail.id;
      return mail.deliveryState === 'scheduled'
        && !activeScheduledSendsRef.current.has(key)
        && !staleScheduledSendIdsRef.current.has(key);
    });

    if (staleScheduled.length === 0) return;

    for (const mail of staleScheduled) {
      const key = mail.localSendId || mail.id;
      staleScheduledSendIdsRef.current.add(key);
      const recoveredDraft = buildRecoveredDraftFromScheduledMail(
        mail,
        getResolvedFolderPath(mail.accountId, 'drafts'),
      );

      setMailList((prev) => {
        const filtered = prev.filter((item) => item.id !== mail.id && item.id !== recoveredDraft.id);
        return [recoveredDraft, ...filtered];
      });
      setLocalThreadMails((prev) => {
        const filtered = prev.filter((item) => item.id !== mail.id && item.id !== recoveredDraft.id);
        return [recoveredDraft, ...filtered];
      });
      const draftOption = buildComposeDraftOptionFromMail(recoveredDraft);
      if (draftOption) {
        setLocalComposeDrafts((prev) => {
          const filtered = prev.filter((draft) => draft.id !== draftOption.id && draft.draftKey !== draftOption.draftKey);
          return [draftOption, ...filtered];
        });
      }
      void window.electronAPI.invoke('mail:cacheLocal', {
        ...recoveredDraft,
        date: recoveredDraft.date.toISOString(),
        cachedAt: new Date().toISOString(),
        bodyText: recoveredDraft.bodyText,
        bodyHtml: recoveredDraft.bodyHtml,
      }).catch((err) => {
        console.error('[mail:cacheLocal stale scheduled recovered draft]', err);
      });
      void window.electronAPI.invoke('mail:deleteCachedById', mail.id).catch((err) => {
        console.error('[mail:deleteCachedById stale scheduled]', err);
      });
    }
  }, [getResolvedFolderPath, mailList, setMailList]);

  const sortedFolderEmails = useMemo(
    () => [...folderEmails].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [folderEmails]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const handleViewEmail = (email: RendererMailSummary) => {
    const accountExists = accounts.some((account) => account.id === email.accountId);
    if (!accountExists) {
      removeMailFromState(email);
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: 'This email belongs to a removed account and was cleared from the list.',
      }]);
      return;
    }

    setSelectedEmail(email);
    fetchMailDetail(email.accountId, email.uid, email.folder, email);
    if (shouldMarkMailReadOnOpen(email)) {
      applyReadUpdateToState(new Set([email.id]), true);
      void persistReadChange(email, true).catch((err) => {
        console.error('[handleViewEmail mark read]', err);
        applyReadUpdateToState(new Set([email.id]), false);
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: (err as Error).message || t('markAsRead'),
        }]);
      });
    }
    if (isMobile) setMobileView('detail');
  };

  const handleToggleSelect = (email: RendererMailSummary) => {
    setSelectedIds((prev) =>
      prev.includes(email.id) ? prev.filter((id) => id !== email.id) : [...prev, email.id]
    );
    setLastClickedId(email.id);
  };

  const handleSelectEmail = (email: RendererMailSummary, event?: React.MouseEvent) => {
    const isCtrl = event?.ctrlKey || event?.metaKey;
    const isShift = event?.shiftKey;

    if (isShift && lastClickedId) {
      const lastIdx = sortedFolderEmails.findIndex((item) => item.id === lastClickedId);
      const currentIdx = sortedFolderEmails.findIndex((item) => item.id === email.id);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const rangeIds = sortedFolderEmails.slice(start, end + 1).map((item) => item.id);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      }
    } else if (isCtrl) {
      setSelectedIds((prev) =>
        prev.includes(email.id) ? prev.filter((id) => id !== email.id) : [...prev, email.id]
      );
    } else {
      handleViewEmail(email);
    }

    setLastClickedId(email.id);
  };

  const handleSelectAll = () => {
    const allIds = sortedFolderEmails.map((mail) => mail.id);
    setSelectedIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const handleBackToList = () => {
    setMobileView('list');
    if (isMobile) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
  };

  const handleDeleteSelected = async (targetIdsInput?: string[]) => {
    const targetIdSet = new Set(targetIdsInput ?? selectedIds);
    const targets = mailList.filter((mail) => targetIdSet.has(mail.id));
    for (const mail of targets) {
      try {
        await handleDeleteForMail(mail);
      } catch (err) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: (err as Error).message || t('delete'),
        }]);
      }
    }
    setSelectedIds((prev) => prev.filter((id) => !targetIdSet.has(id)));
  };

  const handleMarkReadSelected = async (read: boolean, targetIdsInput?: string[]) => {
    const targetIds = new Set(targetIdsInput ?? selectedIds);
    const targets = mailList.filter((mail) => targetIds.has(mail.id));
    applyReadUpdateToState(targetIds, read);

    for (const mail of targets) {
      try {
        await persistReadChange(mail, read);
      } catch (err) {
        console.error('[markReadSelected]', err);
        applyReadUpdateToState(new Set([mail.id]), !read);
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: (err as Error).message || (read ? t('markAsRead') : t('markAsUnread')),
        }]);
      }
    }
  };

  const persistStarChange = useCallback(async (mail: RendererMailSummary, nextStarred: boolean) => {
    try {
      if (mail.messageId?.startsWith('<local-') || isLocalSenderMail(mail, conversationAccountEmails)) {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...mail,
          isStarred: nextStarred,
          date: mail.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });
        return;
      }
      await window.electronAPI.invoke('mail:setStarred', mail.accountId, mail.uid, nextStarred, mail.folder);
    } catch (err) {
      console.error('[mail:setStarred]', err);
    }
  }, [conversationAccountEmails]);

  const handleToggleStarForMail = useCallback(async (target: RendererMailSummary) => {
    const nextStarred = !target.isStarred;
    setMailList((prev) =>
      prev.map((mail) => (mail.id === target.id ? { ...mail, isStarred: nextStarred } : mail))
    );
    setLocalThreadMails((prev) =>
      prev.map((mail) => (mail.id === target.id ? { ...mail, isStarred: nextStarred } : mail))
    );
    if (currentMail && currentMail.id === target.id) {
      setCurrentMail({ ...currentMail, isStarred: nextStarred });
    }
    await persistStarChange(target, nextStarred);
  }, [currentMail, persistStarChange, setCurrentMail, setMailList]);

  const handleToggleStarSelected = async (targetIdsInput?: string[]) => {
    const targetIds = new Set(targetIdsInput ?? selectedIds);
    const targets = mailList.filter((mail) => targetIds.has(mail.id));
    const updates = targets.map(async (mail) => {
      const nextStarred = !mail.isStarred;
      await persistStarChange(mail, nextStarred);
      return { id: mail.id, nextStarred };
    });
    const results = await Promise.all(updates);
    const nextMap = new Map(results.map((item) => [item.id, item.nextStarred]));
    setMailList((prev) =>
      prev.map((mail) => (nextMap.has(mail.id) ? { ...mail, isStarred: nextMap.get(mail.id)! } : mail))
    );
    if (currentMail && nextMap.has(currentMail.id)) {
      setCurrentMail({ ...currentMail, isStarred: nextMap.get(currentMail.id)! });
    }
    setSelectedIds((prev) => prev.filter((id) => !targetIds.has(id)));
  };

  const handleArchiveSelected = async (targetIdsInput?: string[]) => {
    const targetIds = new Set(targetIdsInput ?? selectedIds);
    const targets = mailList.filter((mail) => targetIds.has(mail.id));
    for (const mail of targets) {
      await handleArchiveForMail(mail);
    }
    setSelectedIds((prev) => prev.filter((id) => !targetIds.has(id)));
  };

  const autoAnalysisEligibleMails = useMemo(() => {
    const lookbackDate = Date.now() - lookbackToMs(aiLookback);
    return nonDraftMailList.filter((mail) =>
      mail.date.getTime() > lookbackDate &&
      !mail.category &&
      !folderMatches(mail.folder, 'trash') &&
      !folderMatches(mail.folder, 'spam') &&
      !isLocalSenderMail(mail, conversationAccountEmails)
    );
  }, [aiLookback, conversationAccountEmails, nonDraftMailList]);

  const autoAnalysisEligibleIds = useMemo(
    () => autoAnalysisEligibleMails.map((mail) => mail.id),
    [autoAnalysisEligibleMails]
  );

  const runBatchAnalysis = useCallback(async () => {
    if (isAiClassifyingRef.current) return;
    if (nonDraftMailList.length === 0) return;

    setIsAiClassifying(true);

    try {
      const aiConfig = await window.electronAPI.invoke('ai:getConfig') as {
        success: boolean;
        data?: { hasApiKey: boolean };
      };
      if (!aiConfig.success || !aiConfig.data?.hasApiKey) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: appUi.aiNeedApiKey,
        }]);
        return;
      }

      const eligible = autoAnalysisEligibleMails;

      if (eligible.length === 0) {
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'info',
          message: appUi.aiNoEligibleShort,
        }]);
        return;
      }

      const rangeLabel = aiLookback;
      const scanLabel = aiScanMode === 'deep' ? 'deep' : 'light';
      const batchSize = aiScanMode === 'deep' ? 10 : 50;
      const total = eligible.length;

      setToasts((prev) => [...prev, {
        id: (progressToastId.current = Date.now().toString()),
        type: 'info',
        message: appUi.aiStarted(total, scanLabel, rangeLabel),
      }]);

      const allResults: Array<{ id: string; category: string }> = [];
      const collectedRoutingEntries: MailRoutingResultEntry[] = [];
      const failedBatchIds: string[] = [];
      let processed = 0;

      for (let i = 0; i < eligible.length; i += batchSize) {
        const batch = eligible.slice(i, i + batchSize);
        const deepBodyById = new Map<string, { bodyText?: string; bodyHtml?: string }>();

        if (aiScanMode === 'deep') {
          for (const mail of batch) {
            try {
              const bodyResult = await loadMailBody(mail.accountId, mail.uid, mail.folder);
              deepBodyById.set(mail.id, {
                bodyText: bodyResult.bodyText,
                bodyHtml: bodyResult.bodyHtml,
              });
            } catch {
            }
          }
        }

        const emailPayload = batch.map((mail) => ({
          id: mail.id,
          subject: mail.subject,
          from: mail.from,
          from_name: mail.fromName,
          has_attachment: mail.hasAttachments,
          body_text: aiScanMode === 'deep'
            ? (deepBodyById.get(mail.id)?.bodyText ||
              deepBodyById.get(mail.id)?.bodyHtml ||
              mail.snippet ||
              '')
            : undefined,
          snippet: mail.snippet,
        }));

        const response = await window.electronAPI.invoke('ai:classifyBatch', {
          emails: emailPayload,
          scanMode: aiScanMode,
        }) as BatchClassifyResponse;

        if (response.success && response.results) {
          if (response.routingResults?.length) {
            collectedRoutingEntries.push(...response.routingResults);
            setMailRoutingResults((prev) => {
              const merged = new Map(prev.map((entry) => [entry.id, entry]));
              for (const entry of response.routingResults ?? []) {
                merged.set(entry.id, entry);
              }
              return Array.from(merged.values());
            });
          }

          const githubRoutedIds = new Set(
            (response.routingResults ?? [])
              .filter((entry) => entry.routing.kind === 'github')
              .map((entry) => entry.id)
          );
          allResults.push(...response.results.filter((result) => !githubRoutedIds.has(result.id)));
          if (response.failedIds?.length) {
            failedBatchIds.push(...response.failedIds);
          }
        } else {
          failedBatchIds.push(...batch.map((mail) => mail.id));
        }

        processed += batch.length;
        setToasts((prev) =>
          prev.map((toast) =>
            toast.id === progressToastId.current
              ? { ...toast, message: appUi.aiProgress(processed, total, scanLabel) }
              : toast
          )
        );

        if (i + batchSize < total) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (allResults.length > 0) {
        const mergedRoutingEntries = Array.from(
          new Map(collectedRoutingEntries.map((entry) => [entry.id, entry])).values()
        );
        applyScanResultsToState(allResults, mergedRoutingEntries);
        const categoryMap = new Map(allResults.map((result) => [result.id, result.category]));
        const routingFolderMap = new Map(
          mergedRoutingEntries.map((entry) => [entry.id, entry.routing.smart_folder?.folder])
        );
        const categoryUpdates = eligible
          .filter((mail) => categoryMap.has(mail.id))
          .map((mail) => ({
            accountId: mail.accountId,
            uid: mail.uid,
            folder: mail.folder,
            category: categoryMap.get(mail.id)!,
            scanResult: routingFolderMap.get(mail.id) ?? categoryMap.get(mail.id)!,
          }));
        if (categoryUpdates.length > 0) {
          await window.electronAPI.invoke('mail:updateCategories', categoryUpdates);
        }
      }

      const classifiedIds = new Set(allResults.map((result) => result.id));
      const uniqueFailedIds = Array.from(new Set(failedBatchIds.filter((id) => !classifiedIds.has(id))));
      const unclassifiedCount = eligible.filter((mail) => !classifiedIds.has(mail.id)).length;

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: appUi.aiFinished(total, classifiedIds.size, uniqueFailedIds.length, unclassifiedCount),
      }]);
    } catch (err) {
      console.error('[runBatchAnalysis]', err);
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: appUi.aiFailed,
      }]);
    } finally {
      if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
      aiLockTimer.current = setTimeout(() => {
        setIsAiClassifying(false);
        aiLockTimer.current = null;
      }, 1000);
    }
  }, [aiScanMode, appUi, applyScanResultsToState, autoAnalysisEligibleMails, currentMail, loadMailBody, mailRoutingResults, nonDraftMailList, setCurrentMail, setMailList]);

  useEffect(() => {
    runBatchAnalysisRef.current = runBatchAnalysis;
  }, [runBatchAnalysis]);

  useEffect(() => {
    if (!isAutoAnalysisReady || !aiAutoSortRef.current || mailSettingsSyncInFlightRef.current) {
      knownAutoAnalyzedIdsRef.current = new Set(autoAnalysisEligibleIds);
      autoAnalysisBaselineEstablishedRef.current = false;
      return;
    }

    if (!autoAnalysisBaselineEstablishedRef.current) {
      knownAutoAnalyzedIdsRef.current = new Set(autoAnalysisEligibleIds);
      autoAnalysisBaselineEstablishedRef.current = true;
      return;
    }

    const newEligibleIds = autoAnalysisEligibleIds.filter((id) => !knownAutoAnalyzedIdsRef.current.has(id));
    if (newEligibleIds.length === 0 || isAiClassifyingRef.current) return;

    newEligibleIds.forEach((id) => knownAutoAnalyzedIdsRef.current.add(id));

    const timer = setTimeout(() => {
      if (!aiAutoSortRef.current || isAiClassifyingRef.current) return;
      if (autoAnalysisEligibleIds.length === 0) return;
      void runBatchAnalysisRef.current?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [autoAnalysisEligibleIds, isAutoAnalysisReady]);

  useEffect(() => {
    return () => {
      if (aiLockTimer.current) clearTimeout(aiLockTimer.current);
    };
  }, []);

  const handleSwitchAccount = (accountId: number) => {
    setSelectedIds([]);
    setSelectedEmail(null);
    clearCurrentMail();
    setSelectedFolder('inbox');

    if (accountId === -1) {
      setCurrentAccount('all');
      return;
    }

    const nextAccount = accounts.find((account) => account.id === accountId);
    if (!nextAccount) return;

    setCurrentAccount({
      id: nextAccount.id,
      email: nextAccount.email,
      name: nextAccount.display_name || nextAccount.email.split('@')[0],
      avatar: getAccountAvatar(nextAccount.email),
    });
  };

  const handleDeleteAccount = async (accountId: number) => {
    await deleteAccountApi(accountId);
    setMailList((prev) => prev.filter((mail) => mail.accountId !== accountId));
    setLocalThreadMails((prev) => prev.filter((mail) => mail.accountId !== accountId));
    setSelectedIds((prev) => prev.filter((id) => Number(id.split(':')[0]) !== accountId));
    setCurrentMail((prev) => (prev && prev.accountId === accountId ? null : prev));
    if (selectedEmail?.accountId === accountId) {
      setSelectedEmail(null);
      clearCurrentMail();
    }
    setCurrentAccount((prev) => resolveActiveAccountAfterDelete(accountList, accountId, prev));
    if (currentAccount !== 'all' && currentAccount !== null && currentAccount.id === accountId) {
      setSelectedFolder('inbox');
    }
  };

  const removeMailFromState = useCallback((target: MailRemovalIdentity) => {
    const removedIds = collectRemovedMailIdsForDeletedTarget(
      [...mailList, ...localThreadMails, ...sortedFolderEmails],
      target,
    );
    const shouldRemove = (mail: MailRemovalIdentity) => shouldRemoveMailForDeletedTarget(mail, target);
    const nextDraftSelection = selectedFolder === 'drafts'
      ? resolveNextDraftSelectionAfterDelete(sortedFolderEmails, target.id, selectedEmail?.id ?? null)
      : undefined;

    setMailList((prev) => prev.filter((mail) => !shouldRemove(mail)));
    setLocalThreadMails((prev) => prev.filter((mail) => !shouldRemove(mail)));
    if (selectedEmail && shouldRemove(selectedEmail)) {
      clearCurrentMail();
      if (nextDraftSelection) {
        setSelectedEmail(nextDraftSelection);
        fetchMailDetail(
          nextDraftSelection.accountId,
          nextDraftSelection.uid,
          nextDraftSelection.folder,
          nextDraftSelection,
        );
      } else {
        setSelectedEmail(null);
      }
    }
    setSelectedIds((prev) => prev.filter((id) => !removedIds.has(id)));
    setMailRoutingResults((prev) => prev.filter((entry) => !removedIds.has(entry.id)));
  }, [clearCurrentMail, fetchMailDetail, localThreadMails, mailList, selectedEmail, selectedFolder, setMailList, sortedFolderEmails]);

  const applyFolderUpdateToState = useCallback((mailId: string, nextFolder: string) => {
    setMailList((prev) => prev.map((mail) => (mail.id === mailId ? { ...mail, folder: nextFolder } : mail)));
    setLocalThreadMails((prev) => prev.map((mail) => (mail.id === mailId ? { ...mail, folder: nextFolder } : mail)));
    setCurrentMail((prev) => (prev && prev.id === mailId ? { ...prev, folder: nextFolder } : prev));
    setSelectedEmail((prev) => (prev && prev.id === mailId ? { ...prev, folder: nextFolder } : prev));
  }, [setCurrentMail, setMailList]);

  const applyReadUpdateToState = useCallback((targetIds: Set<string>, read: boolean) => {
    setMailList((prev) => applyMailReadState(prev, targetIds, read));
    setLocalThreadMails((prev) => applyMailReadState(prev, targetIds, read));
    setCurrentMail((prev) => (prev && targetIds.has(prev.id) ? { ...prev, isRead: read } : prev));
    setSelectedEmail((prev) => (prev && targetIds.has(prev.id) ? { ...prev, isRead: read } : prev));
  }, [setCurrentMail, setMailList]);

  const persistReadChange = useCallback(async (mail: RendererMailSummary, read: boolean) => {
    await window.electronAPI.invoke('mail:cacheLocal', {
      ...mail,
      isRead: read,
      date: mail.date.toISOString(),
      cachedAt: new Date().toISOString(),
    });

    if (mail.localDraftKey || mail.messageId?.startsWith('<local-')) {
      return;
    }

    const result = await window.electronAPI.invoke('mail:setRead', mail.accountId, mail.uid, read, mail.folder) as {
      success: boolean;
      error?: string;
    };
    if (!result.success) {
      throw new Error(result.error || `Failed to mark mail as ${read ? 'read' : 'unread'}`);
    }
  }, []);

  const handleDeleteForMail = useCallback(async (target: RendererMailSummary) => {
    const trashFolderPath = await resolveFolderPathForAction(target.accountId, 'trash');
    const action = resolveDeleteMailAction(target, trashFolderPath);

    if (action.type === 'move') {
      const previousFolder = target.folder;
      const optimisticMail = { ...target, folder: action.toFolder };

      try {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...optimisticMail,
          date: optimisticMail.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });

        if (!(target.localDraftKey || target.messageId?.startsWith('<local-'))) {
          const result = await window.electronAPI.invoke('mail:move', target.accountId, target.uid, previousFolder, action.toFolder) as {
            success: boolean;
            error?: string;
          };
          if (!result.success) {
            throw new Error(result.error || t('delete'));
          }
        }

        removeMailFromState(target);
        clearBodyCacheEntry(target.accountId, target.uid, target.folder);
        return;
      } catch (err) {
        console.error('[mail:move trash]', err);
        try {
          await window.electronAPI.invoke('mail:cacheLocal', {
            ...target,
            date: target.date.toISOString(),
            cachedAt: new Date().toISOString(),
          });
        } catch (rollbackErr) {
          console.error('[mail:move trash rollback]', rollbackErr);
        }
        throw err;
      }
    }

    try {
      if (target.localDraftKey || target.messageId?.startsWith('<local-')) {
        const cacheDeleteId = target.localDraftKey || extractLocalDraftKeyFromMessageId(target.messageId) || target.id;
        await window.electronAPI.invoke('mail:deleteCachedById', cacheDeleteId);
        removeMailFromState(target);
        clearBodyCacheEntry(target.accountId, target.uid, target.folder);
        return;
      }

      const result = await window.electronAPI.invoke('mail:delete', target.accountId, target.uid, target.folder) as {
        success: boolean;
        error?: string;
      };
      if (!result.success) {
        throw new Error(result.error || t('delete'));
      }
      const cacheResult = await window.electronAPI.invoke('mail:deleteCachedById', target.id) as {
        success: boolean;
        error?: string;
      };
      if (!cacheResult.success) {
        throw new Error(cacheResult.error || t('delete'));
      }
      removeMailFromState(target);
      clearBodyCacheEntry(target.accountId, target.uid, target.folder);
    } catch (err) {
      console.error('[mail:delete]', err);
      throw err;
    }
  }, [clearBodyCacheEntry, removeMailFromState, resolveFolderPathForAction, t]);

  const handleArchiveForMail = useCallback(async (target: RendererMailSummary) => {
    const archiveFolderPath = await resolveFolderPathForAction(target.accountId, 'archive');
    const inboxFolderPath = await resolveFolderPathForAction(target.accountId, 'inbox');
    const action = resolveArchiveOrSpamRemovalAction(target, archiveFolderPath, inboxFolderPath);
    const previousFolder = target.folder;
    const optimisticMail = { ...target, folder: action.toFolder };
    const isLocalOnlyMail = Boolean(target.localDraftKey) || target.messageId?.startsWith('<local-');

    applyFolderUpdateToState(target.id, action.toFolder);

    try {
      await window.electronAPI.invoke('mail:cacheLocal', {
        ...optimisticMail,
        date: optimisticMail.date.toISOString(),
        cachedAt: new Date().toISOString(),
      });

      if (!isLocalOnlyMail) {
        const result = await window.electronAPI.invoke('mail:move', target.accountId, target.uid, previousFolder, action.toFolder) as {
          success: boolean;
          error?: string;
        };
        if (!result.success) {
          throw new Error(result.error || appUi.archiveFailed);
        }
      }

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: appUi.archiveSuccess,
      }]);

      void (async () => {
        try {
          await syncMails(target.accountId, previousFolder, { notify: false, folderKind: 'other', historyRange: mailFetchHistoryRange });
          await syncMails(target.accountId, action.toFolder, { notify: false, folderKind: 'other', historyRange: mailFetchHistoryRange });
        } catch (err) {
          console.error('[mail:archive sync]', err);
        }
      })();
    } catch (err) {
      console.error('[mail:archive]', err);
      applyFolderUpdateToState(target.id, previousFolder);
      try {
        await window.electronAPI.invoke('mail:cacheLocal', {
          ...target,
          date: target.date.toISOString(),
          cachedAt: new Date().toISOString(),
        });
      } catch (cacheErr) {
        console.error('[mail:archive revert cacheLocal]', cacheErr);
      }
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: (err as Error).message || appUi.archiveFailed,
      }]);
    }
  }, [appUi.archiveFailed, appUi.archiveSuccess, applyFolderUpdateToState, mailFetchHistoryRange, resolveFolderPathForAction, syncMails]);

  const openCompose = useCallback((mode: ComposeContext['mode'], source?: RendererMailSummary | RendererMailDetail | null) => {
    setComposeRestoreDraft(null);
    setComposeContext({ mode, source: source ?? selectedMailForThread });
    setComposeSessionId((prev) => prev + 1);
    setShowCompose(true);
  }, [selectedMailForThread]);

  useEffect(() => {
    const electronApi = window.electronAPI as typeof window.electronAPI & {
      onComposeNewMail?: (callback: () => void) => () => void;
      onRefreshMail?: (callback: () => void) => () => void;
    };
    const unsubscribeCompose = electronApi.onComposeNewMail?.(() => openCompose('new', null));
    const unsubscribeRefresh = electronApi.onRefreshMail?.(() => {
      void handleRefresh();
    });
    return () => {
      unsubscribeCompose?.();
      unsubscribeRefresh?.();
    };
  }, [handleRefresh, openCompose]);

  const handleReplyWithSuggestion = (content: string, mode: 'reply' | 'forward' = 'reply', source?: RendererMailSummary | RendererMailDetail | null) => {
    setReplySuggestion(content);
    openCompose(mode, source ?? selectedMailForThread);
  };

  const handleRescanMail = useCallback(async (targetMail: RendererMailSummary | RendererMailDetail) => {
    const target = targetMail as RendererMailSummary;
    if (isAiClassifyingRef.current) return;

    setIsAiClassifying(true);
    try {
      const cleared = clearMailScanState({
        mailList,
        currentMail,
        routingResults: mailRoutingResults,
        targetMailId: target.id,
      });
      setMailList(cleared.mailList);
      setCurrentMail(cleared.currentMail);
      setMailRoutingResults(cleared.routingResults);
      setLocalThreadMails((prev) =>
        prev.map((mail) =>
          mail.id === target.id
            ? { ...mail, category: undefined, isScanned: false, scanResult: undefined }
            : mail
        )
      );
      setSelectedEmail((prev) =>
        prev && prev.id === target.id
          ? { ...prev, category: undefined, isScanned: false, scanResult: undefined }
          : prev
      );

      await window.electronAPI.invoke('mail:clearScanResults', [{
        accountId: target.accountId,
        uid: target.uid,
        folder: target.folder,
      }]);

      const response = await window.electronAPI.invoke('ai:classifyBatch', {
        emails: [{
          id: target.id,
          subject: target.subject,
          from: target.from,
          from_name: target.fromName,
          has_attachment: target.hasAttachments,
          body_text: 'bodyText' in targetMail ? targetMail.bodyText : undefined,
          body_html: 'bodyHtml' in targetMail ? targetMail.bodyHtml : undefined,
          snippet: target.snippet,
        }],
        scanMode: aiScanMode,
      }) as BatchClassifyResponse;

      if (!response.success || !response.results?.length) {
        throw new Error(appUi.aiFailed);
      }

      if (response.routingResults?.length) {
        setMailRoutingResults((prev) => {
          const merged = new Map(prev.map((entry) => [entry.id, entry]));
          for (const entry of response.routingResults ?? []) {
            merged.set(entry.id, entry);
          }
          return Array.from(merged.values());
        });
      }

      applyScanResultsToState(response.results, response.routingResults ?? []);

      await window.electronAPI.invoke('mail:updateCategories', [{
        accountId: target.accountId,
        uid: target.uid,
        folder: target.folder,
        category: response.results[0].category,
        scanResult: response.routingResults?.find((entry) => entry.id === target.id)?.routing.smart_folder?.folder ??
          response.results[0].category,
      }]);
    } catch (err) {
      console.error('[handleRescanMail]', err);
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message: (err as Error).message || appUi.aiFailed,
      }]);
    } finally {
      setIsAiClassifying(false);
    }
  }, [aiScanMode, appUi.aiFailed, applyScanResultsToState, currentMail, mailList, mailRoutingResults]);

  const handleCloseCompose = () => {
    setShowCompose(false);
    setReplySuggestion(null);
    setComposeRestoreDraft(null);
    setComposeContext({ mode: 'new', source: null });
  };

  const handleShare = async (blob: Blob) => {
    try {
      const clipboardItem = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([clipboardItem]);
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'success', message: appUi.shareSuccess }]);
    } catch (err) {
      console.error('[handleShare]', err);
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message: appUi.shareFailed }]);
    }
  };

  const handleSendMail = async (options: {
    accountId: number;
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    editableBody: string;
    draftKey: string;
    sourceDraft?: Pick<ComposeDraftOption, 'id' | 'accountId' | 'uid' | 'folder' | 'messageId' | 'localOnly' | 'draftKey'> | null;
    outgoingAttachments?: OutgoingAttachmentReference[];
  }): Promise<{ success: boolean; message: string }> => {
    const account = accounts.find((item) => item.id === options.accountId);
    if (!account) {
      const message = appUi.sendFailedFallback;
      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'error',
        message,
      }]);
      return { success: false, message };
    }

    const source = composeContext.source;
    const composeMode = composeContext.mode;
    const sourceDraft = options.sourceDraft || null;
    const outgoingAttachments = normalizeOutgoingAttachments(options.outgoingAttachments);
    const outgoingAttachmentMetadata = buildOutgoingAttachmentMetadata(outgoingAttachments);
    const draftIdentity = options.draftKey;
    const sentFolderPath = getResolvedFolderPath(options.accountId, 'sent');
    const localMessageId = `<local-${Date.now()}-${Math.random().toString(36).slice(2)}@minimail>`;
    const localMailId = `${options.accountId}:${localMessageId}`;
    const localSendId = `${options.accountId}:send:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const localSentUid = Date.now();
    const sentDate = new Date();
    const references = [source?.references, source?.messageId].filter(Boolean).join(' ').trim() || undefined;
    const restoreRecipients = options.to
      .map((recipient) => buildComposeRecipientOption(recipient, recipient.split('@')[0]))
      .filter((recipient): recipient is ComposeRecipientOption => Boolean(recipient));
    const quotedOriginal = source && composeMode !== 'new'
      ? buildComposeQuotedOriginal({
          mode: composeMode === 'forward' ? 'forward' : 'reply',
          email: source,
        })
      : null;
    const scheduledDraftPayload = JSON.stringify({
      draftKey: draftIdentity,
      recipients: restoreRecipients,
      body: options.editableBody,
      quotedOriginal,
      outgoingAttachments,
    } satisfies PersistedComposeDraftPayload);

    const optimisticMail: RendererMailSummary = {
      id: localMailId,
      uid: localSentUid,
      from: account.email,
      fromName: account.display_name || account.email.split('@')[0],
      to: options.to.join(', '),
      subject: options.subject,
      date: sentDate,
      snippet: options.bodyText.trim().slice(0, 160),
      hasAttachments: outgoingAttachments.length > 0,
      isRead: true,
      isStarred: false,
      folder: sentFolderPath,
      accountId: options.accountId,
      messageId: localMessageId,
      inReplyTo: composeContext.mode === 'reply' ? source?.messageId : undefined,
      references,
      localSendId,
      deliveryState: 'scheduled',
      localDraftKey: undefined,
      draftPayload: scheduledDraftPayload,
      bodyText: options.bodyText,
      bodyHtml: options.bodyHtml,
      attachments: outgoingAttachmentMetadata,
    };

    const cacheLocalMail = async (mail: RendererMailSummary) => {
      const response = await window.electronAPI.invoke('mail:cacheLocal', {
        ...mail,
        date: mail.date.toISOString(),
        cachedAt: new Date().toISOString(),
        bodyText: mail.bodyText,
        bodyHtml: mail.bodyHtml,
        attachments: mail.attachments,
      }) as { success?: boolean; error?: string } | undefined;
      if (response?.success === false) {
        throw new Error(response.error || 'Failed to cache local mail');
      }
    };

    const updateLocalSendMail = (mail: RendererMailSummary) => {
      setLocalThreadMails((prev) => prev.map((item) => item.id === localMailId ? mail : item));
      setMailList((prev) => prev.map((item) => item.id === localMailId ? mail : item));
    };

    activeScheduledSendsRef.current.add(localSendId);
    setLocalThreadMails((prev) => {
      const filtered = prev.filter((mail) => mail.localDraftKey !== draftIdentity && mail.id !== localMailId);
      return [optimisticMail, ...filtered];
    });

    const draftId = `${options.accountId}:${draftIdentity}`;
    setMailList((prev) => {
      const filtered = prev.filter((mail) =>
        mail.id !== localMailId &&
        mail.id !== draftId &&
        mail.localDraftKey !== draftIdentity
      );
      return [optimisticMail, ...filtered];
    });

    try {
      await cacheLocalMail(optimisticMail);
    } catch (err) {
      console.error('[mail:cacheLocal optimistic sent]', err);
      activeScheduledSendsRef.current.delete(localSendId);
      setLocalThreadMails((prev) => prev.filter((mail) => mail.id !== localMailId));
      setMailList((prev) => prev.filter((mail) => mail.id !== localMailId));
      const message = appUi.sendFailedFallback;
      setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message }]);
      return { success: false, message };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const cancelScheduledSend = async () => {
      const pendingTimer = scheduledSendTimersRef.current.get(localSendId);
      if (pendingTimer) {
        if (timer) clearTimeout(timer);
        clearTimeout(pendingTimer);
      }
      scheduledSendTimersRef.current.delete(localSendId);
      if (!activeScheduledSendsRef.current.has(localSendId)) return;
      activeScheduledSendsRef.current.delete(localSendId);

      const cancelledMail: RendererMailSummary = {
        ...optimisticMail,
        deliveryState: 'cancelled',
        deliveryError: undefined,
      };
      updateLocalSendMail(cancelledMail);
      setComposeRestoreDraft({
        accountId: options.accountId,
        recipients: restoreRecipients,
        subject: options.subject,
        body: options.editableBody,
        outgoingAttachments,
        mode: composeMode,
        source,
      });
      setReplySuggestion(null);
      setComposeContext({ mode: composeMode, source });
      setComposeSessionId((prev) => prev + 1);
      setShowCompose(true);

      try {
        await cacheLocalMail(cancelledMail);
      } catch (err) {
        console.error('[mail:cacheLocal cancelled scheduled send]', err);
      }

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'info',
        message: appUi.sendCancelled,
      }]);
    };

    const runScheduledSend = async () => {
      scheduledSendTimersRef.current.delete(localSendId);
      if (!activeScheduledSendsRef.current.has(localSendId)) return;

      const sendingMail: RendererMailSummary = {
        ...optimisticMail,
        deliveryState: 'sending',
        deliveryError: undefined,
      };
      updateLocalSendMail(sendingMail);
      try {
        await cacheLocalMail(sendingMail);
      } catch (err) {
        console.error('[mail:cacheLocal sending scheduled send]', err);
      }

      let result: { success: boolean; message: string; messageId?: string };
      try {
        result = await window.electronAPI.invoke('mail:send', options.accountId, {
          to: options.to,
          subject: options.subject,
          body: options.bodyHtml || options.bodyText,
          isHtml: Boolean(options.bodyHtml),
          outgoingAttachments,
          sentCache: {
            accountId: options.accountId,
            folder: sentFolderPath,
            uid: localSentUid,
          },
        }) as { success: boolean; message: string; messageId?: string };
      } catch (err) {
        result = {
          success: false,
          message: err instanceof Error ? err.message : appUi.sendFailedFallback,
        };
      }

      if (!result.success) {
        activeScheduledSendsRef.current.delete(localSendId);
        const failureMessage = result.message || appUi.sendFailedFallback;
        const failedMail: RendererMailSummary = {
          ...optimisticMail,
          deliveryState: 'failed',
          deliveryError: failureMessage,
          bodyText: options.bodyText,
          bodyHtml: options.bodyHtml,
        };

        setLocalThreadMails((prev) =>
          prev.map((mail) => mail.id === localMailId ? failedMail : mail)
        );
        setMailList((prev) =>
          prev.map((mail) => mail.id === localMailId ? failedMail : mail)
        );
        try {
          await cacheLocalMail(failedMail);
        } catch (err) {
          console.error('[mail:cacheLocal failed sent]', err);
        }
        setToasts((prev) => [...prev, {
          id: Date.now().toString(),
          type: 'error',
          message: failureMessage,
        }]);
        return;
      }

      activeScheduledSendsRef.current.delete(localSendId);
      const deliveredMail: RendererMailSummary = {
        ...optimisticMail,
        messageId: result.messageId || localMessageId,
        deliveryState: 'sent',
        deliveryError: undefined,
        localDraftKey: undefined,
        draftPayload: undefined,
        bodyText: options.bodyText,
        bodyHtml: options.bodyHtml,
      };

      const sourceDraftTokens = [
        sourceDraft?.id,
        sourceDraft?.draftKey,
        sourceDraft?.messageId,
      ].filter((value): value is string => Boolean(value));

      setLocalThreadMails((prev) =>
        prev
          .filter((mail) =>
            mail.id !== draftId &&
            mail.localDraftKey !== draftIdentity &&
            !sourceDraftTokens.includes(mail.id) &&
            !(mail.messageId && sourceDraftTokens.includes(mail.messageId)) &&
            !(mail.localDraftKey && sourceDraftTokens.includes(mail.localDraftKey))
          )
          .map((mail) => mail.id === localMailId ? deliveredMail : mail)
      );
      setMailList((prev) =>
        prev
          .filter((mail) =>
            mail.id !== draftId &&
            mail.localDraftKey !== draftIdentity &&
            !sourceDraftTokens.includes(mail.id) &&
            !(mail.messageId && sourceDraftTokens.includes(mail.messageId)) &&
            !(mail.localDraftKey && sourceDraftTokens.includes(mail.localDraftKey))
          )
          .map((mail) => mail.id === localMailId ? deliveredMail : mail)
      );
      setLocalComposeDrafts((prev) => prev.filter((draft) =>
        draft.draftKey !== draftIdentity &&
        draft.id !== draftId &&
        !sourceDraftTokens.includes(draft.id) &&
        !sourceDraftTokens.includes(draft.draftKey) &&
        !(draft.messageId && sourceDraftTokens.includes(draft.messageId))
      ));
      setDeletedComposeDraftTokens((prev) => Array.from(new Set([
        ...prev,
        draftIdentity,
        draftId,
        getLocalDraftMessageId(draftIdentity),
        ...sourceDraftTokens,
      ])));

      setToasts((prev) => [...prev, {
        id: Date.now().toString(),
        type: 'success',
        message: appUi.sendSuccess,
      }]);

      try {
        await cacheLocalMail(deliveredMail);
      } catch (err) {
        console.error('[mail:cacheLocal deliveredMail]', err);
      }

      try {
        const deleteResult = await window.electronAPI.invoke('mail:deleteCachedDraft', {
          accountId: sourceDraft?.accountId ?? options.accountId,
          folder: sourceDraft?.folder,
          uid: sourceDraft?.uid,
          id: sourceDraft?.id ?? draftId,
          messageId: sourceDraft?.messageId ?? getLocalDraftMessageId(draftIdentity),
          localDraftKey: draftIdentity,
        }) as {
          success?: boolean;
          error?: string;
        };
        if (deleteResult?.success === false) {
          console.error('[mail:deleteCachedDraft draft]', deleteResult.error || 'failed');
        }
      } catch (err) {
        console.error('[mail:deleteCachedDraft draft]', err);
      }

      if (sourceDraft && !sourceDraft.localOnly && sourceDraft.uid != null && sourceDraft.folder) {
        try {
          const deleteResult = await window.electronAPI.invoke(
            'mail:delete',
            sourceDraft.accountId,
            sourceDraft.uid,
            sourceDraft.folder,
          ) as { success?: boolean; error?: string };
          if (deleteResult?.success === false) {
            console.error('[mail:delete server draft after send]', deleteResult.error || 'failed');
          }
        } catch (err) {
          console.error('[mail:delete server draft after send]', err);
        }
      }

      try {
        for (const folder of getSyncFoldersForView('sent')) {
          await syncMails(options.accountId, sentFolderPath, {
            notify: false,
            folderKind: folder === 'inbox' ? 'inbox' : 'other',
            historyRange: mailFetchHistoryRange,
          });
        }
      } catch (err) {
        console.error('[mail:sync after send]', err);
      }
    };

    timer = setTimeout(() => {
      void runScheduledSend();
    }, SEND_UNDO_DELAY_MS);
    scheduledSendTimersRef.current.set(localSendId, timer);

    setToasts((prev) => [...prev, {
      id: `${localSendId}:scheduled`,
      type: 'info',
      message: appUi.sendScheduled,
      actionLabel: appUi.sendUndoAction,
      onAction: () => cancelScheduledSend(),
    }]);

    return { success: true, message: appUi.sendScheduled };
  };

  const handleSaveAttempt = async (input: CreateAccountInput) => {
    const result = await createAccount(input);
    if (result.success) {
      await fetchAccounts();
      setShowAddAccount(false);
    }
    return result;
  };

  const handleAutoFetchIntervalChange = useCallback(async (minutes: number) => {
    setAutoFetchMinutes(minutes);
    try {
      await window.electronAPI.invoke('settings:set', MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY, String(minutes));
    } catch (err) {
      console.error(`[settings:set ${MAIL_AUTO_FETCH_INTERVAL_SETTING_KEY}]`, err);
    }
  }, []);

  const handleGithubNotificationsViewEnabledChange = useCallback(async (enabled: boolean) => {
    setGithubNotificationsViewEnabled(enabled);
    try {
      await window.electronAPI.invoke(
        'settings:set',
        GITHUB_NOTIFICATIONS_VIEW_ENABLED_SETTING_KEY,
        enabled ? 'true' : 'false'
      );
    } catch (err) {
      console.error(`[settings:set ${GITHUB_NOTIFICATIONS_VIEW_ENABLED_SETTING_KEY}]`, err);
    }
  }, []);

  const handleMailHistoryRangeChange = useCallback(async (range: MailHistoryRange) => {
    const runId = ++mailSettingsMutationRef.current;
    mailSettingsSyncInFlightRef.current = true;
    setMailFetchHistoryRange(range);
    setStagedHistorySync(createEmptyStagedHistorySyncState());
    try {
      await window.electronAPI.invoke('settings:set', MAIL_FETCH_HISTORY_RANGE_SETTING_KEY, range);
      if (runId !== mailSettingsMutationRef.current) return;
      await reloadCurrentViewForHistoryRange(range);
      if (runId !== mailSettingsMutationRef.current) return;
      for (const account of scopedAccounts) {
        for (const folder of getSyncFoldersForView(selectedFolder)) {
          const folderPath = await resolveFolderPathForAction(account.id, folder);
          await syncMails(account.id, folderPath, {
            notify: folder === 'inbox',
            folderKind: folder === 'inbox' ? 'inbox' : 'other',
            historyRange: range,
            forceHistoryRange: true,
          });
        }
      }
      if (runId !== mailSettingsMutationRef.current) return;
      await reloadCurrentViewForHistoryRange(range);
    } catch (err) {
      console.error(`[settings:set ${MAIL_FETCH_HISTORY_RANGE_SETTING_KEY}]`, err);
    } finally {
      if (runId === mailSettingsMutationRef.current) {
        mailSettingsSyncInFlightRef.current = false;
      }
    }
  }, [reloadCurrentViewForHistoryRange, resolveFolderPathForAction, scopedAccounts, selectedFolder, syncMails]);

  const handleMailCacheRangeChange = useCallback(async (range: MailCacheRange) => {
    const runId = ++mailSettingsMutationRef.current;
    mailSettingsSyncInFlightRef.current = true;
    setMailCacheRange(range);
    setStagedHistorySync(createEmptyStagedHistorySyncState());
    try {
      await window.electronAPI.invoke('settings:set', MAIL_CACHE_RANGE_SETTING_KEY, range);
      if (runId !== mailSettingsMutationRef.current) return;
      await window.electronAPI.invoke('mail:pruneCache', { range });
      if (runId !== mailSettingsMutationRef.current) return;
      await reloadCurrentViewForHistoryRange(mailFetchHistoryRange);
    } catch (err) {
      console.error(`[settings:set ${MAIL_CACHE_RANGE_SETTING_KEY}]`, err);
    } finally {
      if (runId === mailSettingsMutationRef.current) {
        mailSettingsSyncInFlightRef.current = false;
      }
    }
  }, [mailFetchHistoryRange, reloadCurrentViewForHistoryRange]);

  const backupFolders = useMemo(
    () => (backupState.selectedAccountId ? accountFoldersById[backupState.selectedAccountId] || [] : []),
    [accountFoldersById, backupState.selectedAccountId]
  );

  const handleBackupAccountChange = useCallback((accountId: number) => {
    setBackupState((prev) => ({
      ...prev,
      selectedAccountId: Number.isFinite(accountId) ? accountId : null,
      selectedFolderPaths: [],
      lastResult: null,
    }));
  }, []);

  const handleBackupScopeChange = useCallback((scope: BackupUiState['exportScope']) => {
    setBackupState((prev) => ({
      ...prev,
      exportScope: scope,
      lastResult: null,
    }));
  }, []);

  const handleBackupFolderToggle = useCallback((folderPath: string) => {
    setBackupState((prev) => ({
      ...prev,
      selectedFolderPaths: prev.selectedFolderPaths.includes(folderPath)
        ? prev.selectedFolderPaths.filter((value) => value !== folderPath)
        : [...prev.selectedFolderPaths, folderPath],
      lastResult: null,
    }));
  }, []);

  const handleBackupPickDestination = useCallback(async () => {
    const response = await window.electronAPI.invoke('file:pickDirectory') as {
      success: boolean;
      paths?: string[];
    };

    if (response.success && response.paths?.[0]) {
      setBackupState((prev) => ({
        ...prev,
        destinationPath: response.paths![0],
        lastResult: null,
      }));
    }
  }, []);

  const handleCancelBackupExport = useCallback(async () => {
    if (!backupState.taskId) return;
    await window.electronAPI.invoke('mail:cancelBackup', backupState.taskId);
  }, [backupState.taskId]);

  const handleOpenBackupFolder = useCallback(async () => {
    const targetPath = backupState.lastResult?.outputPath || backupState.destinationPath;
    if (!targetPath) return;
    await window.electronAPI.invoke('file:openPath', targetPath);
  }, [backupState.destinationPath, backupState.lastResult?.outputPath]);

  const handleBackupPickImportSources = useCallback(async () => {
    const response = await window.electronAPI.invoke('file:pickImportSources') as {
      success: boolean;
      paths?: string[];
    };

    if (response.success && response.paths?.length) {
      setBackupState((prev) => ({
        ...prev,
        importSourcePaths: response.paths ?? [],
        lastResult: null,
      }));
    }
  }, []);

  const handleStartBackupExport = useCallback(async () => {
    const currentBackupState = backupState;
    if (!canStartBackupExport(currentBackupState) || !currentBackupState.selectedAccountId) {
      return;
    }

    const taskId = `backup-${Date.now()}`;
    const selectedAccount = accountList.find((account) => account.id === currentBackupState.selectedAccountId);
    const folderPaths = currentBackupState.exportScope === 'account'
      ? backupFolders.map((folder) => folder.path)
      : currentBackupState.selectedFolderPaths;
    const request: MailExportRequest = {
      mode: 'export',
      taskId,
      destinationPath: currentBackupState.destinationPath,
      scope: {
        accountId: currentBackupState.selectedAccountId,
        accountLabel: selectedAccount?.email || selectedAccount?.name || `account-${currentBackupState.selectedAccountId}`,
        folderPaths,
      },
      filters: {
        readState: currentBackupState.readState,
        startDate: currentBackupState.startDate ? new Date(`${currentBackupState.startDate}T00:00:00`).toISOString() : undefined,
        endDate: currentBackupState.endDate ? new Date(`${currentBackupState.endDate}T23:59:59.999`).toISOString() : undefined,
      },
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: true,
      lastResult: null,
      progress: {
        taskId,
        mode: 'export',
        stage: 'preparing',
        processed: 0,
        total: 0,
        message: 'Preparing export',
      },
    }));

    const response = await window.electronAPI.invoke('mail:exportEml', request) as {
      success: boolean;
      data?: MailBackupResult;
      error?: string;
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: false,
      lastResult: response.data
        ? response.data
        : {
            taskId,
            success: false,
            mode: 'export',
            processed: prev.progress.processed,
            imported: 0,
            exported: prev.progress.processed,
            skipped: 0,
            error: response.error || 'Export failed',
            outputPath: prev.destinationPath,
          },
    }));
  }, [accountList, backupFolders, backupState]);

  const handleStartBackupImport = useCallback(async () => {
    const currentBackupState = backupState;
    if (
      !currentBackupState.selectedAccountId ||
      !currentBackupState.importTargetFolderPath ||
      currentBackupState.importSourcePaths.length === 0 ||
      currentBackupState.isRunning
    ) {
      return;
    }

    const taskId = `backup-import-${Date.now()}`;
    const request: MailImportRequest = {
      mode: 'import',
      taskId,
      sourcePaths: currentBackupState.importSourcePaths,
      targetAccountId: currentBackupState.selectedAccountId,
      targetFolder: currentBackupState.importTargetFolderPath,
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: true,
      lastResult: null,
      progress: {
        taskId,
        mode: 'import',
        stage: 'preparing',
        processed: 0,
        total: 0,
        message: 'Preparing import',
      },
    }));

    const response = await window.electronAPI.invoke('mail:importEml', request) as {
      success: boolean;
      data?: MailBackupResult;
      error?: string;
    };

    setBackupState((prev) => ({
      ...prev,
      taskId,
      isRunning: false,
      lastResult: response.data
        ? response.data
        : {
            taskId,
            success: false,
            mode: 'import',
            processed: prev.progress.processed,
            imported: prev.progress.processed,
            exported: 0,
            skipped: 0,
            error: response.error || 'Import failed',
          },
    }));
  }, [backupState]);

  const handleSaveDraft = useCallback(async (options: {
    accountId: number;
    to: string[];
    subject: string;
    body: string;
    draftKey: string;
    quotedOriginal?: ComposeQuotedOriginal | null;
    outgoingAttachments?: OutgoingAttachmentReference[];
  }) => {
    const account = accounts.find((item) => item.id === options.accountId);
    if (!account) return;

    const draftFolderPath = getResolvedFolderPath(options.accountId, 'drafts');
    const draftUid = Number(options.draftKey.replace(/\D/g, '').slice(-12)) || Date.now();
    const outgoingAttachments = normalizeOutgoingAttachments(options.outgoingAttachments);
    const outgoingAttachmentMetadata = buildOutgoingAttachmentMetadata(outgoingAttachments);
    const draftMail: RendererMailSummary = {
      id: `${options.accountId}:${options.draftKey}`,
      uid: draftUid,
      from: account.email,
      fromName: account.display_name || account.email.split('@')[0],
      to: options.to.join(', '),
      subject: options.subject || '(Draft)',
      date: new Date(),
      snippet: options.body.trim().slice(0, 160) || '(Draft)',
      hasAttachments: outgoingAttachments.length > 0,
      isRead: true,
      isStarred: false,
      folder: draftFolderPath,
      accountId: options.accountId,
      messageId: `<${options.draftKey}@minimail>`,
      localDraftKey: options.draftKey,
      attachments: outgoingAttachmentMetadata,
    };

    const draftOption: ComposeDraftOption = {
      id: draftMail.id,
      accountId: options.accountId,
      uid: draftMail.uid,
      folder: draftMail.folder,
      messageId: draftMail.messageId,
      localOnly: true,
      draftKey: options.draftKey,
      recipients: options.to
        .map((address) => buildComposeRecipientOption(address, address.split('@')[0]))
        .filter((value): value is ComposeRecipientOption => Boolean(value)),
      subject: options.subject,
      body: options.body,
      quotedOriginal: options.quotedOriginal || null,
      outgoingAttachments,
      date: draftMail.date,
    };

    try {
      const response = await window.electronAPI.invoke('mail:cacheLocal', {
        ...draftMail,
        date: draftMail.date.toISOString(),
        cachedAt: new Date().toISOString(),
        bodyText: options.body,
        attachments: outgoingAttachmentMetadata,
        draftPayload: JSON.stringify({
          recipients: draftOption.recipients,
          body: options.body,
          quotedOriginal: options.quotedOriginal || null,
          outgoingAttachments,
        }),
      }) as { success: boolean; error?: string };

      if (!response.success) {
        throw new Error(response.error || 'Failed to save draft');
      }

      setLocalComposeDrafts((prev) => {
        const filtered = prev.filter((draft) => draft.id !== draftOption.id);
        return [draftOption, ...filtered].sort((a, b) => b.date.getTime() - a.date.getTime());
      });
      setDeletedComposeDraftTokens((prev) =>
        prev.filter((token) =>
          token !== draftOption.id && token !== draftOption.draftKey && token !== (draftOption.messageId || '')
        )
      );
    } catch (error) {
      console.error('[composeDraft] failed to persist local draft cache', error);
      throw error;
    }
  }, [accounts, getResolvedFolderPath]);

  const handleDeleteComposeDraft = useCallback((draftId: string, draft?: ComposeDraftOption) => {
    const draftKey = draft?.draftKey || getDraftKeyFromMailId(draftId);
    const draftMessageId = getLocalDraftMessageId(draftKey);
    const draftTokens = new Set([draftId, draftKey, draftMessageId, ...(draft?.messageId ? [draft.messageId] : [])]);
    const selectedDraftWillBeDeleted = selectedEmail
      ? matchesComposeDraftToken({
        id: selectedEmail.id,
        localDraftKey: selectedEmail.localDraftKey,
        messageId: selectedEmail.messageId,
      }, draftTokens)
      : false;
    const visibleDeletedDraft = sortedFolderEmails.find((mail) => matchesComposeDraftToken(mail, draftTokens));
    const deletedVisibleDraftId = visibleDeletedDraft?.id ?? (selectedDraftWillBeDeleted ? selectedEmail?.id : draftId);
    const nextDraftSelection = selectedFolder === 'drafts' && selectedDraftWillBeDeleted
      ? resolveNextDraftSelectionAfterDelete(sortedFolderEmails, deletedVisibleDraftId, deletedVisibleDraftId)
      : undefined;

    setLocalComposeDrafts((prev) => prev.filter((draft) => draft.id !== draftId && draft.draftKey !== draftKey));
    setDeletedComposeDraftTokens((prev) => Array.from(new Set([...prev, ...draftTokens])));
    setMailList((prev) => prev.filter((mail) => !matchesComposeDraftToken(mail, draftTokens)));
    setLocalThreadMails((prev) => prev.filter((mail) => !matchesComposeDraftToken(mail, draftTokens)));
    setSelectedIds((prev) => prev.filter((id) => id !== draftId));
    if (selectedDraftWillBeDeleted) {
      clearCurrentMail();
      if (nextDraftSelection) {
        setSelectedEmail(nextDraftSelection);
        fetchMailDetail(
          nextDraftSelection.accountId,
          nextDraftSelection.uid,
          nextDraftSelection.folder,
          nextDraftSelection,
        );
      } else {
        setSelectedEmail(null);
      }
    } else {
      setCurrentMail((prev) => {
        if (!prev) return prev;
        return matchesComposeDraftToken({
          id: prev.id,
          localDraftKey: prev.localDraftKey,
          messageId: prev.messageId,
        }, draftTokens)
          ? null
          : prev;
      });
    }

    const cleanupTasks: Promise<unknown>[] = [
      window.electronAPI.invoke('mail:deleteCachedDraft', {
        accountId: draft?.accountId,
        folder: draft?.folder,
        uid: draft?.uid,
        id: draftId,
        messageId: draft?.messageId ?? draftMessageId,
        localDraftKey: draftKey,
      }),
    ];

    if (!draft?.localOnly && draft?.uid != null && draft.folder) {
      cleanupTasks.push(window.electronAPI.invoke('mail:delete', draft.accountId, draft.uid, draft.folder));
    }

    void Promise.allSettled(cleanupTasks).then((results) => {
      const rejected = results.filter((result) => result.status === 'rejected');
      if (rejected.length > 0) {
        console.error('[mail:deleteCachedDraft compose draft]', rejected);
      }
    });
  }, [clearCurrentMail, fetchMailDetail, selectedEmail, selectedFolder, setCurrentMail, setMailList, setSelectedEmail, sortedFolderEmails]);

  const composeInitialRecipients = useMemo<ComposeRecipientOption[]>(() => {
    if (composeRestoreDraft) {
      return composeRestoreDraft.recipients;
    }
    if (composeContext.mode !== 'reply' || !composeContext.source) {
      return [];
    }

    const recipient = buildComposeRecipientOption(
      composeContext.source.from,
      composeContext.source.fromName,
    );

    return recipient ? [recipient] : [];
  }, [composeContext.mode, composeContext.source, composeRestoreDraft]);

  const composeInitialSubject = useMemo(() => {
    if (composeRestoreDraft) return composeRestoreDraft.subject;
    if (!composeContext.source) return '';
    if (composeContext.mode === 'reply') {
      return /^re:/i.test(composeContext.source.subject) ? composeContext.source.subject : `Re: ${composeContext.source.subject}`;
    }
    if (composeContext.mode === 'forward') {
      return /^fwd:/i.test(composeContext.source.subject) ? composeContext.source.subject : `Fwd: ${composeContext.source.subject}`;
    }
    return '';
  }, [composeContext.mode, composeContext.source, composeRestoreDraft]);

  const composeInitialBody = composeRestoreDraft?.body || replySuggestion || '';
  const composeInitialOutgoingAttachments = useMemo<OutgoingAttachmentReference[]>(
    () => composeRestoreDraft?.outgoingAttachments || [],
    [composeRestoreDraft],
  );

  const composeQuotedOriginal = useMemo<ComposeQuotedOriginal | null>(() => {
    if (!composeContext.source || composeContext.mode === 'new') {
      return null;
    }

    return buildComposeQuotedOriginal({
      mode: composeContext.mode === 'forward' ? 'forward' : 'reply',
      email: composeContext.source,
    });
  }, [composeContext.mode, composeContext.source]);

  const composeSourceLanguageSample = (() => {
    if (!composeContext.source) {
      return '';
    }

    const source = composeContext.source;
    const bodyText = 'bodyText' in source && typeof source.bodyText === 'string' ? source.bodyText : '';
    const bodyHtml = 'bodyHtml' in source && typeof source.bodyHtml === 'string' ? source.bodyHtml : '';

    return [
      source.subject,
      source.snippet,
      bodyText,
      bodyHtml.replace(/<[^>]+>/g, ' '),
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
  })();

  const composeInitialHydrateKey = useMemo(() => {
    if (composeRestoreDraft) {
      return `restore:${composeSessionId}:${composeRestoreDraft.draftKey}`;
    }

    const source = composeContext.source;
    const sourceKey = source
      ? `${source.accountId}:${source.folder || ''}:${source.uid ?? ''}:${source.id}`
      : 'none';

    return `session:${composeSessionId}:${composeContext.mode}:${sourceKey}`;
  }, [composeContext.mode, composeContext.source, composeRestoreDraft, composeSessionId]);

  const composeSelectedAccount = useMemo(
    () => {
      if (composeRestoreDraft) {
        const restoredAccount = accountList.find((account) => account.id === composeRestoreDraft.accountId);
        if (restoredAccount) return restoredAccount;
      }
      return resolveComposeSelectedAccount(accountList, currentAccount, composeContext.source);
    },
    [accountList, composeContext.source, composeRestoreDraft, currentAccount]
  );

  const composeRecipientSuggestions = useMemo(() => {
    const candidates = [
      ...nonDraftMailList,
      ...nonDraftLocalThreadMails,
      ...(currentMail ? [currentMail] : []),
      ...(composeContext.source ? [composeContext.source] : []),
    ];

    return buildRecipientSuggestionsFromMails(candidates, conversationAccountEmails);
  }, [composeContext.source, conversationAccountEmails, currentMail, nonDraftLocalThreadMails, nonDraftMailList]);

  const composeDraftOptions = useMemo<ComposeDraftOption[]>(() => {
    const deletedTokens = new Set(deletedComposeDraftTokens);
    const byId = new Map<string, ComposeDraftOption>();
    for (const draft of localComposeDrafts) {
      if (matchesComposeDraftToken({
        id: draft.id,
        localDraftKey: draft.draftKey,
        messageId: draft.messageId,
      }, deletedTokens)) {
        continue;
      }
      byId.set(draft.id, draft);
    }

    for (const mail of mailList) {
      const isDraft = Boolean(mail.localDraftKey) || folderMatches(mail.folder, 'drafts') || mail.deliveryState === 'cancelled';
      if (!isDraft || byId.has(mail.id)) continue;
      if (matchesComposeDraftToken(mail, deletedTokens)) continue;

      const draftOption = buildComposeDraftOptionFromMail(mail);
      if (draftOption) {
        byId.set(mail.id, draftOption);
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [deletedComposeDraftTokens, localComposeDrafts, mailList]);

  const allVisibleIds = sortedFolderEmails.map((mail) => mail.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));
  const isAllAccountsView = currentAccount === 'all';
  const hasConnectedAccounts = accountList.length > 0;
  const listTitle = selectedFolder === 'github'
    ? 'GitHub'
    : (isGitHubSmartFolderView || isPriorityFolderView)
      ? selectedFolder
      : isAllAccountsView
        ? t('allAccounts')
        : (currentAccount && 'name' in currentAccount ? currentAccount.name : 'No account connected');

  return (
    <div className="relative flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#050B14' }}>
      {!isMacOS && <WindowControls className="absolute top-3 right-3 z-[10001]" />}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{ width: 272, display: isMobile ? 'none' : 'flex', flexDirection: 'column' }}
        >
          <Sidebar
            t={t}
            selectedFolder={selectedFolder}
            onSelectFolder={(folderId) => {
              setSelectedFolder(folderId);
              setSelectedIds([]);
              setSelectedEmail(null);
              clearCurrentMail();
            }}
            onCompose={() => openCompose('new', null)}
            onSettings={() => setShowSettings(true)}
            currentAccount={currentAccount}
            accounts={accountList}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={() => setShowAddAccount(true)}
            onRefresh={handleRefresh}
            isRefreshing={isSyncing}
            isAiClassifying={isAiClassifying}
            onAnalysisDone={runBatchAnalysis}
            folderUnreadCounts={folderUnreadCounts}
            unreadConversationCount={unreadConversationCount}
            githubNotificationsEnabled={githubNotificationsViewEnabled}
            githubConversationCount={githubConversationCount}
            githubFolderCounts={githubFolderCounts}
            priorityFolderCounts={priorityFolderCounts}
            appLanguage={appLanguage}
            isMacOS={isMacOS}
          />
        </div>

        <div
          className="flex-shrink-0 overflow-hidden"
          style={{ width: mailListWidth, display: isMobile ? (mobileView === 'list' ? 'flex' : 'none') : 'flex', flexDirection: 'column' }}
        >
          <MailList
            t={t}
            appLanguage={appLanguage}
            emails={folderEmails}
            categorySourceEmails={categorySourceEmails}
            selectedEmailId={selectedEmail?.id || null}
            onSelectEmail={handleSelectEmail}
            onViewEmail={handleViewEmail}
            onToggleSelect={handleToggleSelect}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
          isAllSelected={isAllSelected}
            isLoading={isSyncing || isViewHydrating}
            listTitle={listTitle}
            accountEmails={conversationAccountEmails}
            emptyMessage={!hasConnectedAccounts ? 'No account connected / 请添加邮箱账号' : undefined}
            stagedHistoryLabel={stagedHistoryLabel}
            githubPriorityById={githubPriorityById}
          />
        </div>

        {!isMobile && (
          <div
            onMouseDown={startMailListResize}
            className="w-2 flex-shrink-0 cursor-col-resize group relative [-webkit-app-region:no-drag]"
            style={{ backgroundColor: isResizingMailList ? 'rgba(124,58,237,0.08)' : 'transparent' }}
          >
            <div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-colors"
              style={{
                width: 3,
                backgroundColor: isResizingMailList ? 'rgba(124,58,237,0.78)' : 'rgba(148,163,184,0.14)',
              }}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex-shrink-0 overflow-hidden flex flex-col">
          <MailDetail
            t={t}
            email={displayedMail}
            onReply={() => openCompose('reply')}
            onForward={() => openCompose('forward')}
            onDelete={() => {
              if (selectedEmail) {
                void handleDeleteForMail(selectedEmail).catch((err) => {
                  setToasts((prev) => [...prev, {
                    id: Date.now().toString(),
                    type: 'error',
                    message: (err as Error).message || t('delete'),
                  }]);
                });
              }
            }}
            onBack={isMobile ? handleBackToList : undefined}
            onShare={handleShare}
            aiTargetLanguage={effectiveAiTargetLanguage}
            onReplyWithSuggestion={handleReplyWithSuggestion}
            loadMailBody={loadMailBody}
            mailLoadingState={mailLoadingState}
            mailError={mailError}
            onRetry={() => selectedEmail && fetchMailDetail(selectedEmail.accountId, selectedEmail.uid, selectedEmail.folder, selectedEmail)}
            conversationMessages={conversationMessages}
            accountEmails={conversationAccountEmails}
            onReplyForMail={(mail) => openCompose('reply', mail)}
            onForwardForMail={(mail) => openCompose('forward', mail)}
            onDeleteMail={(mail) => {
              void handleDeleteForMail(mail).catch((err) => {
                setToasts((prev) => [...prev, {
                  id: Date.now().toString(),
                  type: 'error',
                  message: (err as Error).message || t('delete'),
                }]);
              });
            }}
            onArchiveMail={(mail) => {
              void handleArchiveForMail(mail);
            }}
            onToggleStarMail={(mail) => {
              void handleToggleStarForMail(mail);
            }}
            onError={(message: string) => setToasts((prev) => [...prev, { id: Date.now().toString(), type: 'error', message }])}
            isStarred={Boolean(displayedMail?.isStarred)}
            onToggleStar={() => {
              const target = displayedMail;
              if (target) {
                void handleToggleStarForMail(target);
              }
            }}
            onRescanMail={(mail) => {
              void handleRescanMail(mail);
            }}
            onArchive={() => {
              const target = displayedMail;
              if (target) {
                void handleArchiveForMail(target);
              }
            }}
            routingDiagnostics={routingDiagnostics}
          />
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} onClick={() => {}} />

        <ComposeDialog
          t={t}
          isOpen={showCompose}
          onClose={handleCloseCompose}
          onSaveDraft={handleSaveDraft}
          accounts={accountList}
          selectedAccount={composeSelectedAccount}
          onSend={handleSendMail}
          onDeleteDraft={handleDeleteComposeDraft}
          initialRecipients={composeInitialRecipients}
          initialSubject={composeInitialSubject}
          initialEditableBody={composeInitialBody}
          initialQuotedOriginal={composeQuotedOriginal}
          initialOutgoingAttachments={composeInitialOutgoingAttachments}
          initialHydrateKey={composeInitialHydrateKey}
          draftOptions={composeDraftOptions}
          recipientSuggestions={composeRecipientSuggestions}
          appLanguage={appLanguage}
          aiTargetLanguage={effectiveAiTargetLanguage}
          sourceLanguageSample={composeSourceLanguageSample}
        />

        <SettingsModal
          t={t}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          appLanguage={appLanguage}
          onAppLanguageChange={setAppLanguage}
          aiTargetLanguage={effectiveAiTargetLanguage}
          onAiTargetLanguageChange={() => {}}
          onAddAccount={() => {
            setShowSettings(false);
            setShowAddAccount(true);
          }}
          accounts={accountList}
          onDeleteAccount={handleDeleteAccount}
          currentAccountId={typeof currentAccount === 'string' ? 0 : (currentAccount?.id ?? 0)}
          aiAutoSort={aiAutoSort}
          onAiAutoSortChange={setAiAutoSort}
          aiScanMode={aiScanMode}
          onAiScanModeChange={setAiScanMode}
          aiLookback={aiLookback}
          onAiLookbackChange={setAiLookback}
          aiPrivacyMode={aiPrivacyMode}
          onAiPrivacyModeChange={setAiPrivacyMode}
          mailHistoryRange={mailFetchHistoryRange}
          onMailHistoryRangeChange={handleMailHistoryRangeChange}
          mailCacheRange={mailCacheRange}
          onMailCacheRangeChange={handleMailCacheRangeChange}
          autoFetchInterval={autoFetchMinutes}
          onAutoFetchIntervalChange={handleAutoFetchIntervalChange}
          githubNotificationsViewEnabled={githubNotificationsViewEnabled}
          onGithubNotificationsViewEnabledChange={handleGithubNotificationsViewEnabledChange}
          backupState={backupState}
          backupAccounts={accountList}
          backupFolders={backupFolders}
          onBackupAccountChange={handleBackupAccountChange}
          onBackupScopeChange={handleBackupScopeChange}
          onBackupFolderToggle={handleBackupFolderToggle}
          onBackupReadStateChange={(readState) => setBackupState((prev) => ({ ...prev, readState, lastResult: null }))}
          onBackupStartDateChange={(value) => setBackupState((prev) => ({ ...prev, startDate: value, lastResult: null }))}
          onBackupEndDateChange={(value) => setBackupState((prev) => ({ ...prev, endDate: value, lastResult: null }))}
          onBackupPickDestination={handleBackupPickDestination}
          onBackupPickImportSources={handleBackupPickImportSources}
          onBackupImportTargetFolderChange={(value) => setBackupState((prev) => ({ ...prev, importTargetFolderPath: value, lastResult: null }))}
          onStartBackupExport={handleStartBackupExport}
          onStartBackupImport={handleStartBackupImport}
          onCancelBackupExport={handleCancelBackupExport}
          onOpenBackupFolder={handleOpenBackupFolder}
        />

        <AddAccountDialog
          ref={addAccountDialogRef}
          t={t}
          appLanguage={appLanguage}
          isOpen={showAddAccount}
          onClose={() => setShowAddAccount(false)}
          onSaveAttempt={handleSaveAttempt}
          onTest={async () => ({ success: true, message: 'Test passed' })}
        />
      </div>
    </div>
  );
}

export default App;
