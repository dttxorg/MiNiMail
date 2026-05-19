import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Forward,
  Info,
  Languages,
  LoaderCircle,
  Mail,
  Paperclip,
  RefreshCw,
  Reply,
  Send,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { RendererMailDetail, RendererMailSummary, type LoadMailBodyFn } from '../hooks/useMail';
import { type AIEmailSourcePayload, type ContactWiki, useAI } from '../hooks/useAI';
import { normalizeAiLanguage, normalizeAppLanguage } from '../utils/aiLanguages';
import { extractReadableEmailText } from '../utils/emailContent';
import { getConversationCounterparty, isLocalSenderMail } from '../utils/mailConversations';
import type { MailRoutingDiagnostics } from '../utils/mailRoutingExplanationAdapter';
import { buildIconButtonStyle, buildPanelStyle, uiColor } from '../utils/uiDesignTokens';
import { parseKeyInfoItems, resolveKeyInfoFieldLabel, type KeyInfoItem } from '../utils/keyInfoItems';
import { folderMatches } from '../../shared/mailFolders';
import { translateHtmlPreservingMarkup } from '../../shared/email-ai/translateHtmlPreservingMarkup';
import { sanitizeMailHtml } from '../utils/mailHtmlSanitizer';
import { shouldRenderPlainTextBodyFallback } from '../utils/mailBodyFallback';
import { SenderAvatar } from './SenderAvatar';
import { getGitHubPriorityBadgeInfo } from '../utils/githubPriorityUi';

type MailLoadingState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';
type AIFunction = 'translate' | 'summarize' | 'reply';
type MailEmail = RendererMailSummary | RendererMailDetail;

type AssistantStatus = 'idle' | 'loading' | 'ready' | 'error';
type AttachmentActionStatus = 'downloading' | 'opening' | 'done' | 'error';

interface MailAssistantState {
  status: AssistantStatus;
  loadedForId: string | null;
  summary: string;
  actions: string[];
  quickReplies: string[];
  keyInfo: KeyInfoItem[];
  replyNeeded?: boolean | null;
  noReplyMessage?: string;
  replyCandidates?: string[];
  error?: string;
}

const EMPTY_ASSISTANT_STATE: MailAssistantState = {
  status: 'idle',
  loadedForId: null,
  summary: '',
  actions: [],
  quickReplies: [],
  keyInfo: [],
};

const ASSISTANT_RESULT_CACHE_LIMIT = 80;
const ASSISTANT_RESULT_TTL_MS = 10 * 60 * 1000;
const ASSISTANT_ERROR_COOLDOWN_MS = 45 * 1000;
const assistantResultCache = new Map<string, { state: MailAssistantState; expiresAt: number }>();

function getAssistantCacheKey(emailId: string, language: string, contactWikiKey = 'no-wiki'): string {
  return `${emailId}:${language}:${contactWikiKey}`;
}

function rememberAssistantState(key: string, state: MailAssistantState, ttlMs: number) {
  assistantResultCache.delete(key);
  assistantResultCache.set(key, {
    state,
    expiresAt: Date.now() + ttlMs,
  });

  while (assistantResultCache.size > ASSISTANT_RESULT_CACHE_LIMIT) {
    const oldestKey = assistantResultCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    assistantResultCache.delete(oldestKey);
  }
}

function readAssistantStateCache(key: string): MailAssistantState | null {
  const cached = assistantResultCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    assistantResultCache.delete(key);
    return null;
  }
  assistantResultCache.delete(key);
  assistantResultCache.set(key, cached);
  return {
    ...cached.state,
    quickReplies: normalizeQuickReplyItems(cached.state.quickReplies),
  };
}

function normalizeQuickReplyItems(value: unknown, maxItems = 3): string[] {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const candidate = record.text ?? record.reply ?? record.body ?? record.content ?? record.label ?? record.value;
        return typeof candidate === 'string' ? candidate.trim() : '';
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function compactWikiList(items: Array<string | undefined | null> | undefined, limit = 3): string {
  return (items || [])
    .map((item) => (item || '').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join('; ');
}

function buildContactWikiAiContext(wiki?: ContactWiki | null): string | undefined {
  if (!wiki) return undefined;
  const supportsRelationship = wiki.senderType === 'personal' || wiki.senderType === 'work_contact';
  const rows = [
    wiki.senderType ? `Sender type: ${wiki.senderType}` : '',
    wiki.confidence ? `Wiki confidence: ${wiki.confidence.level} (${wiki.confidence.score})` : '',
    wiki.summary ? `Role summary: ${wiki.summary}` : '',
    compactWikiList(wiki.recentContext) ? `Recent sender pattern: ${compactWikiList(wiki.recentContext, 4)}` : '',
    wiki.subscriptionValue ? `Subscription value: ${wiki.subscriptionValue}` : '',
    wiki.promotionPattern ? `Promotion pattern: ${wiki.promotionPattern}` : '',
    wiki.actionAdvice ? `Action advice: ${wiki.actionAdvice}` : '',
    wiki.readingValue ? `Reading value: ${wiki.readingValue}` : '',
    wiki.frequency ? `Frequency: ${wiki.frequency}` : '',
    wiki.serviceType ? `Service type: ${wiki.serviceType}` : '',
    wiki.userAction ? `User action pattern: ${wiki.userAction}` : '',
    wiki.riskAlert ? `Risk alert: ${wiki.riskAlert}` : '',
    compactWikiList(wiki.feedbackThemes) ? `Community feedback themes: ${compactWikiList(wiki.feedbackThemes)}` : '',
    compactWikiList(wiki.featureRequests) ? `Feature requests: ${compactWikiList(wiki.featureRequests)}` : '',
    compactWikiList(wiki.criticisms) ? `Criticisms: ${compactWikiList(wiki.criticisms)}` : '',
    compactWikiList(wiki.suggestedNextActions) ? `Suggested next actions: ${compactWikiList(wiki.suggestedNextActions)}` : '',
    wiki.replyEntry ? `Reply entry note: ${wiki.replyEntry}` : '',
    supportsRelationship && compactWikiList(wiki.openLoops) ? `Open loops: ${compactWikiList(wiki.openLoops)}` : '',
    supportsRelationship && compactWikiList(wiki.replyStyle) ? `Reply style: ${compactWikiList(wiki.replyStyle)}` : '',
    supportsRelationship && compactWikiList(wiki.commitments) ? `Commitments: ${compactWikiList(wiki.commitments)}` : '',
    supportsRelationship && compactWikiList(wiki.unresolvedQuestions) ? `Unresolved questions: ${compactWikiList(wiki.unresolvedQuestions)}` : '',
    supportsRelationship && wiki.relationshipProfile ? `Relationship profile: ${wiki.relationshipProfile}` : '',
  ].filter(Boolean);
  return rows.join('\n').slice(0, 1800) || undefined;
}

function parseAiLines(value: string, maxItems: number): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*鈥|\d+[.)]|[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乚+[銆?])\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/(^|\s)\*(?=\S)|(?<=\S)\*(\s|$)/g, '$1')
      .trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

const HANDLING_LEVEL_PREFIXES = [
  '无需处理',
  '可稍后处理',
  '需要跟进',
  '需要尽快处理',
  'No action',
  'Optional later',
  'Follow up',
  'Act soon',
  '対応不要',
  '後で対応可',
  'フォローが必要',
  '早めに対応',
  '조치 불필요',
  '나중에 처리 가능',
  '후속 조치 필요',
  '빠른 처리 필요',
  'Sin acción',
  'Opcional más tarde',
  'Seguimiento necesario',
  'Actuar pronto',
  'Aucune action',
  'Optionnel plus tard',
  'Suivi requis',
  'Agir bientôt',
  'Keine Aktion',
  'Später optional',
  'Nachfassen',
  'Bald handeln',
  'Действий не нужно',
  'Можно позже',
  'Нужно уточнить',
  'Действовать скоро',
];

const HANDLING_LEVEL_LINE_RE = /^(?:处理级别|handling level|対応レベル|처리 수준|nivel de gestión|niveau de traitement|bearbeitungsstufe|уровень обработки)\s*[:：]/i;
const ACTION_FIELD_PREFIX_RE = /^(?:行动|action|対応|조치|acción|aktion|действие)\s*[:：]\s*/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripRepeatedHandlingLevelPrefix(line: string): string {
  let nextLine = line;
  for (const prefix of HANDLING_LEVEL_PREFIXES) {
    const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\\s*(?:[|｜\\-—–:：]\\s*)+`, 'i');
    nextLine = nextLine.replace(prefixPattern, '');
  }
  return nextLine.replace(ACTION_FIELD_PREFIX_RE, '').trim();
}

function parseActionSuggestionLines(value: string, maxItems: number): string[] {
  return parseAiLines(value, 12)
    .filter((line) => !HANDLING_LEVEL_LINE_RE.test(line))
    .map((line) => stripRepeatedHandlingLevelPrefix(line))
    .filter(Boolean)
    .slice(0, maxItems);
}

const ROUTING_FOLDER_LABELS_ZH: Record<string, string> = {
  'Priority/High': '高优先级',
  'Priority/Needs Reply': '需要回复',
  'Priority/Risk': '风险关注',
  'Priority/Low': '低优先级',
  'GitHub/Needs Action': 'GitHub 待处理',
  'GitHub/Review Requests': 'GitHub 评审请求',
  'GitHub/Assigned to Me': 'GitHub 分配给我',
  'GitHub/Mentions': 'GitHub 提及我',
  'GitHub/CI and Failures': 'GitHub CI / 失败',
  'GitHub/Security': 'GitHub 安全',
  'GitHub/Low Priority': 'GitHub 低优先级',
  'GitHub/Archived Updates': 'GitHub 归档更新',
};

function localizeMatchedFolder(folder: string | undefined, appLanguage: string): string | undefined {
  if (!folder) return undefined;
  return appLanguage === 'zh' ? (ROUTING_FOLDER_LABELS_ZH[folder] || folder) : folder;
}

function localizeDepth(depth: MailRoutingDiagnostics['recommended_depth'], appLanguage: string): string {
  if (appLanguage !== 'zh') return depth;
  if (depth === 'light') return '轻量';
  if (depth === 'normal') return '标准';
  return '深度';
}

function buildRoutingTooltip(diagnostics: MailRoutingDiagnostics | undefined, appLanguage: string): string | undefined {
  if (!diagnostics) return undefined;

  const lines = [
    `命中文件夹：${localizeMatchedFolder(diagnostics.matched_folder, 'zh') || diagnostics.matched_folder}`,
    diagnostics.top_routing_reasons?.length ? `主要原因：${diagnostics.top_routing_reasons.slice(0, 2).join('；')}` : '',
    `总分：${diagnostics.key_scores.total_light_score}`,
    `建议深度：${localizeDepth(diagnostics.recommended_depth, appLanguage)}`,
  ].filter(Boolean);

  if (diagnostics.force_upgrade_reason) {
    lines.push(`强制升级：${diagnostics.force_upgrade_reason}`);
  }

  return lines.join('\n');
}

interface MailDetailProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  email: MailEmail | null;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onBack?: () => void;
  onShare?: (blob: Blob, filename: string) => void;
  aiTargetLanguage: string;
  onReplyWithSuggestion: (content: string, mode?: 'reply' | 'forward', source?: MailEmail | null) => void;
  onSaveQuickPhrase?: (content: string) => Promise<void> | void;
  loadMailBody: LoadMailBodyFn;
  mailLoadingState?: MailLoadingState;
  mailError?: string | null;
  onRetry?: () => void;
  conversationMessages?: RendererMailSummary[];
  accountEmails?: string[];
  onReplyForMail?: (mail: MailEmail) => void;
  onForwardForMail?: (mail: MailEmail) => void;
  onDeleteMail?: (mail: RendererMailSummary) => void;
  onArchiveMail?: (mail: RendererMailSummary) => void;
  onToggleStarMail?: (mail: RendererMailSummary) => void;
  onRescanMail?: (mail: RendererMailSummary) => void;
  onError?: (message: string) => void;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onArchive?: () => void;
  routingDiagnostics?: Record<string, MailRoutingDiagnostics | undefined>;
}

function isDetail(email: MailEmail): email is RendererMailDetail {
  return 'bodyHtml' in email || 'bodyText' in email;
}

function hasInlineBody(email: MailEmail): boolean {
  return Boolean(
    ('bodyHtml' in email && email.bodyHtml?.trim()) ||
    ('bodyText' in email && email.bodyText?.trim())
  );
}

function buildInlineDetail(email: MailEmail): RendererMailDetail | null {
  if (!hasInlineBody(email)) return null;
  const summary = email as RendererMailSummary;
  return {
    ...summary,
    bodyHtml: 'bodyHtml' in email ? email.bodyHtml : undefined,
    bodyText: 'bodyText' in email ? email.bodyText : undefined,
    attachments: summary.attachments ?? [],
    headers: isDetail(email) ? email.headers ?? {} : {},
  };
}

function getUi(appLanguage: string) {
  const labels = {
    zh: {
      loadingContent: '正在加载邮件正文...', timeout: '获取邮件正文超时', retry: '重试', emptyBody: '暂无内容', copyBodyFailed: '复制正文失败', copyAiFailed: '复制 AI 结果失败', aiFailed: 'AI 处理失败', addStar: '添加星标', removeStar: '取消星标', archive: '归档', removeArchive: '移除归档', removeSpam: '移出垃圾邮件', aiAssistant: 'AI 助手', sendingLabel: '发送中', sentLabel: '已发送', failedLabel: '发送失败', statusLabel: '状态', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: '收件人', fromLabel: '发件人', dateLabel: '日期', remoteImagesBlocked: '已拦截远程图片，防止跟踪像素泄露打开状态。', showRemoteImages: '显示远程图片', attachmentsLabel: '附件', downloadAttachment: '下载', openAttachment: '打开', downloadingAttachment: '下载中', openingAttachment: '打开中', attachmentActionFailed: '附件处理失败',
    },
    en: {
      loadingContent: 'Loading message content...', timeout: 'Timed out while loading message content', retry: 'Retry', emptyBody: 'No content', copyBodyFailed: 'Failed to copy email body', copyAiFailed: 'Failed to copy AI result', aiFailed: 'AI processing failed', addStar: 'Add star', removeStar: 'Remove star', archive: 'Archive', removeArchive: 'Remove from archive', removeSpam: 'Move out of spam', aiAssistant: 'AI Assistant', sendingLabel: 'Sending', sentLabel: 'Sent', failedLabel: 'Failed', statusLabel: 'Status', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: 'To', fromLabel: 'From', dateLabel: 'Date', remoteImagesBlocked: 'Remote images are blocked to prevent tracking pixels from leaking open activity.', showRemoteImages: 'Show remote images', attachmentsLabel: 'Attachments', downloadAttachment: 'Download', openAttachment: 'Open', downloadingAttachment: 'Downloading', openingAttachment: 'Opening', attachmentActionFailed: 'Attachment action failed',
    },
    ja: {
      loadingContent: 'メール本文を読み込んでいます...', timeout: 'メール本文の取得がタイムアウトしました', retry: '再試行', emptyBody: '内容がありません', copyBodyFailed: '本文をコピーできませんでした', copyAiFailed: 'AI 結果をコピーできませんでした', aiFailed: 'AI 処理に失敗しました', addStar: 'スターを付ける', removeStar: 'スターを外す', archive: 'アーカイブ', removeArchive: 'アーカイブから戻す', removeSpam: '迷惑メールから移動', aiAssistant: 'AI アシスタント', sendingLabel: '送信中', sentLabel: '送信済み', failedLabel: '送信失敗', statusLabel: '状態', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: '宛先', fromLabel: '差出人', dateLabel: '日付', remoteImagesBlocked: '開封状況の追跡を防ぐため、リモート画像をブロックしました。', showRemoteImages: 'リモート画像を表示', attachmentsLabel: '添付ファイル', downloadAttachment: 'ダウンロード', openAttachment: '開く', downloadingAttachment: 'ダウンロード中', openingAttachment: '開いています', attachmentActionFailed: '添付ファイルの処理に失敗しました',
    },
    ko: {
      loadingContent: '메일 본문을 불러오는 중...', timeout: '메일 본문 가져오기 시간 초과', retry: '다시 시도', emptyBody: '내용 없음', copyBodyFailed: '본문을 복사하지 못했습니다', copyAiFailed: 'AI 결과를 복사하지 못했습니다', aiFailed: 'AI 처리 실패', addStar: '별표 추가', removeStar: '별표 제거', archive: '보관', removeArchive: '보관 해제', removeSpam: '스팸에서 이동', aiAssistant: 'AI 도우미', sendingLabel: '전송 중', sentLabel: '전송됨', failedLabel: '전송 실패', statusLabel: '상태', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: '받는 사람', fromLabel: '보낸 사람', dateLabel: '날짜', remoteImagesBlocked: '열람 추적을 막기 위해 원격 이미지를 차단했습니다.', showRemoteImages: '원격 이미지 표시', attachmentsLabel: '첨부파일', downloadAttachment: '다운로드', openAttachment: '열기', downloadingAttachment: '다운로드 중', openingAttachment: '여는 중', attachmentActionFailed: '첨부파일 처리 실패',
    },
    es: {
      loadingContent: 'Cargando contenido del correo...', timeout: 'Tiempo agotado al cargar el correo', retry: 'Reintentar', emptyBody: 'Sin contenido', copyBodyFailed: 'No se pudo copiar el cuerpo', copyAiFailed: 'No se pudo copiar el resultado de IA', aiFailed: 'Error de IA', addStar: 'Añadir estrella', removeStar: 'Quitar estrella', archive: 'Archivar', removeArchive: 'Quitar de archivo', removeSpam: 'Sacar de spam', aiAssistant: 'Asistente de IA', sendingLabel: 'Enviando', sentLabel: 'Enviado', failedLabel: 'Falló', statusLabel: 'Estado', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: 'Para', fromLabel: 'De', dateLabel: 'Fecha', remoteImagesBlocked: 'Se bloquearon imágenes remotas para evitar píxeles de seguimiento.', showRemoteImages: 'Mostrar imágenes remotas', attachmentsLabel: 'Adjuntos', downloadAttachment: 'Descargar', openAttachment: 'Abrir', downloadingAttachment: 'Descargando', openingAttachment: 'Abriendo', attachmentActionFailed: 'Error al procesar el adjunto',
    },
    fr: {
      loadingContent: 'Chargement du contenu du mail...', timeout: 'Délai dépassé lors du chargement', retry: 'Réessayer', emptyBody: 'Aucun contenu', copyBodyFailed: 'Impossible de copier le corps', copyAiFailed: 'Impossible de copier le résultat IA', aiFailed: 'Échec du traitement IA', addStar: 'Ajouter une étoile', removeStar: 'Retirer l’étoile', archive: 'Archiver', removeArchive: 'Retirer de l’archive', removeSpam: 'Retirer du spam', aiAssistant: 'Assistant IA', sendingLabel: 'Envoi', sentLabel: 'Envoyé', failedLabel: 'Échec', statusLabel: 'Statut', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: 'À', fromLabel: 'De', dateLabel: 'Date', remoteImagesBlocked: 'Les images distantes sont bloquées pour éviter les pixels de suivi.', showRemoteImages: 'Afficher les images distantes', attachmentsLabel: 'Pièces jointes', downloadAttachment: 'Télécharger', openAttachment: 'Ouvrir', downloadingAttachment: 'Téléchargement', openingAttachment: 'Ouverture', attachmentActionFailed: 'Échec du traitement de la pièce jointe',
    },
    de: {
      loadingContent: 'E-Mail-Inhalt wird geladen...', timeout: 'Zeitüberschreitung beim Laden', retry: 'Erneut versuchen', emptyBody: 'Kein Inhalt', copyBodyFailed: 'E-Mail-Text konnte nicht kopiert werden', copyAiFailed: 'KI-Ergebnis konnte nicht kopiert werden', aiFailed: 'KI-Verarbeitung fehlgeschlagen', addStar: 'Stern hinzufügen', removeStar: 'Stern entfernen', archive: 'Archivieren', removeArchive: 'Aus Archiv entfernen', removeSpam: 'Aus Spam entfernen', aiAssistant: 'KI-Assistent', sendingLabel: 'Wird gesendet', sentLabel: 'Gesendet', failedLabel: 'Fehlgeschlagen', statusLabel: 'Status', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: 'An', fromLabel: 'Von', dateLabel: 'Datum', remoteImagesBlocked: 'Remote-Bilder wurden blockiert, um Tracking-Pixel zu verhindern.', showRemoteImages: 'Remote-Bilder anzeigen', attachmentsLabel: 'Anhänge', downloadAttachment: 'Herunterladen', openAttachment: 'Öffnen', downloadingAttachment: 'Wird heruntergeladen', openingAttachment: 'Wird geöffnet', attachmentActionFailed: 'Anhang konnte nicht verarbeitet werden',
    },
    ru: {
      loadingContent: 'Загрузка содержимого письма...', timeout: 'Время загрузки письма истекло', retry: 'Повторить', emptyBody: 'Нет содержимого', copyBodyFailed: 'Не удалось скопировать текст письма', copyAiFailed: 'Не удалось скопировать результат ИИ', aiFailed: 'Ошибка обработки ИИ', addStar: 'Добавить звезду', removeStar: 'Убрать звезду', archive: 'Архивировать', removeArchive: 'Убрать из архива', removeSpam: 'Убрать из спама', aiAssistant: 'ИИ-ассистент', sendingLabel: 'Отправка', sentLabel: 'Отправлено', failedLabel: 'Ошибка', statusLabel: 'Статус', noMailEmoji: '📭', errorEmoji: '⚠️', toLabel: 'Кому', fromLabel: 'От', dateLabel: 'Дата', remoteImagesBlocked: 'Удалённые изображения заблокированы, чтобы предотвратить трекинг.', showRemoteImages: 'Показать удалённые изображения', attachmentsLabel: 'Вложения', downloadAttachment: 'Скачать', openAttachment: 'Открыть', downloadingAttachment: 'Скачивание', openingAttachment: 'Открытие', attachmentActionFailed: 'Не удалось обработать вложение',
    },
  } as const;

  return labels[normalizeAppLanguage(appLanguage)] ?? labels.en;
}

function getEmptyMailCopy(appLanguage: string): { title: string; subtitle: string } {
  switch (normalizeAppLanguage(appLanguage)) {
    case 'en':
      return { title: 'No mail yet', subtitle: 'No messages here for now. Take a coffee break and check back later.' };
    case 'ja':
      return { title: 'メールはありません', subtitle: '今は新しいメールがありません。少し休憩して、あとでまた確認しましょう。' };
    case 'ko':
      return { title: '메일이 없습니다', subtitle: '현재 새 메일이 없습니다. 잠시 쉬었다가 나중에 다시 확인하세요.' };
    case 'es':
      return { title: 'Sin correos', subtitle: 'Por ahora no hay mensajes. Toma un café y vuelve más tarde.' };
    case 'fr':
      return { title: 'Aucun mail', subtitle: 'Aucun nouveau message pour le moment. Faites une pause et revenez plus tard.' };
    case 'de':
      return { title: 'Keine E-Mails', subtitle: 'Hier gibt es gerade keine neuen Nachrichten. Hol dir einen Kaffee und schau später wieder vorbei.' };
    case 'ru':
      return { title: 'Писем нет', subtitle: 'Пока новых писем нет. Сделайте паузу и проверьте позже.' };
    default:
      return { title: '暂无邮件', subtitle: '暂时没有新邮件，去喝杯咖啡，稍后再回来查看吧。' };
  }
}

function EmptyMailState({ appLanguage }: { appLanguage: string }) {
  const copy = getEmptyMailCopy(appLanguage);

  return (
    <div className="empty-mail-cosmos flex-1 h-full min-h-0 flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: '#07101D' }}>
      <div className="empty-mail-stars" aria-hidden="true" />
      <div className="empty-mail-aurora" aria-hidden="true" />
      <div className="relative z-10 flex flex-col items-center text-center px-8">
        <div className="empty-mail-orbit-wrap mb-10" aria-hidden="true">
          <div className="empty-mail-orbit empty-mail-orbit-one" />
          <div className="empty-mail-orbit empty-mail-orbit-two" />
          <div className="empty-mail-rings" />
          <div className="empty-mail-envelope">
            <Mail className="w-24 h-24" strokeWidth={1.35} />
          </div>
        </div>
        <h2 className="text-[44px] font-semibold tracking-[0.12em] text-white drop-shadow-[0_0_22px_rgba(255,255,255,0.25)]">
          {copy.title}
        </h2>
        <p className="mt-4 text-[20px] tracking-[0.08em] max-w-3xl" style={{ color: 'rgba(226,232,240,0.76)' }}>
          {copy.subtitle}
        </p>
      </div>
    </div>
  );
}
function formatRelativeTime(
  date: Date,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('justNow');
  if (diffMins < 60) return t('minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('daysAgo', { count: diffDays });

  return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

function formatAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToMailHtml(value: string): string {
  const blocks = value
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtmlText(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<div class="minimail-translated-text">${blocks || '<p></p>'}</div>`;
}

function MailBody({
  bodyHtml,
  bodyText,
  snippet,
  loading,
  error,
  ui,
  mailError,
  onRetry,
  allowRemoteImages = false,
  onAllowRemoteImages,
}: {
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  loading: boolean;
  error: boolean;
  ui: ReturnType<typeof getUi>;
  mailError?: string | null;
  onRetry?: () => void;
  allowRemoteImages?: boolean;
  onAllowRemoteImages?: () => void;
}) {
  const sanitizedBody = useMemo(() => {
    if (!bodyHtml) return null;
    return sanitizeMailHtml(bodyHtml, {
      allowRemoteImages,
      remoteImagePlaceholderText: ui.showRemoteImages,
    });
  }, [allowRemoteImages, bodyHtml, ui.showRemoteImages]);
  const usePlainTextFallback = shouldRenderPlainTextBodyFallback({
    bodyHtml: sanitizedBody?.html || bodyHtml,
    bodyText,
  });

  const handleExternalLinkClick = async (event: React.MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    const href = link?.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) return;

    event.preventDefault();
    event.stopPropagation();

    const result = await window.electronAPI.openExternal(href);
    if (!result.success) {
      console.error('[MailBody] failed to open external link:', result.error || href);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8" style={{ color: '#636366' }}>
        <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: 'currentColor', display: 'flex' }} strokeWidth={1.8} />
        <span className="text-[12px]">{ui.loadingContent}</span>
      </div>
    );
  }

  if (bodyText && usePlainTextFallback) {
    return (
      <pre className="mail-body-content mail-body-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
        {bodyText}
      </pre>
    );
  }

  if (bodyHtml) {
    return (
      <div className="space-y-3">
        {sanitizedBody && sanitizedBody.blockedRemoteImageCount > 0 && !allowRemoteImages && (
          <div
            className="mail-remote-image-notice flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[12px]"
            style={{ color: '#c7d2fe', backgroundColor: 'rgba(59,130,246,0.10)', border: '1px solid rgba(147,197,253,0.24)' }}
          >
            <span>{ui.remoteImagesBlocked}</span>
            <button
              type="button"
              onClick={onAllowRemoteImages}
              className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer"
              style={{ color: '#e0f2fe', backgroundColor: 'rgba(59,130,246,0.18)', border: '1px solid rgba(147,197,253,0.32)' }}
            >
              {ui.showRemoteImages}
            </button>
          </div>
        )}
        <div className="mail-body-content mail-body-html" onClickCapture={handleExternalLinkClick}>
          <div dangerouslySetInnerHTML={{ __html: sanitizedBody?.html || '' }} />
        </div>
      </div>
    );
  }

  if (bodyText) {
    return (
      <pre className="mail-body-content mail-body-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
        {bodyText}
      </pre>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]" style={{ backgroundColor: 'rgba(255,159,10,0.1)', color: '#ff9f0a' }}>
          {ui.errorEmoji} {mailError || ui.timeout}
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-auto text-[11px] px-2 py-0.5 rounded-md cursor-pointer"
              style={{ backgroundColor: '#3a3a3d', color: '#a1a1a6' }}
            >
              {ui.retry}
            </button>
          )}
        </div>
        <pre className="mail-body-content mail-body-text" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {snippet || ui.emptyBody}
        </pre>
      </div>
    );
  }

  return (
    <pre className="mail-body-content mail-body-text" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
      {snippet || ui.emptyBody}
    </pre>
  );
}

function ConversationMessageCard({
  email,
  initialDetail,
  defaultExpanded,
  accountEmails,
  t,
  locale,
  ui,
  aiTargetLanguage,
  initialLoading = false,
  initialError = false,
  mailError,
  onRetry,
  onReply,
  onForward,
  onDelete,
  onArchive,
  onToggleStar,
  onRescan,
  onReplyWithSuggestion,
  onSaveQuickPhrase,
  loadMailBody,
      onError,
      routingDiagnostics,
      contactWiki,
}: {
  email: RendererMailSummary;
  initialDetail?: RendererMailDetail | null;
  defaultExpanded: boolean;
  accountEmails: string[];
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
  ui: ReturnType<typeof getUi>;
  aiTargetLanguage: string;
  initialLoading?: boolean;
  initialError?: boolean;
  mailError?: string | null;
  onRetry?: () => void;
  onReply: (mail: MailEmail) => void;
  onForward: (mail: MailEmail) => void;
  onDelete: (mail: RendererMailSummary) => void;
  onArchive?: (mail: RendererMailSummary) => void;
  onToggleStar: (mail: RendererMailSummary) => void;
  onRescan?: (mail: RendererMailSummary) => void;
  onReplyWithSuggestion: (content: string, mode?: 'reply' | 'forward', source?: MailEmail | null) => void;
  onSaveQuickPhrase?: (content: string) => Promise<void> | void;
  loadMailBody: LoadMailBodyFn;
  onError?: (message: string) => void;
  routingDiagnostics?: MailRoutingDiagnostics;
  contactWiki?: ContactWiki | null;
}) {
  const {
    translate,
    translateSegments,
    summarize,
    summarizeDetailed,
    suggestReplyDetailed,
    suggestContactReplyDetailed,
    suggestActionsDetailed,
    suggestQuickRepliesDetailed,
    extractKeyInfo,
    getContactBehaviorSettings,
    recordContactMailInteraction,
    loading: aiApiLoading,
  } = useAI();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const inlineDetail = useMemo(() => buildInlineDetail(email), [email]);
  const resolvedInitialDetail = initialDetail ?? inlineDetail;
  const [detail, setDetail] = useState<RendererMailDetail | null>(resolvedInitialDetail);
  const [loading, setLoading] = useState(initialLoading && !resolvedInitialDetail);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [translatedHtml, setTranslatedHtml] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFunction, setAiFunction] = useState<AIFunction | null>(null);
  const [isTranslated, setIsTranslated] = useState(false);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRoutingTooltip, setShowRoutingTooltip] = useState(false);
  const [assistantState, setAssistantState] = useState<MailAssistantState>(EMPTY_ASSISTANT_STATE);
  const [quickReplyDraft, setQuickReplyDraft] = useState('');
  const [attachmentDownloadStates, setAttachmentDownloadStates] = useState<Record<string, { status: AttachmentActionStatus; error?: string }>>({});
  const detailRequestRef = useRef<Promise<MailEmail> | null>(null);
  const contactWikiAiContext = useMemo(() => buildContactWikiAiContext(contactWiki), [contactWiki]);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, email.id]);

  useEffect(() => {
    detailRequestRef.current = null;
    setDetail(resolvedInitialDetail);
  }, [resolvedInitialDetail, email.id]);

  useEffect(() => {
    setLoading(initialLoading && !resolvedInitialDetail);
  }, [email.id, initialLoading, resolvedInitialDetail]);

  useEffect(() => {
    setAssistantState(EMPTY_ASSISTANT_STATE);
    setQuickReplyDraft('');
    setAiResult(null);
    setTranslatedHtml(null);
    setAiFunction(null);
    setIsTranslated(false);
    setAllowRemoteImages(false);
    setAttachmentDownloadStates({});
  }, [email.id]);

  const isLocalSender = isLocalSenderMail(email, accountEmails);
  const isFailed = email.deliveryState === 'failed';
  const isScheduled = email.deliveryState === 'scheduled';
  const cardBg = isFailed
    ? 'rgba(255, 69, 58, 0.16)'
    : isLocalSender
      ? 'rgba(124, 58, 237, 0.18)'
      : '#0F172A';
  const bodyBg = isFailed
    ? 'rgba(255, 69, 58, 0.12)'
    : isLocalSender
      ? 'rgba(124, 58, 237, 0.10)'
      : '#0A1220';
  const statusTone = isFailed ? '#ff453a' : isScheduled ? '#ffcc00' : '#34c759';
  const scheduledLabels = {
    zh: '等待发送',
    en: 'Scheduled',
    ja: '送信待ち',
    ko: '예약됨',
    es: 'Programado',
    fr: 'Planifié',
    de: 'Geplant',
    ru: 'Запланировано',
  } as const;
  const statusLabel = email.deliveryState === 'scheduled'
    ? (scheduledLabels[normalizeAppLanguage(locale)] ?? scheduledLabels.en)
    : email.deliveryState === 'sending'
    ? ui.sendingLabel
    : email.deliveryState === 'failed'
      ? ui.failedLabel
      : email.deliveryState === 'sent'
        ? ui.sentLabel
        : '';
  const bodyError = initialError && !detail && !loading;
  const isArchived = folderMatches(email.folder, 'archive');
  const isSpam = folderMatches(email.folder, 'spam');
  const showAssistant = !isLocalSender;
  const normalizedLanguage = normalizeAppLanguage(locale);
  const matchedFolderLabel = localizeMatchedFolder(routingDiagnostics?.matched_folder, normalizedLanguage);
  const routingTooltip = buildRoutingTooltip(routingDiagnostics, normalizedLanguage);
  const githubPriorityBadge = routingDiagnostics?.github_priority_level
    ? getGitHubPriorityBadgeInfo(
        routingDiagnostics.github_priority_level,
        normalizedLanguage,
        routingDiagnostics.github_friendly_text,
        routingDiagnostics.github_safe_summary,
      )
    : null;
  const assistantLabelsByLanguage = {
    zh: {
      title: 'AI 智能助手',
      summary: '邮件总结',
      actions: '行动建议',
      quickReplies: '快速回复',
      keyInfo: '关键信息提取',
      loading: 'AI 正在分析这封邮件...',
      retry: '重新分析',
      unavailable: 'AI 助手暂不可用',
      noActions: '暂无明确行动建议',
      noKeyInfo: '暂无可提取的关键信息',
      noReplyNeeded: '无需回复',
      useReply: '使用这条回复',
      saveQuickPhrase: '保存为快捷短语',
      customReplyPlaceholder: '告诉 AI 如何回复...',
      original: '原文',
      forwardIntro: 'AI 转发说明',
    },
    en: {
      title: 'AI Assistant',
      summary: 'Email summary',
      actions: 'Action suggestions',
      quickReplies: 'Quick replies',
      keyInfo: 'Key information',
      loading: 'AI is analyzing this email...',
      retry: 'Analyze again',
      unavailable: 'AI assistant unavailable',
      noActions: 'No clear action suggestions',
      noKeyInfo: 'No key information extracted',
      noReplyNeeded: 'No reply needed',
      useReply: 'Use this reply',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'Tell AI how to reply...',
      original: 'Original',
      forwardIntro: 'AI forward note',
    },
    ja: {
      title: 'AI アシスタント',
      summary: 'メール要約',
      actions: 'アクション提案',
      quickReplies: 'クイック返信',
      keyInfo: '重要情報の抽出',
      loading: 'AI がこのメールを分析しています...',
      retry: '再分析',
      unavailable: 'AI アシスタントは現在利用できません',
      noActions: '明確なアクション提案はありません',
      noKeyInfo: '抽出できる重要情報はありません',
      noReplyNeeded: '返信は不要です',
      useReply: 'この返信を使用',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'AI に返信内容を伝える...',
      original: '原文',
      forwardIntro: 'AI 転送メモ',
    },
    ko: {
      title: 'AI 도우미',
      summary: '메일 요약',
      actions: '작업 제안',
      quickReplies: '빠른 답장',
      keyInfo: '핵심 정보 추출',
      loading: 'AI가 이 메일을 분석하고 있습니다...',
      retry: '다시 분석',
      unavailable: 'AI 도우미를 사용할 수 없습니다',
      noActions: '명확한 작업 제안이 없습니다',
      noKeyInfo: '추출할 핵심 정보가 없습니다',
      noReplyNeeded: '답장이 필요하지 않습니다',
      useReply: '이 답장 사용',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'AI에게 답장 방향을 알려주세요...',
      original: '원문',
      forwardIntro: 'AI 전달 메모',
    },
    es: {
      title: 'Asistente de IA',
      summary: 'Resumen del correo',
      actions: 'Sugerencias de acción',
      quickReplies: 'Respuestas rápidas',
      keyInfo: 'Información clave',
      loading: 'La IA está analizando este correo...',
      retry: 'Analizar de nuevo',
      unavailable: 'Asistente de IA no disponible',
      noActions: 'No hay acciones claras sugeridas',
      noKeyInfo: 'No hay información clave para extraer',
      noReplyNeeded: 'No hace falta responder',
      useReply: 'Usar esta respuesta',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'Indica a la IA cómo responder...',
      original: 'Original',
      forwardIntro: 'Nota de reenvío de IA',
    },
    fr: {
      title: 'Assistant IA',
      summary: 'Résumé du mail',
      actions: 'Suggestions d’action',
      quickReplies: 'Réponses rapides',
      keyInfo: 'Informations clés',
      loading: 'L’IA analyse ce mail...',
      retry: 'Analyser à nouveau',
      unavailable: 'Assistant IA indisponible',
      noActions: 'Aucune action claire suggérée',
      noKeyInfo: 'Aucune information clé à extraire',
      noReplyNeeded: 'Aucune réponse nécessaire',
      useReply: 'Utiliser cette réponse',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'Indiquez à l’IA comment répondre...',
      original: 'Original',
      forwardIntro: 'Note de transfert IA',
    },
    de: {
      title: 'KI-Assistent',
      summary: 'E-Mail-Zusammenfassung',
      actions: 'Handlungsvorschläge',
      quickReplies: 'Schnellantworten',
      keyInfo: 'Wichtige Informationen',
      loading: 'KI analysiert diese E-Mail...',
      retry: 'Erneut analysieren',
      unavailable: 'KI-Assistent nicht verfügbar',
      noActions: 'Keine klaren Handlungsvorschläge',
      noKeyInfo: 'Keine wichtigen Informationen extrahierbar',
      noReplyNeeded: 'Keine Antwort erforderlich',
      useReply: 'Diese Antwort verwenden',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'Sag der KI, wie sie antworten soll...',
      original: 'Original',
      forwardIntro: 'KI-Weiterleitungsnotiz',
    },
    ru: {
      title: 'ИИ-ассистент',
      summary: 'Сводка письма',
      actions: 'Рекомендации',
      quickReplies: 'Быстрые ответы',
      keyInfo: 'Ключевая информация',
      loading: 'ИИ анализирует это письмо...',
      retry: 'Анализировать снова',
      unavailable: 'ИИ-ассистент недоступен',
      noActions: 'Нет явных рекомендаций',
      noKeyInfo: 'Нет ключевой информации для извлечения',
      noReplyNeeded: 'Ответ не требуется',
      useReply: 'Использовать этот ответ',
      saveQuickPhrase: 'Save as quick phrase',
      customReplyPlaceholder: 'Подскажите ИИ, как ответить...',
      original: 'Оригинал',
      forwardIntro: 'Заметка ИИ для пересылки',
    },
  } as const;
  const assistantLabels = assistantLabelsByLanguage[normalizedLanguage] ?? assistantLabelsByLanguage.en;
  const translateButtonLabel = isTranslated ? assistantLabels.original : t('translate');
  const contactWikiLabels = normalizedLanguage === 'zh'
    ? {
      title: '联系人 Wiki',
      loading: '正在构建联系人知识库...',
      build: '生成',
      rebuild: '重建',
      disabled: '在 AI 设置中开启历史邮件知识库后可用',
      unavailable: '联系人知识库暂不可用',
      recent: '近期脉络',
      openLoops: '待办/风险',
      style: '回复风格',
      profile: '关系画像',
      projects: '活跃事项',
      preferences: '偏好',
      userValue: '对我的价值',
      userInsights: '用户洞察',
      engagement: '行为画像',
      subscriptionValue: '订阅价值',
      promotionPattern: '促销规律',
      bestDeal: '历史低价',
      actionAdvice: '阅读建议',
      readingValue: '阅读价值',
      frequency: '频率',
      contentStability: '内容稳定性',
      serviceType: '服务类型',
      userAction: '建议动作',
      riskAlert: '风险提示',
      feedbackThemes: '反馈主题',
      featureRequests: '功能请求',
      criticisms: '批评/问题',
      praises: '正向反馈',
      suggestedNextActions: '建议跟进',
      replyEntry: '互动入口',
      diagnostics: '诊断',
      insufficientBehavior: '暂无足够行为数据',
      feedbackUseful: '有用',
      feedbackInaccurate: '不准',
      feedbackNotRelevant: '不相关',
      feedbackTooLong: '太长',
      feedbackSaved: '已记录',
      expand: '展开',
      collapse: '收起',
    }
    : {
      title: 'Contact Wiki',
      loading: 'Building contact knowledge...',
      build: 'Build',
      rebuild: 'Rebuild',
      disabled: 'Enable historical mail knowledge in AI settings',
      unavailable: 'Contact wiki unavailable',
      recent: 'Recent context',
      openLoops: 'Open loops',
      style: 'Reply style',
      profile: 'Relationship',
      projects: 'Active items',
      preferences: 'Preferences',
      userValue: 'Value for me',
      userInsights: 'User insights',
      engagement: 'Engagement',
      subscriptionValue: 'Subscription value',
      promotionPattern: 'Promotion pattern',
      bestDeal: 'Best deal so far',
      actionAdvice: 'Action advice',
      readingValue: 'Reading value',
      frequency: 'Frequency',
      contentStability: 'Content stability',
      serviceType: 'Service type',
      userAction: 'Suggested action',
      riskAlert: 'Risk alert',
      feedbackThemes: 'Feedback themes',
      featureRequests: 'Feature requests',
      criticisms: 'Criticism / issues',
      praises: 'Positive feedback',
      suggestedNextActions: 'Suggested next actions',
      replyEntry: 'Reply entry',
      diagnostics: 'Diagnostics',
      insufficientBehavior: 'Not enough behavior data yet',
      feedbackUseful: 'Useful',
      feedbackInaccurate: 'Inaccurate',
      feedbackNotRelevant: 'Not relevant',
      feedbackTooLong: 'Too long',
      feedbackSaved: 'Saved',
      expand: 'Expand',
      collapse: 'Collapse',
    };
  const contactEmail = useMemo(
    () => getConversationCounterparty(email, accountEmails),
    [accountEmails, email]
  );
  const showAiReplyButton = !isLocalSender;
  const getKeyInfoFieldLabel = useCallback((item: KeyInfoItem) => {
    return resolveKeyInfoFieldLabel(item, normalizedLanguage, t);
  }, [normalizedLanguage, t]);

  const ensureDetailLoaded = useCallback(async (): Promise<MailEmail> => {
    if (detail) return detail;
    if (detailRequestRef.current) return detailRequestRef.current;

    const request = (async (): Promise<MailEmail> => {
      setLoading(true);
      try {
        const bodyResult = await loadMailBody(email.accountId, email.uid, email.folder);
        if (bodyResult.detail || bodyResult.bodyHtml || bodyResult.bodyText) {
          const nextDetail = {
            ...email,
            ...bodyResult.detail,
            bodyHtml: bodyResult.bodyHtml,
            bodyText: bodyResult.bodyText,
            folder: email.folder,
            accountId: email.accountId,
            snippet: bodyResult.detail?.snippet ?? email.snippet,
            hasAttachments: (bodyResult.detail?.attachments?.length || bodyResult.attachments?.length) ? true : email.hasAttachments,
            isRead: bodyResult.detail?.flags?.includes('\\Seen') ?? email.isRead,
            isStarred: bodyResult.detail?.flags?.includes('\\Flagged') ?? email.isStarred,
            messageId: bodyResult.detail?.messageId ?? email.messageId,
            inReplyTo: bodyResult.detail?.inReplyTo ?? email.inReplyTo,
            references: bodyResult.detail?.references ?? email.references,
            attachments: bodyResult.detail?.attachments ?? bodyResult.attachments ?? [],
            headers: bodyResult.detail?.headers ?? {},
          };
          setDetail(nextDetail);
          return nextDetail;
        }
      } catch (err) {
        console.error('[ConversationMessageCard] fetchFull failed:', err);
      } finally {
        setLoading(false);
        detailRequestRef.current = null;
      }

      return detail ?? email;
    })();

    detailRequestRef.current = request;
    return request;
  }, [detail, email, loadMailBody]);

  useEffect(() => {
    if (!expanded || !contactEmail || !/@/.test(contactEmail)) return;
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getContactBehaviorSettings();
        if (cancelled || !settings.enabled) return;
        await recordContactMailInteraction({
          accountId: email.accountId,
          mailId: email.id,
          contactEmail,
          eventType: 'open',
          eventValue: { count: 1 },
        });
      } catch {
        // Behavior learning is optional and must not affect reading mail.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactEmail, email.accountId, email.id, expanded, getContactBehaviorSettings, recordContactMailInteraction]);

  useEffect(() => {
    if (expanded && !detail && !loading) {
      void ensureDetailLoaded();
    }
  }, [detail, email.id, ensureDetailLoaded, expanded, loading]);

  const handleToggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) {
      await ensureDetailLoaded();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractReadableEmailText(detail ?? email, { stripUrls: true }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ConversationMessageCard] clipboard write failed:', err);
      onError?.(ui.copyBodyFailed);
    }
  };

  const buildAiPayload = (source: MailEmail): AIEmailSourcePayload => {
    const bodyHtml = 'bodyHtml' in source ? source.bodyHtml : undefined;
    const bodyText = 'bodyText' in source ? source.bodyText : undefined;
    const readableBodyText = bodyText?.trim()
      ? bodyText
      : extractReadableEmailText(source, { stripUrls: false });

    return {
      subject: source.subject,
      from: source.from,
      from_name: source.fromName,
      to: source.to,
      date: source.date,
      messageId: source.messageId,
      inReplyTo: source.inReplyTo,
      references: source.references,
      headers: 'headers' in source ? source.headers ?? {} : {},
      body_html: bodyHtml,
      body_text: readableBodyText || source.snippet,
      snippet: source.snippet,
      category: source.category,
      scan_result: source.scanResult,
      contactWikiContext: contactWikiAiContext,
    };
  };

  const generateAIResult = async (func: AIFunction, loadedSource: MailEmail = detail ?? email): Promise<string> => {
    const source = loadedSource;
    const normalizedLanguage = normalizeAiLanguage(aiTargetLanguage);
    const aiPayload = buildAiPayload(source);

    switch (func) {
      case 'translate':
        return (await translate(aiPayload, normalizedLanguage)).trim();
      case 'summarize':
        return summarize(aiPayload, normalizedLanguage);
      case 'reply':
        if (contactWiki && contactEmail) {
          const response = await suggestContactReplyDetailed({
            accountId: source.accountId,
            contactEmail,
            aliases: contactWiki.aliases,
            mailId: source.id,
            targetLang: normalizedLanguage,
          });
          return response.content || '';
        }
        return (await suggestReplyDetailed(aiPayload, normalizedLanguage)).content || '';
      default:
        return '';
    }
  };

  const handleAIFunction = async (func: AIFunction) => {
    if (func === 'translate' && isTranslated) {
      setAiResult(null);
      setTranslatedHtml(null);
      setAiFunction(null);
      setIsTranslated(false);
      return;
    }

    setAiFunction(func);
    setAiLoading(true);
    setAiResult(null);
    setTranslatedHtml(null);

    try {
      const loadedSource = await ensureDetailLoaded();
      const normalizedLanguage = normalizeAiLanguage(aiTargetLanguage);
      const translatePlainTextFallback = async () => {
        const fallbackText = extractReadableEmailText(loadedSource, { includeHeaders: false, stripUrls: false })
          || loadedSource.snippet
          || loadedSource.subject;
        const result = await translate(fallbackText, normalizedLanguage);
        return plainTextToMailHtml(result);
      };

      if (func === 'translate' && 'bodyHtml' in loadedSource && loadedSource.bodyHtml?.trim()) {
        try {
          const translated = await translateHtmlPreservingMarkup(
            loadedSource.bodyHtml,
            async (segments) => translateSegments(segments, normalizedLanguage),
          );
          setTranslatedHtml(translated);
          setAiResult(null);
          setIsTranslated(true);
        } catch (htmlTranslateError) {
          console.warn('[ConversationMessageCard] rich translation failed, falling back to plain text translation:', htmlTranslateError);
          try {
            const fallbackHtml = await translatePlainTextFallback();
            setAiResult(null);
            setTranslatedHtml(fallbackHtml);
            setIsTranslated(true);
          } catch (plainTranslateError) {
            console.error('[ConversationMessageCard] plain translation fallback failed:', plainTranslateError);
            setAiResult(null);
            setTranslatedHtml(null);
            setIsTranslated(false);
            onError?.(ui.aiFailed);
          }
        }
      } else {
        if (func === 'translate') {
          const fallbackHtml = await translatePlainTextFallback();
          setAiResult(null);
          setTranslatedHtml(fallbackHtml);
          setIsTranslated(true);
        } else {
          const result = await generateAIResult(func, loadedSource);
          setAiResult(result);
          setTranslatedHtml(null);
        }
      }
    } catch (err) {
      console.error('[ConversationMessageCard] AI action failed:', err);
      if (func === 'translate') {
        setAiResult(null);
        setTranslatedHtml(null);
        setIsTranslated(false);
        onError?.(ui.aiFailed);
      } else {
        setTranslatedHtml(null);
        setAiResult(ui.aiFailed);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const loadAssistant = useCallback(async (force = false) => {
    const normalizedLanguage = normalizeAiLanguage(aiTargetLanguage);
    const wikiCacheKey = contactWiki ? `${contactWiki.lastIndexedAt}:${contactWiki.stale ? 'stale' : 'ready'}` : 'no-wiki';
    const cacheKey = getAssistantCacheKey(email.id, normalizedLanguage, wikiCacheKey);

    if (!force) {
      const cached = readAssistantStateCache(cacheKey);
      if (cached) {
        setAssistantState(cached);
        return;
      }
    }

    if (!force && (assistantState.status === 'loading' || assistantState.loadedForId === email.id)) {
      return;
    }

    setAssistantState({
      ...EMPTY_ASSISTANT_STATE,
      status: 'loading',
      loadedForId: email.id,
    });

    try {
      const source = await ensureDetailLoaded();
      const aiPayload = buildAiPayload(source);

      const summaryResponse = await summarizeDetailed(aiPayload, normalizedLanguage);
      const actionsResponse = await suggestActionsDetailed(aiPayload, normalizedLanguage);
      const repliesResponse = await suggestQuickRepliesDetailed(aiPayload, normalizedLanguage);
      const keyInfoResult = await extractKeyInfo(aiPayload, normalizedLanguage);
      const replyNeeded = repliesResponse.metadata?.replyNeeded ?? actionsResponse.metadata?.replyNeeded ?? null;

      const readyState: MailAssistantState = {
        status: 'ready',
        loadedForId: email.id,
        summary: (summaryResponse.content || '').trim(),
        actions: actionsResponse.metadata?.actions?.length
          ? actionsResponse.metadata.actions.map((action) => [action.label, action.evidence].filter(Boolean).join(' — ')).slice(0, 4)
          : parseActionSuggestionLines(actionsResponse.content || '', 4),
        quickReplies: replyNeeded === false
          ? []
          : (repliesResponse.metadata?.quickReplies?.length
            ? normalizeQuickReplyItems(repliesResponse.metadata.quickReplies)
            : parseAiLines(repliesResponse.content || '', 3)),
        keyInfo: parseKeyInfoItems(keyInfoResult),
        replyNeeded,
        noReplyMessage: repliesResponse.metadata?.noReplyMessage || actionsResponse.metadata?.noReplyMessage,
      };
      rememberAssistantState(cacheKey, readyState, ASSISTANT_RESULT_TTL_MS);
      setAssistantState(readyState);
    } catch (err) {
      console.error('[ConversationMessageCard] assistant load failed:', err);
      const errorState: MailAssistantState = {
        ...EMPTY_ASSISTANT_STATE,
        status: 'error',
        loadedForId: email.id,
        error: ui.aiFailed,
      };
      rememberAssistantState(cacheKey, errorState, ASSISTANT_ERROR_COOLDOWN_MS);
      setAssistantState(errorState);
    }
  }, [
    aiTargetLanguage,
    assistantState.loadedForId,
    assistantState.status,
    contactWiki,
    contactWikiAiContext,
    email.id,
    ensureDetailLoaded,
    extractKeyInfo,
    summarizeDetailed,
    suggestActionsDetailed,
    suggestQuickRepliesDetailed,
    ui.aiFailed,
  ]);

  useEffect(() => {
    if (expanded && showAssistant) {
      void loadAssistant();
    }
  }, [expanded, loadAssistant, showAssistant]);

  const handleCopyResult = async () => {
    if (!aiResult) return;
    try {
      await navigator.clipboard.writeText(aiResult);
    } catch (err) {
      console.error('[ConversationMessageCard] AI result clipboard write failed:', err);
      onError?.(ui.copyAiFailed);
    }
  };

  const handleAiReply = async () => {
    setAiFunction('reply');
    setAiLoading(true);
    setAiResult(null);
    try {
      const loadedSource = await ensureDetailLoaded();
      const normalizedLanguage = normalizeAiLanguage(aiTargetLanguage);
      const aiPayload = buildAiPayload(loadedSource);
      const response = contactWiki && contactEmail
        ? await suggestContactReplyDetailed({
            accountId: loadedSource.accountId,
            contactEmail,
            aliases: contactWiki.aliases,
            mailId: loadedSource.id,
            targetLang: normalizedLanguage,
          })
        : await suggestReplyDetailed(aiPayload, normalizedLanguage);
      if (response.metadata?.replyNeeded === false) {
        onError?.(response.metadata.noReplyMessage || response.content || assistantLabels.noReplyNeeded);
        return;
      }
      const candidate = response.metadata?.replyCandidates?.find((item) => item.style === 'best')?.body ||
        response.metadata?.replyCandidates?.[0]?.body ||
        response.content ||
        '';
      if (candidate.trim()) onReplyWithSuggestion(candidate);
    } catch (err) {
      console.error('[ConversationMessageCard] AI reply failed:', err);
      onError?.(ui.aiFailed);
    } finally {
      setAiLoading(false);
    }
  };

  const handleForward = async () => {
    try {
      const loadedSource = await ensureDetailLoaded();
      onForward(loadedSource);
    } catch (err) {
      console.error('[ConversationMessageCard] forward detail load failed:', err);
      onForward(detail ?? email);
    }
  };

  const getAttachmentStateKey = (attachment: RendererMailDetail['attachments'][number], index: number) =>
    attachment.cacheId || `${email.accountId}:${email.folder}:${email.uid}:${index}`;

  const handleAttachmentAction = async (
    action: 'download' | 'open',
    attachment: RendererMailDetail['attachments'][number],
    index: number,
  ) => {
    const attachmentCacheId = attachment.cacheId;
    const stateKey = getAttachmentStateKey(attachment, index);
    if (!attachmentCacheId) {
      setAttachmentDownloadStates((prev) => ({
        ...prev,
        [stateKey]: { status: 'error', error: ui.attachmentActionFailed },
      }));
      return;
    }

    setAttachmentDownloadStates((prev) => ({
      ...prev,
      [stateKey]: { status: action === 'download' ? 'downloading' : 'opening' },
    }));

    try {
      const result = await window.electronAPI.invoke<{ success: boolean; filePath?: string; error?: string }>(
        action === 'download' ? 'mail:downloadAttachment' : 'mail:openAttachment',
        {
          accountId: email.accountId,
          folder: email.folder,
          uid: email.uid,
          attachmentCacheId,
        },
      );
      if (result.success) {
        setAttachmentDownloadStates((prev) => ({ ...prev, [stateKey]: { status: 'done' } }));
        return;
      }
      if (result.error === 'cancelled') {
        setAttachmentDownloadStates((prev) => {
          const next = { ...prev };
          delete next[stateKey];
          return next;
        });
        return;
      }
      setAttachmentDownloadStates((prev) => ({
        ...prev,
        [stateKey]: { status: 'error', error: result.error || ui.attachmentActionFailed },
      }));
    } catch (error) {
      setAttachmentDownloadStates((prev) => ({
        ...prev,
        [stateKey]: {
          status: 'error',
          error: error instanceof Error ? error.message : ui.attachmentActionFailed,
        },
      }));
    }
  };

  const visibleAttachments = (detail?.attachments ?? [])
    .filter((attachment) => !attachment.inline)
    .filter((attachment) => attachment.filename || attachment.contentType || attachment.size > 0);

  return (
    <div className="mb-5 rounded-[24px] overflow-hidden" style={{ backgroundColor: cardBg, boxShadow: '0 24px 48px rgba(2,6,23,0.12)' }}>
      {(email.deliveryState === 'scheduled' || email.deliveryState === 'sending' || email.deliveryState === 'failed' || email.deliveryState === 'sent') && (
        <div className={`mail-send-status-bar ${email.deliveryState === 'sending' ? 'mail-send-status-bar-sending' : ''}`} style={{ backgroundColor: statusTone }} />
      )}
      <button
        onClick={() => void handleToggle()}
        className="w-full px-5 py-4 text-left cursor-pointer"
        style={{ color: '#D1D1D6' }}
      >
        <div className="flex items-start gap-3">
          <SenderAvatar email={email.from} name={email.fromName || email.from} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium truncate">{email.fromName || email.from}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {statusLabel && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusTone}22`, color: statusTone }}>
                    {statusLabel}
                  </span>
                )}
                {githubPriorityBadge && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: githubPriorityBadge.backgroundColor,
                      color: githubPriorityBadge.color,
                      border: `1px solid ${githubPriorityBadge.borderColor}`,
                    }}
                    title={githubPriorityBadge.tooltip}
                  >
                    {githubPriorityBadge.shortLabel}
                  </span>
                )}
                <span className="text-[11px]" style={{ color: '#636366' }}>
                  {formatRelativeTime(email.date, t, locale)}
                </span>
              </div>
            </div>
            <div className="mt-1 text-[12px] text-white truncate">{email.subject}</div>
            <div className="mt-1 text-[11px] truncate" style={{ color: '#636366' }}>{email.snippet}</div>
          </div>
          <span className="pt-0.5 flex items-center justify-center" style={{ color: '#636366' }} title={expanded ? '折叠正文' : '展开正文'} aria-label={expanded ? '折叠正文' : '展开正文'}>
            <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} strokeWidth={1.8} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <div className="pt-2 text-[11px] space-y-1" style={{ color: '#8e8e93' }}>
            {matchedFolderLabel && (
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                    border: `1px solid ${uiColor.borderSubtle}`,
                  }}
                >
                  {matchedFolderLabel}
                </span>
                {githubPriorityBadge && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px]"
                    title={githubPriorityBadge.tooltip}
                    style={{
                      backgroundColor: githubPriorityBadge.backgroundColor,
                      color: githubPriorityBadge.color,
                      border: `1px solid ${githubPriorityBadge.borderColor}`,
                    }}
                  >
                    {githubPriorityBadge.shortLabel} {githubPriorityBadge.label}
                  </span>
                )}
                {routingTooltip && (
                  <div
                    className="relative"
                    onMouseEnter={() => setShowRoutingTooltip(true)}
                    onMouseLeave={() => setShowRoutingTooltip(false)}
                  >
                    <button
                      type="button"
                      className="p-1.5 rounded-lg cursor-pointer"
                      title={routingTooltip}
                      style={buildIconButtonStyle()}
                    >
                      <FileText className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    {showRoutingTooltip && (
                      <div
                        className="absolute left-0 top-full z-20 mt-2 w-60 rounded-2xl p-3 text-[11px] leading-5 whitespace-pre-wrap"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.10)',
                          backdropFilter: 'blur(10px)',
                          border: `1px solid ${uiColor.borderSubtle}`,
                          color: 'rgba(255,255,255,0.9)',
                          boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
                        }}
                      >
                        {routingTooltip}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div><span style={{ color: '#636366' }}>{ui.fromLabel}:</span> {email.fromName || email.from} &lt;{email.from}&gt;</div>
            {email.to && <div><span style={{ color: '#636366' }}>{ui.toLabel}:</span> {email.to}</div>}
            {email.deliveryState === 'failed' && email.deliveryError && (
              <div><span style={{ color: '#636366' }}>{ui.statusLabel}:</span> <span style={{ color: '#ff453a' }}>{email.deliveryError}</span></div>
            )}
          </div>

          <div className="pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button onClick={() => onToggleStar(email)} className="p-2 rounded-lg cursor-pointer" title={email.isStarred ? ui.removeStar : ui.addStar} style={{ ...buildIconButtonStyle(email.isStarred), color: email.isStarred ? '#ff9f0a' : uiColor.textSubtle }}><Star className="w-[18px] h-[18px]" strokeWidth={1.8} fill={email.isStarred ? 'currentColor' : 'none'} /></button>
              <button onClick={() => onDelete(email)} className="p-2 rounded-lg cursor-pointer" title={t('delete')} style={buildIconButtonStyle()}><Trash2 className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
              {onArchive && (
                <button onClick={() => onArchive(email)} className="p-2 rounded-lg cursor-pointer" title={isSpam ? ui.removeSpam : isArchived ? ui.removeArchive : ui.archive} style={buildIconButtonStyle()}>
                  <Archive className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleAIFunction('translate')}
                disabled={aiLoading || aiApiLoading}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                title={translateButtonLabel}
                style={{ color: uiColor.textSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <Languages className="w-3.5 h-3.5" strokeWidth={1.8} />
                {translateButtonLabel}
              </button>
              {showAiReplyButton && (
                <button
                  type="button"
                  onClick={() => void handleAiReply()}
                  disabled={aiLoading || aiApiLoading}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  title={t('reply')}
                  style={{ color: uiColor.textSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <Reply className="w-3.5 h-3.5" strokeWidth={1.8} />
                  {t('reply')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleForward()}
                disabled={loading}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                title={t('forward')}
                style={{ color: uiColor.textSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <Forward className="w-3.5 h-3.5" strokeWidth={1.8} />
                {t('forward')}
              </button>
            </div>
          </div>

          {(aiLoading || aiApiLoading) && (
            <div className="mb-4 flex items-center gap-2" style={{ color: '#636366' }}>
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" strokeWidth={1.8} />
              <span className="text-[11px]">{t('aiProcessing')}</span>
            </div>
          )}
          {visibleAttachments.length > 0 && (
            <div
              className="mb-4 rounded-2xl p-3"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: `1px solid ${uiColor.borderSubtle}`,
              }}
            >
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#DDE4F2' }}>
                <Paperclip className="w-3.5 h-3.5" strokeWidth={1.8} />
                {ui.attachmentsLabel}
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleAttachments.map((attachment, index) => {
                  const sizeText = formatAttachmentSize(attachment.size);
                  const stateKey = getAttachmentStateKey(attachment, index);
                  const actionState = attachmentDownloadStates[stateKey];
                  const isBusy = actionState?.status === 'downloading' || actionState?.status === 'opening';
                  const statusText = actionState?.status === 'downloading'
                    ? ui.downloadingAttachment
                    : actionState?.status === 'opening'
                      ? ui.openingAttachment
                      : actionState?.status === 'error'
                        ? (actionState.error || ui.attachmentActionFailed)
                        : '';
                  return (
                    <div
                      key={`${attachment.filename || attachment.contentType}-${index}`}
                      className="min-w-0 max-w-full rounded-xl px-3 py-2"
                      style={{ backgroundColor: 'rgba(15,23,42,0.62)', color: '#CBD5E1' }}
                    >
                      <div className="max-w-[260px] truncate text-[12px] font-medium" title={attachment.filename || attachment.contentType}>
                        {attachment.filename || attachment.contentType}
                      </div>
                      <div className="mt-0.5 text-[10px]" style={{ color: uiColor.textSubtle }}>
                        {[attachment.contentType, sizeText].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAttachmentAction('download', attachment, index)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] cursor-pointer disabled:opacity-50"
                          style={buildIconButtonStyle()}
                        >
                          <Download className="w-3 h-3" strokeWidth={1.8} />
                          {ui.downloadAttachment}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAttachmentAction('open', attachment, index)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] cursor-pointer disabled:opacity-50"
                          style={buildIconButtonStyle()}
                        >
                          <FolderOpen className="w-3 h-3" strokeWidth={1.8} />
                          {ui.openAttachment}
                        </button>
                      </div>
                      {statusText && (
                        <div
                          className="mt-1 max-w-[260px] truncate text-[10px]"
                          style={{ color: actionState?.status === 'error' ? '#ff453a' : uiColor.textSubtle }}
                          title={statusText}
                        >
                          {statusText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {aiResult && aiFunction !== 'translate' && aiFunction !== 'reply' && (
            <div className="mb-4 rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(10px)', border: `1px solid ${uiColor.borderSubtle}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {aiFunction === 'translate' ? t('translationResult') : aiFunction === 'summarize' ? t('summary') : t('replySuggestion')}
                </span>
                <div className="flex items-center gap-2">
                  {aiFunction === 'reply' && (
                    <button onClick={() => onReplyWithSuggestion(aiResult)} className="text-[10px] px-2 py-1 rounded-md text-white cursor-pointer" style={{ backgroundColor: '#7C3AED' }}>
                      {t('useThisReply')}
                    </button>
                  )}
                  <button onClick={() => void handleCopyResult()} className="text-[10px] flex items-center gap-1 cursor-pointer" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <Copy className="w-3 h-3" strokeWidth={1.8} />
                    {t('copy')}
                  </button>
                </div>
              </div>
              <pre className="text-[12px] whitespace-pre-wrap leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"' }}>
                {aiResult}
              </pre>
            </div>
          )}

          <div className="rounded-[22px] p-5 text-[13px] leading-relaxed" style={{ backgroundColor: bodyBg, color: '#D1D1D6' }}>
            {aiFunction === 'translate' && translatedHtml ? (
              <MailBody
                bodyHtml={translatedHtml}
                snippet={email.snippet}
                loading={false}
                error={false}
                ui={ui}
                allowRemoteImages={allowRemoteImages}
                onAllowRemoteImages={() => setAllowRemoteImages(true)}
              />
            ) : (
              <MailBody
                bodyHtml={detail?.bodyHtml}
                bodyText={detail?.bodyText}
                snippet={email.snippet}
                loading={loading}
                error={bodyError}
                ui={ui}
                mailError={mailError}
                onRetry={onRetry}
                allowRemoteImages={allowRemoteImages}
                onAllowRemoteImages={() => setAllowRemoteImages(true)}
              />
            )}
            {onRescan && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={() => onRescan(email)} className="p-2 rounded-lg cursor-pointer" title="閲嶆柊鍒嗙被" style={buildIconButtonStyle()}>
                  <RefreshCw className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </button>
              </div>
            )}
          </div>

          {showAssistant && (
          <div
            className="mt-4 rounded-[24px] p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.22), rgba(15,23,42,0.94))',
              boxShadow: '0 18px 44px rgba(2,6,23,0.24)',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.40)', color: '#C4B5FD' }}>
                  <Sparkles className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-white">{assistantLabels.title}</div>
                  {assistantState.status === 'loading' && (
                    <div className="text-[11px]" style={{ color: uiColor.textSubtle }}>{assistantLabels.loading}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => void loadAssistant(true)}
                  disabled={assistantState.status === 'loading' || aiApiLoading}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
                  style={{ color: '#DDD6FE', backgroundColor: 'rgba(124,58,237,0.16)', border: `1px solid rgba(124,58,237,0.30)` }}
                >
                  {assistantLabels.retry}
                </button>
              </div>
            </div>

            {assistantState.status === 'error' ? (
              <div className="rounded-xl px-3 py-2 text-[12px]" style={{ color: '#FCA5A5', backgroundColor: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.18)' }}>
                {assistantState.error || assistantLabels.unavailable}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="rounded-[20px] p-4" style={{ backgroundColor: 'rgba(15,23,42,0.56)' }}>
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#C4B5FD' }}>
                      <FileText className="w-3.5 h-3.5" strokeWidth={1.8} />
                      {assistantLabels.summary}
                    </div>
                    <p className="text-[12px] leading-6 whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0" style={{ color: '#DDE4F2' }}>
                      {assistantState.summary || (assistantState.status === 'loading' ? assistantLabels.loading : '')}
                    </p>
                  </div>

                  <div className="rounded-[20px] p-4" style={{ backgroundColor: 'rgba(15,23,42,0.56)' }}>
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#86EFAC' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                      {assistantLabels.actions}
                    </div>
                    <ul className="space-y-1.5 text-[12px] leading-5 min-w-0" style={{ color: '#DDE4F2' }}>
                      {(assistantState.actions.length > 0 ? assistantState.actions : [assistantState.status === 'loading' ? assistantLabels.loading : assistantLabels.noActions]).map((action, index) => (
                        <li key={`${action}-${index}`} className="flex gap-2 min-w-0">
                          <span style={{ color: '#86EFAC' }}>•</span>
                          <span className="min-w-0 break-words">{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-2 text-[12px] font-semibold" style={{ color: '#C4B5FD' }}>{assistantLabels.quickReplies}</div>
                  {assistantState.replyNeeded === false ? (
                    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ color: '#CBD5E1', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      {assistantState.noReplyMessage || assistantLabels.noReplyNeeded}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {assistantState.quickReplies.map((reply, index) => (
                        <div
                          key={`${reply}-${index}`}
                          className="inline-flex max-w-full overflow-hidden rounded-lg"
                          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                        >
                          <button
                            type="button"
                            onClick={() => onReplyWithSuggestion(reply)}
                            className="min-w-0 px-3 py-1.5 text-left text-[12px] cursor-pointer"
                            title={assistantLabels.useReply}
                            style={{ color: '#EDE9FE' }}
                          >
                            <span className="block truncate">{reply}</span>
                          </button>
                          {onSaveQuickPhrase && (
                            <button
                              type="button"
                              onClick={() => void onSaveQuickPhrase(reply)}
                              className="border-l border-white/10 px-2 py-1.5 text-[11px] cursor-pointer"
                              title={assistantLabels.saveQuickPhrase}
                              style={{ color: '#C4B5FD' }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {assistantState.replyNeeded !== false && (
                  <div className="mt-3 flex items-center gap-2 rounded-[18px] px-3 py-2" style={{ backgroundColor: 'rgba(15,23,42,0.46)' }}>
                    <input
                      value={quickReplyDraft}
                      onChange={(event) => setQuickReplyDraft(event.target.value)}
                      placeholder={assistantLabels.customReplyPlaceholder}
                      className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#64748B]"
                      style={{ color: '#E5E7EB' }}
                    />
                    <button
                      type="button"
                      disabled={!quickReplyDraft.trim()}
                      onClick={() => {
                        const draft = quickReplyDraft.trim();
                        if (!draft) return;
                        onReplyWithSuggestion(draft);
                        setQuickReplyDraft('');
                      }}
                      className="p-1.5 rounded-lg cursor-pointer disabled:opacity-40"
                      style={{ color: '#C4B5FD' }}
                      title={assistantLabels.useReply}
                    >
                      <Send className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </div>
                  )}
                </div>

                <div className="mt-3 rounded-[20px] p-4" style={{ backgroundColor: 'rgba(15,23,42,0.46)' }}>
                  <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#C4B5FD' }}>
                    <Info className="w-3.5 h-3.5" strokeWidth={1.8} />
                    {assistantLabels.keyInfo}
                  </div>
                  {assistantState.keyInfo.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {assistantState.keyInfo.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="min-w-0">
                          <div className="text-[10px]" style={{ color: uiColor.textSubtle }}>{getKeyInfoFieldLabel(item)}</div>
                          <div className="text-[12px] truncate" style={{ color: '#E5E7EB' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[12px]" style={{ color: uiColor.textSubtle }}>
                      {assistantState.status === 'loading' ? assistantLabels.loading : assistantLabels.noKeyInfo}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MailDetail({
  t,
  email,
  onReply,
  onForward,
  onDelete,
  onBack,
  aiTargetLanguage,
  onReplyWithSuggestion,
  onSaveQuickPhrase,
  loadMailBody,
  mailLoadingState = 'idle',
  mailError = null,
  onRetry,
  conversationMessages = [],
  accountEmails = [],
  onReplyForMail,
  onForwardForMail,
  onDeleteMail,
  onArchiveMail,
  onToggleStarMail,
  onRescanMail,
  onError,
  onToggleStar,
  onArchive,
  routingDiagnostics = {},
}: MailDetailProps) {
  const { i18n } = useTranslation();
  const appLanguage = normalizeAppLanguage(i18n.language);
  const locale = i18n.language || undefined;
  const ui = useMemo(() => getUi(appLanguage), [appLanguage]);
  const {
    getContactKnowledgeSettings,
    getContactWiki,
    buildContactWiki,
    saveContactWikiFeedback,
    loading: aiApiLoading,
  } = useAI();
  const [contactWiki, setContactWiki] = useState<ContactWiki | null>(null);
  const [contactWikiStatus, setContactWikiStatus] = useState<'idle' | 'disabled' | 'loading' | 'ready' | 'error'>('idle');
  const [contactWikiError, setContactWikiError] = useState<string | null>(null);
  const [contactWikiFeedbackStatus, setContactWikiFeedbackStatus] = useState<string | null>(null);
  const [contactWikiExpanded, setContactWikiExpanded] = useState(false);

  const formatDate = useCallback((date: Date) => {
    return date.toLocaleString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [locale]);

  const selectedSummary = email as RendererMailSummary | null;
  const sortedConversation = (conversationMessages.length > 0 ? conversationMessages : [selectedSummary])
    .filter((message): message is RendererMailSummary => Boolean(message))
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const contactEmail = selectedSummary ? getConversationCounterparty(selectedSummary, accountEmails) : '';
  const contactName = selectedSummary && isLocalSenderMail(selectedSummary, accountEmails)
    ? contactEmail
    : (selectedSummary?.fromName || contactEmail);
  const contactWikiLabels = appLanguage === 'zh'
    ? {
      title: '联系人 Wiki',
      loading: '正在构建联系人知识库...',
      build: '生成',
      rebuild: '重建',
      disabled: '在 AI 设置中开启历史邮件知识库后可用',
      unavailable: '联系人知识库暂不可用',
      recent: '近期脉络',
      openLoops: '待办/风险',
      style: '回复风格',
      profile: '关系画像',
      projects: '活跃事项',
      preferences: '偏好',
      userValue: '对我的价值',
      userInsights: '用户洞察',
      engagement: '行为画像',
      subscriptionValue: '订阅价值',
      promotionPattern: '促销规律',
      bestDeal: '历史低价',
      actionAdvice: '阅读建议',
      readingValue: '阅读价值',
      frequency: '频率',
      contentStability: '内容稳定性',
      serviceType: '服务类型',
      userAction: '建议动作',
      riskAlert: '风险提示',
      feedbackThemes: '反馈主题',
      featureRequests: '功能请求',
      criticisms: '批评/问题',
      praises: '正向反馈',
      suggestedNextActions: '建议跟进',
      replyEntry: '互动入口',
      diagnostics: '诊断',
      insufficientBehavior: '暂无足够行为数据',
      feedbackUseful: '有用',
      feedbackInaccurate: '不准',
      feedbackNotRelevant: '不相关',
      feedbackTooLong: '太长',
      feedbackSaved: '已记录',
      expand: '展开',
      collapse: '收起',
    }
    : {
      title: 'Contact Wiki',
      loading: 'Building contact knowledge...',
      build: 'Build',
      rebuild: 'Rebuild',
      disabled: 'Enable historical mail knowledge in AI settings',
      unavailable: 'Contact wiki unavailable',
      recent: 'Recent context',
      openLoops: 'Open loops',
      style: 'Reply style',
      profile: 'Relationship',
      projects: 'Active items',
      preferences: 'Preferences',
      userValue: 'Value for me',
      userInsights: 'User insights',
      engagement: 'Engagement',
      subscriptionValue: 'Subscription value',
      promotionPattern: 'Promotion pattern',
      bestDeal: 'Best deal so far',
      actionAdvice: 'Action advice',
      readingValue: 'Reading value',
      frequency: 'Frequency',
      contentStability: 'Content stability',
      serviceType: 'Service type',
      userAction: 'Suggested action',
      riskAlert: 'Risk alert',
      feedbackThemes: 'Feedback themes',
      featureRequests: 'Feature requests',
      criticisms: 'Criticism / issues',
      praises: 'Positive feedback',
      suggestedNextActions: 'Suggested next actions',
      replyEntry: 'Reply entry',
      diagnostics: 'Diagnostics',
      insufficientBehavior: 'Not enough behavior data yet',
      feedbackUseful: 'Useful',
      feedbackInaccurate: 'Inaccurate',
      feedbackNotRelevant: 'Not relevant',
      feedbackTooLong: 'Too long',
      feedbackSaved: 'Saved',
      expand: 'Expand',
      collapse: 'Collapse',
    };

  const loadContactWiki = useCallback(async (force = false, buildIfMissing = false) => {
    if (!selectedSummary || !contactEmail || !/@/.test(contactEmail)) {
      setContactWikiStatus('idle');
      return;
    }
    setContactWikiStatus('loading');
    setContactWikiError(null);
    try {
      const settings = await getContactKnowledgeSettings();
      if (!settings.enabled) {
        setContactWiki(null);
        setContactWikiStatus('disabled');
        return;
      }
      const existing = !force ? await getContactWiki({ accountId: selectedSummary.accountId, contactEmail }) : null;
      if (existing && !existing.stale) {
        setContactWiki(existing);
        setContactWikiStatus('ready');
        setContactWikiExpanded(false);
        return;
      }
      if (!buildIfMissing) {
        setContactWiki(existing ?? null);
        setContactWikiStatus(existing ? 'ready' : 'idle');
        setContactWikiExpanded(false);
        return;
      }
      setContactWikiExpanded(true);
      const built = await buildContactWiki({
        accountId: selectedSummary.accountId,
        contactEmail,
        contactName,
        force,
        targetLang: normalizeAiLanguage(aiTargetLanguage),
      });
      setContactWiki(built);
      setContactWikiStatus('ready');
      setContactWikiExpanded(false);
    } catch (error) {
      setContactWikiStatus('error');
      setContactWikiError((error as Error).message);
      setContactWikiExpanded(true);
    }
  }, [
    aiTargetLanguage,
    buildContactWiki,
    contactEmail,
    contactName,
    getContactKnowledgeSettings,
    getContactWiki,
    selectedSummary?.accountId,
  ]);

  useEffect(() => {
    setContactWiki(null);
    setContactWikiStatus('idle');
    setContactWikiError(null);
    setContactWikiFeedbackStatus(null);
    setContactWikiExpanded(false);
    void loadContactWiki(false, false);
  }, [contactEmail, selectedSummary?.accountId, loadContactWiki]);

  const handleContactWikiFeedback = useCallback(async (
    target: 'wiki' | 'reply',
    rating: 'useful' | 'inaccurate' | 'not_relevant' | 'too_long' | 'too_formal' | 'too_short',
  ) => {
    if (!selectedSummary || !contactEmail) return;
    try {
      await saveContactWikiFeedback({
        accountId: selectedSummary.accountId,
        contactEmail,
        target,
        rating,
      });
      setContactWikiFeedbackStatus(contactWikiLabels.feedbackSaved);
      setTimeout(() => setContactWikiFeedbackStatus(null), 1800);
    } catch (error) {
      setContactWikiFeedbackStatus((error as Error).message);
    }
  }, [contactEmail, contactWikiLabels.feedbackSaved, saveContactWikiFeedback, selectedSummary]);

  if (!email && mailLoadingState === 'idle') {
    return <EmptyMailState appLanguage={appLanguage} />;
  }

  if (!email && mailLoadingState === 'loading') {
    return (
      <div className="flex-1 h-full min-h-0 flex flex-col p-6 overflow-hidden" style={{ backgroundColor: '#07101D' }}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-zinc-800 rounded w-1/2" />
          <div className="h-3 bg-zinc-800 rounded w-1/3" />
          <div className="h-px bg-zinc-800 my-3" />
          <div className="h-3 bg-zinc-800 rounded w-full" />
          <div className="h-3 bg-zinc-800 rounded w-5/6" />
          <div className="h-3 bg-zinc-800 rounded w-4/6" />
        </div>
        <p className="text-center text-[11px] mt-auto" style={{ color: '#3a3a3c' }}>{ui.loadingContent}</p>
      </div>
    );
  }

  if (!email && (mailLoadingState === 'timeout' || mailLoadingState === 'error')) {
    return (
      <div className="flex-1 h-full min-h-0 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#07101D' }}>
        <span className="text-2xl">{ui.errorEmoji}</span>
        <p className="text-[12px] text-center px-8" style={{ color: '#636366' }}>{mailError || ui.timeout}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg text-[12px] text-white transition-colors cursor-pointer"
            style={{ backgroundColor: '#7C3AED' }}
          >
            {ui.retry}
          </button>
        )}
      </div>
    );
  }

  if (!selectedSummary) return null;

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col relative w-full min-w-0" style={{ backgroundColor: '#07101D' }}>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3a3d transparent' }}>
        <div className="mb-5 px-1 flex items-start gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="mt-0.5 w-9 h-9 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
              style={{ color: '#94A3B8', backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              ‹
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[22px] font-semibold text-white leading-tight">{selectedSummary.subject}</div>
            <div className="mt-2 text-[11px]" style={{ color: uiColor.textSubtle }}>
              {formatDate(selectedSummary.date)}
            </div>
          </div>
        </div>
        {contactEmail && /@/.test(contactEmail) && (
          <div className="mb-5 rounded-[20px] p-4" style={{ backgroundColor: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.14)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(48,209,88,0.14)', color: '#86EFAC' }}>
                  <Sparkles className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white">{contactWikiLabels.title}</div>
                  <div className="truncate text-[11px]" style={{ color: uiColor.textSubtle }}>{contactEmail}</div>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void loadContactWiki(Boolean(contactWiki), true)}
                  disabled={contactWikiStatus === 'loading' || aiApiLoading}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
                  style={{ color: '#BBF7D0', backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)' }}
                >
                  {contactWiki ? contactWikiLabels.rebuild : contactWikiLabels.build}
                </button>
                <button
                  type="button"
                  onClick={() => setContactWikiExpanded((expanded) => !expanded)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
                  style={{ color: uiColor.textSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${contactWikiExpanded ? 'rotate-180' : ''}`} strokeWidth={1.8} />
                  {contactWikiExpanded ? contactWikiLabels.collapse : contactWikiLabels.expand}
                </button>
              </div>
            </div>
            {contactWikiStatus === 'loading' ? (
              <div className="mt-3 text-[12px]" style={{ color: uiColor.textSubtle }}>{contactWikiLabels.loading}</div>
            ) : contactWikiStatus === 'disabled' ? (
              <div className="mt-3 text-[12px]" style={{ color: uiColor.textSubtle }}>{contactWikiLabels.disabled}</div>
            ) : contactWikiStatus === 'error' ? (
              <div className="mt-3 text-[12px]" style={{ color: '#FCA5A5' }}>{contactWikiError || contactWikiLabels.unavailable}</div>
            ) : contactWiki ? (
              <div className={contactWikiExpanded ? 'mt-3 space-y-3' : 'mt-3'}>
                <p
                  className={`text-[12px] leading-6 break-words ${contactWikiExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}
                  style={{ color: '#DDE4F2' }}
                >
                  {contactWiki.summary}
                </p>
                {!contactWikiExpanded && (
                  <div className="mt-1 text-[10px]" style={{ color: uiColor.textSubtle }}>
                    {contactWiki.sourceMailCount} mails · {contactWiki.chunkCount} chunks
                    {contactWiki.stale ? ` · ${contactWiki.staleReason || 'stale'}` : ''}
                  </div>
                )}
                {contactWikiExpanded && (
                <>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
                  {(() => {
                    const supportsUserInsights = contactWiki.senderType === 'personal' || contactWiki.senderType === 'work_contact';
                    const compact = (value: string | null | undefined): string[] => value ? [value] : [];
                    const normalizeWikiText = (value: string): string => value.replace(/\s+/g, '').replace(/[，。；;:：,.!！?？\-—–]/g, '').toLowerCase();
                    const summaryKey = normalizeWikiText(contactWiki.summary || '');
                    const visibleItems = (items: string[]): string[] => items.filter((item) => normalizeWikiText(item) !== summaryKey);
                    const row = (label: string, items: string[]): [string, string[]] => [label, items];
                    const scenarioRows: Array<[string, string[]]> = [
                      row(contactWikiLabels.subscriptionValue, compact(contactWiki.subscriptionValue)),
                      row(contactWikiLabels.promotionPattern, compact(contactWiki.promotionPattern)),
                      row(contactWikiLabels.bestDeal, contactWiki.bestDealSoFar || []),
                      row(contactWikiLabels.actionAdvice, compact(contactWiki.actionAdvice)),
                      row(contactWikiLabels.readingValue, compact(contactWiki.readingValue)),
                      row(contactWikiLabels.frequency, compact(contactWiki.frequency)),
                      row(contactWikiLabels.contentStability, compact(contactWiki.contentStability)),
                      row(contactWikiLabels.serviceType, compact(contactWiki.serviceType)),
                      row(contactWikiLabels.userAction, compact(contactWiki.userAction)),
                      row(contactWikiLabels.riskAlert, compact(contactWiki.riskAlert)),
                      row(contactWikiLabels.feedbackThemes, contactWiki.feedbackThemes || []),
                      row(contactWikiLabels.featureRequests, contactWiki.featureRequests || []),
                      row(contactWikiLabels.criticisms, contactWiki.criticisms || []),
                      row(contactWikiLabels.praises, contactWiki.praises || []),
                      row(contactWikiLabels.suggestedNextActions, contactWiki.suggestedNextActions || []),
                      row(contactWikiLabels.replyEntry, compact(contactWiki.replyEntry)),
                      ...(import.meta.env.DEV && contactWiki.wikiDiagnostics
                        ? [row(contactWikiLabels.diagnostics, [
                          ...(contactWiki.wikiDiagnostics.fallbackReasons || []).map((item) => `fallback: ${item}`),
                          ...(contactWiki.wikiDiagnostics.strippedFields || []).map((item) => `stripped: ${item}`),
                          contactWiki.wikiDiagnostics.canonicalSummaryField ? `canonical: ${contactWiki.wikiDiagnostics.canonicalSummaryField}` : '',
                          contactWiki.wikiDiagnostics.summaryReplaced ? 'summaryReplaced: true' : '',
                        ].filter(Boolean))]
                        : []),
                    ].map(([label, items]) => row(label, visibleItems(items))).filter(([, items]) => items.length > 0);
                    const rows: Array<[string, string[]]> = [
                      row(contactWikiLabels.recent, contactWiki.recentContext),
                      ...(supportsUserInsights
                        ? [
                          row(contactWikiLabels.openLoops, contactWiki.openLoops),
                          row(contactWikiLabels.style, contactWiki.replyStyle),
                          row(contactWikiLabels.projects, contactWiki.activeProjects),
                        ]
                        : []),
                      ...(supportsUserInsights ? [row(contactWikiLabels.preferences, contactWiki.preferences)] : []),
                      ...(supportsUserInsights ? [row(contactWikiLabels.userValue, (contactWiki.valueForUser || []).map((item) => item.text))] : []),
                      ...scenarioRows,
                      ...(supportsUserInsights
                        ? [
                          row(contactWikiLabels.userInsights, (contactWiki.userInsights || []).map((item) => item.text).length > 0 ? (contactWiki.userInsights || []).map((item) => item.text) : [contactWikiLabels.insufficientBehavior]),
                          row(contactWikiLabels.engagement, contactWiki.engagementProfile || []),
                        ]
                        : []),
                      ...(supportsUserInsights ? [row(contactWikiLabels.profile, compact(contactWiki.relationshipProfile || contactWiki.lastInteractionSummary))] : []),
                    ];
                    return rows;
                  })().map(([label, items]) => (
                    <div key={label as string} className="rounded-[14px] px-3 py-2" style={{ backgroundColor: 'rgba(2,6,23,0.32)' }}>
                      <div className="mb-1.5 text-[11px] font-semibold" style={{ color: '#86EFAC' }}>{label as string}</div>
                      <ul className="space-y-1 text-[11px] leading-5" style={{ color: '#DDE4F2' }}>
                        {((items as string[]).length > 0 ? items as string[] : ['-']).map((item, index) => (
                          <li key={`${item}-${index}`} className="break-words">{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="text-[10px]" style={{ color: uiColor.textSubtle }}>
                  {contactWiki.sourceMailCount} mails · {contactWiki.chunkCount} chunks
                  {contactWiki.stale ? ` · ${contactWiki.staleReason || 'stale'}` : ''}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    [contactWikiLabels.feedbackUseful, 'useful'],
                    [contactWikiLabels.feedbackInaccurate, 'inaccurate'],
                    [contactWikiLabels.feedbackNotRelevant, 'not_relevant'],
                    [contactWikiLabels.feedbackTooLong, 'too_long'],
                  ].map(([label, rating]) => (
                    <button
                      key={rating as string}
                      type="button"
                      onClick={() => void handleContactWikiFeedback('wiki', rating as 'useful' | 'inaccurate' | 'not_relevant' | 'too_long')}
                      className="rounded-md px-2 py-1 text-[10px] cursor-pointer"
                      style={{ color: '#BBF7D0', backgroundColor: 'rgba(34,197,94,0.10)' }}
                    >
                      {label as string}
                    </button>
                  ))}
                  {contactWikiFeedbackStatus && (
                    <span className="text-[10px]" style={{ color: uiColor.textSubtle }}>{contactWikiFeedbackStatus}</span>
                  )}
                </div>
                </>
                )}
              </div>
            ) : (
              <div className="mt-3 text-[12px]" style={{ color: uiColor.textSubtle }}>{contactWikiLabels.unavailable}</div>
            )}
          </div>
        )}
        {sortedConversation.map((message, index) => (
          <ConversationMessageCard
            key={message.id}
            email={message}
            initialDetail={message.id === selectedSummary.id && isDetail(selectedSummary) ? selectedSummary : null}
            defaultExpanded={index === 0}
            accountEmails={accountEmails}
            t={t}
            locale={locale || ''}
            ui={ui}
            aiTargetLanguage={aiTargetLanguage}
            initialLoading={message.id === selectedSummary.id && mailLoadingState === 'loading' && !isDetail(selectedSummary)}
            initialError={message.id === selectedSummary.id && (mailLoadingState === 'error' || mailLoadingState === 'timeout')}
            mailError={message.id === selectedSummary.id ? mailError : null}
            onRetry={message.id === selectedSummary.id ? onRetry : undefined}
            onReply={(mail) => (onReplyForMail ? onReplyForMail(mail) : onReply())}
            onForward={(mail) => (onForwardForMail ? onForwardForMail(mail) : onForward())}
            onDelete={(mail) => (onDeleteMail ? onDeleteMail(mail) : onDelete())}
            onArchive={(mail) => (onArchiveMail ? onArchiveMail(mail) : onArchive?.())}
            onToggleStar={(mail) => (onToggleStarMail ? onToggleStarMail(mail) : onToggleStar?.())}
            onRescan={(mail) => onRescanMail?.(mail)}
            onReplyWithSuggestion={onReplyWithSuggestion}
            onSaveQuickPhrase={onSaveQuickPhrase}
            loadMailBody={loadMailBody}
            onError={onError}
            routingDiagnostics={routingDiagnostics[message.id]}
            contactWiki={contactWiki}
          />
        ))}
      </div>
    </div>
  );
}
