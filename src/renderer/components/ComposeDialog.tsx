import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { CalendarClock, ChevronDown, Globe, Languages, Loader2, Paperclip, X } from 'lucide-react';
import type { AppLanguage } from '../../shared/mailFolders';
import {
  detectAiLanguageFromText,
  getAiLanguageLabel,
  getAiLanguageOptions,
  normalizeAiLanguage,
} from '../utils/aiLanguages';
import {
  buildFieldRowStyle,
  buildIconButtonStyle,
  buildModalShellStyle,
  uiColor,
  uiRadius,
} from '../utils/uiDesignTokens';
import {
  buildComposeHtmlBodyFromEditableHtml,
  buildComposeRecipientOption,
  buildComposeTextBody,
  convertComposePlainTextToHtml,
  filterRecipientSuggestions,
  normalizeComposeEditorText,
  normalizeComposeRecipientInput,
  sanitizeComposeEditableHtml,
  type ComposeDraftOption,
  type ComposeQuotedOriginal,
  type ComposeRecipientOption,
} from '../utils/composeDraft';
import {
  normalizeOutgoingAttachments,
  type OutgoingAttachmentReference,
} from '../../shared/outgoingAttachments';
import {
  applySignatureToBody,
  collectSignatureTexts,
  getDefaultComposeCursorPosition,
  getSignatureForAccount,
  stripSignatureMarkerBeforeSend,
  type ComposeSignatureSettings,
} from '../../shared/compose/signatures';
import {
  insertTextAtSelection,
  type ComposeQuickPhraseSettings,
} from '../../shared/compose/quickPhrases';
import {
  applyComposeTemplateToDraft,
  type ComposeTemplate,
  type ComposeTemplateSettings,
} from '../../shared/compose/templates';
import {
  getSchedulePresetTime,
  validateScheduledAt,
  type ComposeSchedulePreset,
} from '../../shared/compose/scheduleSend';

type ComposeUiLabels = {
  composeTitle: string;
  draftLabel: string;
  fromLabel: string;
  toLabel: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  aiAssistantLabel: string;
  aiPolishLabel: string;
  aiTranslateLabel: string;
  cancelLabel: string;
  sendLabel: string;
  sendNowLabel: string;
  sendingLabel: string;
  sendLaterLabel: string;
  scheduleIn10MinutesLabel: string;
  scheduleThisEveningLabel: string;
  scheduleTomorrowMorningLabel: string;
  scheduleCustomTimeLabel: string;
  scheduleCustomTimePlaceholder: string;
  scheduleConfirmLabel: string;
  scheduleNoticeTitle: string;
  scheduleNoticeBody: string;
  schedulePastTimeError: string;
  scheduleFailed: string;
  saveDraftLabel: string;
  savingDraftLabel: string;
  draftSavedLabel: string;
  chooseDraftLabel: string;
  noDraftsLabel: string;
  deleteDraftLabel: string;
  recipientRequired: string;
  subjectRequired: string;
  accountRequired: string;
  multipleRecipients: string;
  helperSubtitle: string;
  recipientsHint: string;
  quotedOriginalLabel: string;
  originalAttachmentsLabel: string;
  addAttachmentLabel: string;
  removeAttachmentLabel: string;
  attachmentUnavailableLabel: string;
  showOriginal: string;
  hideOriginal: string;
  quickTranslate: string;
  quickTranslateUnavailable: string;
  quickTranslateTo: (language: string) => string;
  quickTranslateBack: (language: string) => string;
  quickPhrasesLabel: string;
  quickPhrasesEmpty: string;
  templatesLabel: string;
  templatesEmpty: string;
  replaceBodyLabel: string;
  insertAtCursorLabel: string;
  cancelTemplateLabel: string;
  polishFailed: string;
  translateFailed: string;
  polishModes: Record<'formal' | 'friendly' | 'shorter' | 'longer' | 'proofread' | 'simplify' | 'bullet_points', string>;
};

type ComposeTranslator = (key: string, options?: Record<string, unknown>) => string;

let composeRichTextFormatsRegistered = false;

const COMPOSE_RICH_TEXT_FONTS = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Trebuchet MS',
  'Helvetica',
  'sans-serif',
  'serif',
  'monospace',
] as const;

const COMPOSE_RICH_TEXT_SIZES = [
  false,
  '8px',
  '10px',
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
  '28px',
  '32px',
  '36px',
  '48px',
] as const;

function improveComposeRichTextToolbarLabels(toolbar: HTMLElement): void {
  const labels: Record<string, string> = {
    '.ql-font .ql-picker-label': 'Font',
    '.ql-size .ql-picker-label': 'Size',
    '.ql-color .ql-picker-label': 'Text color',
    '.ql-align .ql-picker-label': 'Text alignment',
    '.ql-bold': 'Bold',
    '.ql-italic': 'Italic',
    '.ql-underline': 'Underline',
    '.ql-list[value="bullet"]': 'Bulleted list',
    '.ql-list[value="ordered"]': 'Numbered list',
    '.ql-link': 'Insert link',
    '.ql-image': 'Insert image',
  };

  Object.entries(labels).forEach(([selector, label]) => {
    toolbar.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.setAttribute('title', label);
      element.setAttribute('aria-label', label);
    });
  });
}

function registerComposeRichTextFormats(): void {
  if (composeRichTextFormatsRegistered) return;
  composeRichTextFormatsRegistered = true;

  const Font = Quill.import('formats/font') as { FontStyle?: { whitelist?: string[] } };
  if (Font.FontStyle) {
    Font.FontStyle.whitelist = [...COMPOSE_RICH_TEXT_FONTS];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Quill.register(Font.FontStyle as any, true);
  }

  const Size = Quill.import('attributors/style/size') as unknown as { whitelist?: Array<string | false> };
  if (Size) {
    Size.whitelist = COMPOSE_RICH_TEXT_SIZES.filter((size) => Boolean(size)) as Array<string | false>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Quill.register(Size as any, true);
  }

  const Align = Quill.import('formats/align') as { AlignStyle?: { whitelist?: string[] } };
  if (Align.AlignStyle) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Quill.register(Align.AlignStyle as any, true);
  }
}

function labelWithFallback(
  t: ComposeTranslator,
  key: string,
  appLanguage: AppLanguage,
  fallbacks: Record<AppLanguage, string>,
): string {
  // Use i18n when it returns a real translation; otherwise fall back to
  // the inline per-language string. i18next returns the key itself when
  // a translation is missing, which is indistinguishable from a real
  // translation whose text equals the key — only fall back when the
  // translation differs from the key.
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return fallbacks[appLanguage] || fallbacks.en || translated;
}

function buildComposeUiLabels(t: ComposeTranslator, appLanguage: AppLanguage): ComposeUiLabels {
  return {
    composeTitle: t('composeDialog.composeTitle'),
    draftLabel: t('composeDialog.draftLabel'),
    fromLabel: t('composeDialog.fromLabel'),
    toLabel: t('composeDialog.toLabel'),
    subjectLabel: t('composeDialog.subjectLabel'),
    subjectPlaceholder: t('composeDialog.subjectPlaceholder'),
    bodyLabel: t('composeDialog.bodyLabel'),
    bodyPlaceholder: t('composeDialog.bodyPlaceholder'),
    aiAssistantLabel: t('composeDialog.aiAssistantLabel'),
    aiPolishLabel: t('composeDialog.aiPolishLabel'),
    aiTranslateLabel: t('composeDialog.aiTranslateLabel'),
    cancelLabel: t('composeDialog.cancelLabel'),
    sendLabel: t('composeDialog.sendLabel'),
    sendNowLabel: t('composeDialog.sendNowLabel'),
    sendingLabel: t('composeDialog.sendingLabel'),
    sendLaterLabel: t('composeDialog.sendLaterLabel'),
    scheduleIn10MinutesLabel: t('composeDialog.scheduleIn10MinutesLabel'),
    scheduleThisEveningLabel: t('composeDialog.scheduleThisEveningLabel'),
    scheduleTomorrowMorningLabel: t('composeDialog.scheduleTomorrowMorningLabel'),
    scheduleCustomTimeLabel: t('composeDialog.scheduleCustomTimeLabel'),
    scheduleCustomTimePlaceholder: t('composeDialog.scheduleCustomTimePlaceholder'),
    scheduleConfirmLabel: t('composeDialog.scheduleConfirmLabel'),
    scheduleNoticeTitle: t('composeDialog.scheduleNoticeTitle'),
    scheduleNoticeBody: t('composeDialog.scheduleNoticeBody'),
    schedulePastTimeError: t('composeDialog.schedulePastTimeError'),
    scheduleFailed: t('composeDialog.scheduleFailed'),
    saveDraftLabel: t('composeDialog.saveDraftLabel'),
    savingDraftLabel: t('composeDialog.savingDraftLabel'),
    draftSavedLabel: t('composeDialog.draftSavedLabel'),
    chooseDraftLabel: t('composeDialog.chooseDraftLabel'),
    noDraftsLabel: t('composeDialog.noDraftsLabel'),
    deleteDraftLabel: t('composeDialog.deleteDraftLabel'),
    recipientRequired: t('composeDialog.recipientRequired'),
    subjectRequired: t('composeDialog.subjectRequired'),
    accountRequired: t('composeDialog.accountRequired'),
    multipleRecipients: t('composeDialog.multipleRecipients'),
    helperSubtitle: t('composeDialog.helperSubtitle'),
    recipientsHint: t('composeDialog.recipientsHint'),
    quotedOriginalLabel: t('composeDialog.quotedOriginalLabel'),
    originalAttachmentsLabel: t('composeDialog.originalAttachmentsLabel'),
    addAttachmentLabel: labelWithFallback(t, 'composeDialog.addAttachmentLabel', appLanguage, {
      zh: '添加附件',
      en: 'Add attachment',
      ja: '添付を追加',
      ko: '첨부 추가',
      es: 'Añadir adjunto',
      fr: 'Ajouter une pièce jointe',
      de: 'Anhang hinzufügen',
      ru: 'Добавить вложение',
    }),
    removeAttachmentLabel: labelWithFallback(t, 'composeDialog.removeAttachmentLabel', appLanguage, {
      zh: '移除附件',
      en: 'Remove attachment',
      ja: '添付を削除',
      ko: '첨부 제거',
      es: 'Quitar adjunto',
      fr: 'Retirer la pièce jointe',
      de: 'Anhang entfernen',
      ru: 'Удалить вложение',
    }),
    attachmentUnavailableLabel: labelWithFallback(t, 'composeDialog.attachmentUnavailableLabel', appLanguage, {
      zh: '此原邮件附件无法自动随转发发送。',
      en: 'This original attachment cannot be forwarded automatically.',
      ja: 'この元メールの添付ファイルは自動転送できません。',
      ko: '이 원본 첨부 파일은 자동으로 전달할 수 없습니다.',
      es: 'Este adjunto original no se puede reenviar automáticamente.',
      fr: 'Cette pièce jointe d’origine ne peut pas être transférée automatiquement.',
      de: 'Dieser ursprüngliche Anhang kann nicht automatisch weitergeleitet werden.',
      ru: 'Это исходное вложение нельзя автоматически переслать.',
    }),
    showOriginal: t('composeDialog.showOriginal'),
    hideOriginal: t('composeDialog.hideOriginal'),
    quickTranslate: t('composeDialog.quickTranslate'),
    quickTranslateUnavailable: t('composeDialog.quickTranslateUnavailable'),
    quickTranslateTo: (language) => t('composeDialog.quickTranslateTo', { language }),
    quickTranslateBack: (language) => t('composeDialog.quickTranslateBack', { language }),
    quickPhrasesLabel: t('composeDialog.quickPhrasesLabel'),
    quickPhrasesEmpty: t('composeDialog.quickPhrasesEmpty'),
    templatesLabel: t('composeDialog.templatesLabel'),
    templatesEmpty: t('composeDialog.templatesEmpty'),
    replaceBodyLabel: t('composeDialog.replaceBodyLabel'),
    insertAtCursorLabel: t('composeDialog.insertAtCursorLabel'),
    cancelTemplateLabel: t('composeDialog.cancelTemplateLabel'),
    polishFailed: t('composeDialog.polishFailed'),
    translateFailed: t('composeDialog.translateFailed'),
    polishModes: {
      formal: labelWithFallback(t, 'composeDialog.polishFormal', appLanguage, { zh: '正式', en: 'Formal', ja: 'フォーマル', ko: '격식 있게', es: 'Formal', fr: 'Formel', de: 'Formell', ru: 'Формально' }),
      friendly: labelWithFallback(t, 'composeDialog.polishFriendly', appLanguage, { zh: '友好', en: 'Friendly', ja: '親しみやすく', ko: '친근하게', es: 'Amable', fr: 'Amical', de: 'Freundlich', ru: 'Дружелюбно' }),
      shorter: labelWithFallback(t, 'composeDialog.polishShorter', appLanguage, { zh: '更短', en: 'Shorter', ja: '短く', ko: '더 짧게', es: 'Más corto', fr: 'Plus court', de: 'Kürzer', ru: 'Короче' }),
      longer: labelWithFallback(t, 'composeDialog.polishLonger', appLanguage, { zh: '扩写', en: 'Longer', ja: '詳しく', ko: '더 길게', es: 'Más largo', fr: 'Plus long', de: 'Länger', ru: 'Подробнее' }),
      proofread: labelWithFallback(t, 'composeDialog.polishProofread', appLanguage, { zh: '校对', en: 'Proofread', ja: '校正', ko: '교정', es: 'Corregir', fr: 'Relire', de: 'Korrektur', ru: 'Вычитка' }),
      simplify: labelWithFallback(t, 'composeDialog.polishSimplify', appLanguage, { zh: '简化', en: 'Simplify', ja: '簡潔に', ko: '단순화', es: 'Simplificar', fr: 'Simplifier', de: 'Vereinfachen', ru: 'Упростить' }),
      bullet_points: labelWithFallback(t, 'composeDialog.polishBullets', appLanguage, { zh: '要点', en: 'Bullets', ja: '箇条書き', ko: '요점', es: 'Viñetas', fr: 'Puces', de: 'Stichpunkte', ru: 'Пункты' }),
    },
  };
}

interface ComposeDialogProps {
  t: ComposeTranslator;
  isOpen: boolean;
  onClose: () => void;
  onSaveDraft: (options: {
    accountId: number;
    to: string[];
    subject: string;
    body: string;
    bodyHtml?: string;
    draftKey: string;
    quotedOriginal?: ComposeQuotedOriginal | null;
    outgoingAttachments?: OutgoingAttachmentReference[];
  }) => Promise<void> | void;
  onDeleteDraft?: (draftId: string, draft?: ComposeDraftOption) => Promise<void> | void;
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
    bodyText: string;
    bodyHtml?: string;
    editableBody: string;
    draftKey: string;
    sourceDraft?: Pick<ComposeDraftOption, 'id' | 'accountId' | 'uid' | 'folder' | 'messageId' | 'localOnly' | 'draftKey'> | null;
    outgoingAttachments?: OutgoingAttachmentReference[];
  }) => Promise<{ success: boolean; message: string }>;
  onScheduleSend?: (options: {
    accountId: number;
    fromEmail: string;
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    editableBody: string;
    draftKey: string;
    scheduledAt: string;
    quotedOriginal?: ComposeQuotedOriginal | null;
    sourceDraft?: Pick<ComposeDraftOption, 'id' | 'accountId' | 'uid' | 'folder' | 'messageId' | 'localOnly' | 'draftKey'> | null;
    outgoingAttachments?: OutgoingAttachmentReference[];
  }) => Promise<{ success: boolean; message: string }>;
  initialRecipients?: ComposeRecipientOption[];
  initialSubject?: string;
  initialEditableBody?: string;
  initialEditableHtml?: string;
  initialQuotedOriginal?: ComposeQuotedOriginal | null;
  initialOutgoingAttachments?: OutgoingAttachmentReference[];
  initialHydrateKey?: string;
  draftOptions?: ComposeDraftOption[];
  recipientSuggestions?: ComposeRecipientOption[];
  composeSignatureSettings?: ComposeSignatureSettings;
  composeQuickPhraseSettings?: ComposeQuickPhraseSettings;
  composeTemplateSettings?: ComposeTemplateSettings;
  appLanguage: AppLanguage;
  aiTargetLanguage: string;
  sourceLanguageSample?: string;
}

function sanitizeQuotedOriginalHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'pre', 'code',
      'html', 'body', 'center',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'style', 'class', 'target',
      'width', 'height', 'colspan', 'rowspan',
      'bgcolor', 'align', 'valign', 'cellpadding', 'cellspacing', 'border', 'dir',
    ],
  });
}

function sanitizeComposeEditorHtml(value: string): string {
  return sanitizeComposeEditableHtml(DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div',
      'img', 'hr', 'pre', 'code',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'style', 'class', 'target',
      'width', 'height', 'align',
    ],
    ALLOW_DATA_ATTR: false,
  }));
}

function buildOriginalOutgoingAttachments(quotedOriginal?: ComposeQuotedOriginal | null): OutgoingAttachmentReference[] {
  if (quotedOriginal?.mode !== 'forward') return [];
  return (quotedOriginal.attachments || [])
    .filter((attachment) =>
      attachment.cacheId &&
      attachment.accountId != null &&
      attachment.uid != null &&
      attachment.folder &&
      !attachment.inline &&
      attachment.disposition !== 'inline' &&
      !attachment.cid &&
      !attachment.contentId
    )
    .map((attachment) => ({
      kind: 'originalMailAttachment',
      id: `original:${attachment.accountId}:${attachment.folder}:${attachment.uid}:${attachment.cacheId}`,
      accountId: Number(attachment.accountId),
      folder: String(attachment.folder),
      uid: Number(attachment.uid),
      attachmentCacheId: String(attachment.cacheId),
      filename: attachment.filename || 'attachment',
      contentType: attachment.contentType,
      size: attachment.size,
    }));
}

export function ComposeDialog({
  t,
  isOpen,
  onClose,
  onSaveDraft: _onSaveDraft,
  accounts,
  selectedAccount,
  onSend,
  onScheduleSend,
  onDeleteDraft,
  initialRecipients,
  initialSubject,
  initialEditableBody,
  initialEditableHtml,
  initialQuotedOriginal,
  initialOutgoingAttachments,
  initialHydrateKey,
  draftOptions = [],
  recipientSuggestions = [],
  composeSignatureSettings,
  composeQuickPhraseSettings,
  composeTemplateSettings,
  appLanguage,
  aiTargetLanguage,
  sourceLanguageSample,
}: ComposeDialogProps) {
  const [from, setFrom] = useState('');
  const [recipients, setRecipients] = useState<ComposeRecipientOption[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showDraftMenu, setShowDraftMenu] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showQuickPhraseMenu, setShowQuickPhraseMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<ComposeTemplate | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [quickTranslateToggled, setQuickTranslateToggled] = useState(false);
  const [showRecipientSuggestions, setShowRecipientSuggestions] = useState(false);
  const [showQuotedOriginal, setShowQuotedOriginal] = useState(false);
  const [currentQuotedOriginal, setCurrentQuotedOriginal] = useState<ComposeQuotedOriginal | null>(null);
  const [activeDraftSource, setActiveDraftSource] = useState<ComposeDraftOption | null>(null);
  const [outgoingAttachments, setOutgoingAttachments] = useState<OutgoingAttachmentReference[]>([]);
  const [customScheduleValue, setCustomScheduleValue] = useState('');
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const richTextContainerRef = useRef<HTMLDivElement | null>(null);
  const richTextEditorRef = useRef<Quill | null>(null);
  const applyingRichTextRef = useRef(false);
  const bodyRef = useRef('');
  const bodyHtmlRef = useRef('');
  const bodySelectionRef = useRef<{ start: number; end: number; userSet: boolean }>({ start: 0, end: 0, userSet: false });
  const lastInitialHydrateKeyRef = useRef<string | null>(null);
  const signatureApplyKeyRef = useRef<string | null>(null);

  const composeUi = useMemo(() => buildComposeUiLabels(t, appLanguage), [t, appLanguage]);
  const aiLanguages = useMemo(() => getAiLanguageOptions(appLanguage), [appLanguage]);
  const normalizedTargetLanguage = useMemo(
    () => normalizeAiLanguage(aiTargetLanguage),
    [aiTargetLanguage],
  );
  const sourceLanguage = useMemo(
    () => detectAiLanguageFromText(sourceLanguageSample || ''),
    [sourceLanguageSample],
  );
  const sourceLanguageLabel = sourceLanguage
    ? getAiLanguageLabel(sourceLanguage, appLanguage)
    : null;
  const appTargetLanguageLabel = getAiLanguageLabel(normalizedTargetLanguage, appLanguage);
  const quickTranslateTarget = quickTranslateToggled ? normalizedTargetLanguage : sourceLanguage;
  const quickTranslateLabel = quickTranslateToggled
    ? composeUi.quickTranslateBack(appTargetLanguageLabel)
    : composeUi.quickTranslateTo(sourceLanguageLabel || appTargetLanguageLabel);
  const knownSignatureTexts = useMemo(
    () => collectSignatureTexts(composeSignatureSettings),
    [composeSignatureSettings],
  );
  const quickPhrases = useMemo(
    () => (composeQuickPhraseSettings?.phrases || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [composeQuickPhraseSettings],
  );
  const templates = useMemo(
    () => (composeTemplateSettings?.templates || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [composeTemplateSettings],
  );

  const createLocalDraftKey = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const getRichTextHtml = () => sanitizeComposeEditorHtml(
    richTextEditorRef.current?.root.innerHTML || bodyHtmlRef.current,
  );

  const focusRichTextAt = (cursor: number) => {
    requestAnimationFrame(() => {
      const editor = richTextEditorRef.current;
      if (!editor) return;
      const maxIndex = Math.max(0, editor.getLength() - 1);
      const safeCursor = Math.max(0, Math.min(maxIndex, cursor));
      editor.focus();
      editor.setSelection(safeCursor, 0, 'silent');
    });
  };

  const setPlainBodyState = (nextBody: string, options: { cursor?: number; userSet?: boolean; focus?: boolean } = {}) => {
    const normalizedBody = String(nextBody || '').replace(/\r\n/g, '\n');
    const nextHtml = convertComposePlainTextToHtml(normalizedBody);
    bodyRef.current = normalizedBody;
    bodyHtmlRef.current = nextHtml;
    setBody(normalizedBody);
    setBodyHtml(nextHtml);

    const editor = richTextEditorRef.current;
    if (editor) {
      applyingRichTextRef.current = true;
      editor.clipboard.dangerouslyPasteHTML(nextHtml || '<p><br></p>', 'silent');
      applyingRichTextRef.current = false;
    }

    if (typeof options.cursor === 'number') {
      bodySelectionRef.current = {
        start: options.cursor,
        end: options.cursor,
        userSet: Boolean(options.userSet),
      };
      if (options.focus !== false) {
        focusRichTextAt(options.cursor);
      }
    }
  };

  const setRichBodyState = (nextBody: string, nextHtml: string) => {
    const normalizedBody = normalizeComposeEditorText(nextBody);
    const sanitizedHtml = sanitizeComposeEditorHtml(nextHtml);
    bodyRef.current = normalizedBody;
    bodyHtmlRef.current = sanitizedHtml;
    setBody(normalizedBody);
    setBodyHtml(sanitizedHtml);
  };

  const getBodySelection = (currentBody: string) => {
    const storedSelection = bodySelectionRef.current;
    const fallbackCursor = getDefaultComposeCursorPosition(currentBody);
    if (!storedSelection.userSet) {
      return { start: fallbackCursor, end: fallbackCursor };
    }

    const editorSelection = richTextEditorRef.current?.getSelection();
    if (editorSelection) {
      return {
        start: editorSelection.index,
        end: editorSelection.index + editorSelection.length,
      };
    }

    return storedSelection;
  };

  const resetComposeToBlankDraft = () => {
    setDraftKey(createLocalDraftKey());
    setSubject('');
    setPlainBodyState('', { cursor: 0, userSet: false, focus: false });
    setRecipients([]);
    setRecipientInput('');
    setCurrentQuotedOriginal(null);
    setActiveDraftSource(null);
    setOutgoingAttachments([]);
    signatureApplyKeyRef.current = null;
    bodySelectionRef.current = { start: 0, end: 0, userSet: false };
    setShowQuotedOriginal(false);
    setShowDraftMenu(false);
    setShowScheduleMenu(false);
    setShowQuickPhraseMenu(false);
    setShowTemplateMenu(false);
    setCustomScheduleValue('');
    setPendingTemplate(null);
    setError(null);
    setStatusMessage(null);
    setQuickTranslateToggled(false);
  };

  useEffect(() => {
    if (!isOpen) {
      richTextEditorRef.current = null;
      return;
    }
    const container = richTextContainerRef.current;
    if (!container || richTextEditorRef.current) return;

    registerComposeRichTextFormats();
    const editor = new Quill(container, {
      theme: 'snow',
      placeholder: composeUi.bodyPlaceholder,
      modules: {
        toolbar: [
          [{ font: [...COMPOSE_RICH_TEXT_FONTS] }, { size: [...COMPOSE_RICH_TEXT_SIZES] }],
          ['bold', 'italic', 'underline'],
          [{ color: [] }],
          [{ list: 'bullet' }, { list: 'ordered' }],
          [{ align: [] }],
          ['link', 'image'],
        ],
      },
      formats: ['font', 'size', 'color', 'bold', 'italic', 'underline', 'list', 'align', 'link', 'image'],
    });
    richTextEditorRef.current = editor;
    const toolbar = container.previousElementSibling;
    if (toolbar instanceof HTMLElement) {
      improveComposeRichTextToolbarLabels(toolbar);
    }
    editor.root.setAttribute('aria-label', composeUi.bodyLabel);
    editor.root.classList.add('compose-rich-text-root');

    const initialHtml = bodyHtmlRef.current || convertComposePlainTextToHtml(bodyRef.current);
    applyingRichTextRef.current = true;
    editor.clipboard.dangerouslyPasteHTML(initialHtml || '<p><br></p>', 'silent');
    applyingRichTextRef.current = false;
    const initialCursor = bodySelectionRef.current.start || getDefaultComposeCursorPosition(bodyRef.current);
    focusRichTextAt(initialCursor);

    editor.on('text-change', () => {
      if (applyingRichTextRef.current) return;
      setRichBodyState(editor.getText(), editor.root.innerHTML);
      const selection = editor.getSelection();
      if (selection) {
        bodySelectionRef.current = {
          start: selection.index,
          end: selection.index + selection.length,
          userSet: true,
        };
      }
    });

    editor.on('selection-change', (range) => {
      if (!range) return;
      bodySelectionRef.current = {
        start: range.index,
        end: range.index + range.length,
        userSet: true,
      };
    });
  }, [composeUi.bodyLabel, composeUi.bodyPlaceholder, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (lastInitialHydrateKeyRef.current === initialHydrateKey) return;
    lastInitialHydrateKeyRef.current = initialHydrateKey || null;

    setFrom(selectedAccount?.email || accounts[0]?.email || '');
    setRecipients(initialRecipients || []);
    setRecipientInput('');
    setSubject(initialSubject || '');
    const hydratedBody = initialEditableBody || '';
    const hydratedHtml = initialEditableHtml
      ? sanitizeComposeEditorHtml(initialEditableHtml)
      : convertComposePlainTextToHtml(hydratedBody);
    bodyRef.current = hydratedBody;
    bodyHtmlRef.current = hydratedHtml;
    setBody(hydratedBody);
    setBodyHtml(hydratedHtml);
    if (richTextEditorRef.current) {
      applyingRichTextRef.current = true;
      richTextEditorRef.current.clipboard.dangerouslyPasteHTML(hydratedHtml || '<p><br></p>', 'silent');
      applyingRichTextRef.current = false;
    }
    signatureApplyKeyRef.current = null;
    bodySelectionRef.current = {
      start: getDefaultComposeCursorPosition(hydratedBody),
      end: getDefaultComposeCursorPosition(hydratedBody),
      userSet: false,
    };
    setError(null);
    setStatusMessage(null);
    setShowLangMenu(false);
    setShowDraftMenu(false);
    setShowScheduleMenu(false);
    setShowQuickPhraseMenu(false);
    setShowTemplateMenu(false);
    setCustomScheduleValue('');
    setPendingTemplate(null);
    setQuickTranslateToggled(false);
    setShowRecipientSuggestions(false);
    setShowQuotedOriginal(false);
    setCurrentQuotedOriginal(initialQuotedOriginal || null);
    const normalizedInitialAttachments = normalizeOutgoingAttachments(initialOutgoingAttachments);
    setOutgoingAttachments(
      normalizedInitialAttachments.length > 0
        ? normalizedInitialAttachments
        : buildOriginalOutgoingAttachments(initialQuotedOriginal)
    );
    setActiveDraftSource(null);
    setDraftKey(createLocalDraftKey());
  }, [accounts, initialEditableBody, initialEditableHtml, initialHydrateKey, initialOutgoingAttachments, initialQuotedOriginal, initialRecipients, initialSubject, isOpen, selectedAccount]);

  useEffect(() => {
    if (!isOpen) {
      lastInitialHydrateKeyRef.current = null;
      signatureApplyKeyRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const account = accounts.find((item) => item.email === from);
    const signature = getSignatureForAccount(composeSignatureSettings, account?.id);
    const signatureKey = `${account?.id || 'none'}:${signature?.updatedAt || 'none'}:${signature?.text || ''}`;
    if (signatureApplyKeyRef.current === signatureKey) return;
    signatureApplyKeyRef.current = signatureKey;

    const nextBody = applySignatureToBody(bodyRef.current, signature, {
      knownSignatures: knownSignatureTexts,
    });
    if (!bodySelectionRef.current.userSet) {
      const cursor = getDefaultComposeCursorPosition(nextBody);
      setPlainBodyState(nextBody, { cursor, userSet: false, focus: true });
    } else {
      setPlainBodyState(nextBody, { focus: false });
    }
  }, [accounts, composeSignatureSettings, from, isOpen, knownSignatureTexts]);

  const filteredSuggestions = useMemo(
    () => filterRecipientSuggestions(
      recipientSuggestions,
      recipientInput,
      recipients.map((item) => item.email),
    ),
    [recipientInput, recipientSuggestions, recipients],
  );

  const sanitizedQuotedOriginalHtml = useMemo(
    () => currentQuotedOriginal?.html ? sanitizeQuotedOriginalHtml(currentQuotedOriginal.html) : '',
    [currentQuotedOriginal],
  );
  const unavailableOriginalAttachmentIds = useMemo(() => {
    if (currentQuotedOriginal?.mode !== 'forward') return new Set<string>();
    const forwardedIds = new Set(
      outgoingAttachments
        .filter((attachment) => attachment.kind === 'originalMailAttachment')
        .map((attachment) => String(attachment.attachmentCacheId))
    );
    return new Set(
      (currentQuotedOriginal.attachments || [])
        .filter((attachment) => attachment.cacheId && !forwardedIds.has(String(attachment.cacheId)))
        .map((attachment) => String(attachment.cacheId))
    );
  }, [currentQuotedOriginal, outgoingAttachments]);

  const handleInsertQuickPhrase = (phraseText: string) => {
    const currentBody = bodyRef.current;
    const selection = getBodySelection(currentBody);
    const result = insertTextAtSelection(currentBody, phraseText, selection.start, selection.end);
    setPlainBodyState(result.body, { cursor: result.cursor, userSet: true });
    setShowQuickPhraseMenu(false);
  };

  const applyTemplate = (template: ComposeTemplate, mode: 'replace' | 'insert') => {
    const currentBody = bodyRef.current;
    const fallbackCursor = getDefaultComposeCursorPosition(currentBody);
    const selection = mode === 'insert'
      ? getBodySelection(currentBody)
      : { start: 0, end: fallbackCursor };
    const result = applyComposeTemplateToDraft({
      currentSubject: subject,
      currentBody,
      template,
      mode,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    });
    setSubject(result.subject);

    if (template.bodyHtml && richTextEditorRef.current) {
      const editor = richTextEditorRef.current;
      const sanitizedHtml = sanitizeComposeEditorHtml(template.bodyHtml);
      applyingRichTextRef.current = true;
      editor.deleteText(selection.start, Math.max(0, selection.end - selection.start), 'silent');
      editor.clipboard.dangerouslyPasteHTML(selection.start, sanitizedHtml || '<p><br></p>', 'silent');
      applyingRichTextRef.current = false;
      setRichBodyState(editor.getText(), editor.root.innerHTML);
      bodySelectionRef.current = {
        start: result.cursor,
        end: result.cursor,
        userSet: true,
      };
      focusRichTextAt(result.cursor);
      setPendingTemplate(null);
      setShowTemplateMenu(false);
      return;
    }

    setPlainBodyState(result.body, { cursor: result.cursor, userSet: true });
    setPendingTemplate(null);
    setShowTemplateMenu(false);
  };

  const handleSelectTemplate = (template: ComposeTemplate) => {
    const editablePrefix = body.slice(0, getDefaultComposeCursorPosition(body)).trim();
    if (editablePrefix) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template, 'insert');
  };

  const addRecipient = (option: ComposeRecipientOption) => {
    setRecipients((prev) => {
      if (prev.some((item) => item.email === option.email)) return prev;
      return [...prev, option];
    });
    setRecipientInput('');
    setShowRecipientSuggestions(false);
    setTimeout(() => recipientInputRef.current?.focus(), 0);
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((item) => item.email !== email));
  };

  const applyDraft = (draft: ComposeDraftOption) => {
    const account = accounts.find((item) => item.id === draft.accountId);
    if (account) {
      setFrom(account.email);
    }
    setRecipients(draft.recipients);
    setRecipientInput('');
    setSubject(draft.subject);
    if (draft.bodyHtml) {
      const normalizedBody = draft.body;
      const sanitizedHtml = sanitizeComposeEditorHtml(draft.bodyHtml);
      bodyRef.current = normalizedBody;
      bodyHtmlRef.current = sanitizedHtml;
      setBody(normalizedBody);
      setBodyHtml(sanitizedHtml);
      if (richTextEditorRef.current) {
        applyingRichTextRef.current = true;
        richTextEditorRef.current.clipboard.dangerouslyPasteHTML(sanitizedHtml || '<p><br></p>', 'silent');
        applyingRichTextRef.current = false;
      }
      const cursor = getDefaultComposeCursorPosition(normalizedBody);
      bodySelectionRef.current = { start: cursor, end: cursor, userSet: false };
      focusRichTextAt(cursor);
    } else {
      const cursor = getDefaultComposeCursorPosition(draft.body);
      setPlainBodyState(draft.body, { cursor, userSet: false });
    }
    setDraftKey(draft.draftKey);
    setCurrentQuotedOriginal(draft.quotedOriginal || null);
    const normalizedDraftAttachments = normalizeOutgoingAttachments(draft.outgoingAttachments);
    setOutgoingAttachments(
      normalizedDraftAttachments.length > 0
        ? normalizedDraftAttachments
        : buildOriginalOutgoingAttachments(draft.quotedOriginal)
    );
    setActiveDraftSource(draft);
    setShowQuotedOriginal(false);
    setShowDraftMenu(false);
    setError(null);
    setStatusMessage(null);
  };

  const removeOutgoingAttachment = (attachmentId: string) => {
    setOutgoingAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleAddAttachments = async () => {
    setError(null);
    try {
      const response = await window.electronAPI.invoke('mail:selectOutgoingAttachments') as {
        success?: boolean;
        data?: OutgoingAttachmentReference[];
        error?: string;
      } | undefined;
      if (response?.success === false) {
        if (response.error && response.error !== 'cancelled') setError(response.error);
        return;
      }
      const selected = normalizeOutgoingAttachments(response?.data);
      if (selected.length === 0) return;
      setOutgoingAttachments((prev) => {
        const byId = new Map(prev.map((attachment) => [attachment.id, attachment]));
        for (const attachment of selected) {
          byId.set(attachment.id, attachment);
        }
        return Array.from(byId.values());
      });
    } catch (err) {
      setError((err as Error).message || composeUi.attachmentUnavailableLabel);
    }
  };

  const resolveRecipientsForSend = (): ComposeRecipientOption[] => {
    const pending = normalizeComposeRecipientInput(recipientInput)
      .map((value) => buildComposeRecipientOption(value, value.split('@')[0]))
      .filter((value): value is ComposeRecipientOption => Boolean(value));

    const merged = [...recipients];
    for (const option of pending) {
      if (!merged.some((item) => item.email === option.email)) {
        merged.push(option);
      }
    }
    return merged;
  };

  const handlePolish = async (
    style: 'formal' | 'friendly' | 'shorter' | 'longer' | 'proofread' | 'simplify' | 'bullet_points' = 'formal',
  ) => {
    if (!body.trim()) return;

    setAiLoading(true);
    setError(null);

    try {
      const res = await window.electronAPI.invoke(
        'ai:polish',
        body,
        style,
        normalizeAiLanguage(aiTargetLanguage),
      ) as {
        success: boolean;
        content?: string;
        error?: string;
      };

      if (res.success && res.content) {
        const cursor = getDefaultComposeCursorPosition(res.content);
        setPlainBodyState(res.content, { cursor, userSet: false });
      } else {
        setError(res.error || composeUi.polishFailed);
      }
    } catch (err) {
      setError((err as Error).message || composeUi.polishFailed);
    } finally {
      setAiLoading(false);
    }
  };

  const handleTranslate = async (targetLang: string) => {
    if (!body.trim()) return;

    setAiLoading(true);
    setError(null);
    setShowLangMenu(false);

    try {
      const res = await window.electronAPI.invoke('ai:translate', body, normalizeAiLanguage(targetLang)) as {
        success: boolean;
        content?: string;
        error?: string;
      };

      if (res.success && res.content) {
        const cursor = getDefaultComposeCursorPosition(res.content);
        setPlainBodyState(res.content, { cursor, userSet: false });
      } else {
        setError(res.error || composeUi.translateFailed);
      }
    } catch (err) {
      setError((err as Error).message || composeUi.translateFailed);
    } finally {
      setAiLoading(false);
    }
  };

  const handleQuickTranslate = async () => {
    if (!body.trim()) return;
    if (!quickTranslateTarget) {
      setError(composeUi.quickTranslateUnavailable);
      return;
    }

    setAiLoading(true);
    setError(null);
    setShowLangMenu(false);

    try {
      const res = await window.electronAPI.invoke('ai:translate', body, quickTranslateTarget) as {
        success: boolean;
        content?: string;
        error?: string;
      };

      if (res.success && res.content) {
        const cursor = getDefaultComposeCursorPosition(res.content);
        setPlainBodyState(res.content, { cursor, userSet: false });
        setQuickTranslateToggled((prev) => !prev);
      } else {
        setError(res.error || composeUi.translateFailed);
      }
    } catch (err) {
      setError((err as Error).message || composeUi.translateFailed);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCloseRequest = async () => {
    if (sending || scheduling) return;
    onClose();
  };

  const handleSaveDraft = async () => {
    if (sending || scheduling || savingDraft) return;

    const account = accounts.find((item) => item.email === from);
    if (!account) {
      setError(composeUi.accountRequired);
      return;
    }

    setSavingDraft(true);
    setError(null);
    setStatusMessage(null);
    try {
      const resolvedRecipients = resolveRecipientsForSend();
      setRecipients(resolvedRecipients);
      setRecipientInput('');
      await _onSaveDraft({
        accountId: account.id,
        to: resolvedRecipients.map((item) => item.email),
        subject: subject.trim(),
        body: stripSignatureMarkerBeforeSend(body),
        bodyHtml: sanitizeComposeEditorHtml(bodyHtml || bodyHtmlRef.current),
        draftKey,
        quotedOriginal: currentQuotedOriginal,
        outgoingAttachments,
      });
      setStatusMessage(composeUi.draftSavedLabel);
    } finally {
      setSavingDraft(false);
    }
  };

  const buildComposeSendPayload = () => {
    const resolvedRecipients = resolveRecipientsForSend();
    setRecipients(resolvedRecipients);
    setRecipientInput('');

    if (resolvedRecipients.length === 0) {
      setError(composeUi.recipientRequired);
      return null;
    }

    if (!subject.trim()) {
      setError(composeUi.subjectRequired);
      return null;
    }

    const account = accounts.find((item) => item.email === from);
    if (!account) {
      setError(composeUi.accountRequired);
      return null;
    }

    const editableBodyForSend = stripSignatureMarkerBeforeSend(body);
    const editableHtmlForSend = getRichTextHtml()
      || convertComposePlainTextToHtml(editableBodyForSend);
    return {
      account,
      to: resolvedRecipients.map((item) => item.email),
      subject: subject.trim(),
      bodyText: buildComposeTextBody(editableBodyForSend, currentQuotedOriginal),
      bodyHtml: buildComposeHtmlBodyFromEditableHtml(editableHtmlForSend, currentQuotedOriginal) || undefined,
      editableBody: editableBodyForSend,
      draftKey,
      quotedOriginal: currentQuotedOriginal,
      outgoingAttachments,
      sourceDraft: activeDraftSource
        ? {
            id: activeDraftSource.id,
            accountId: activeDraftSource.accountId,
            uid: activeDraftSource.uid,
            folder: activeDraftSource.folder,
            messageId: activeDraftSource.messageId,
            localOnly: activeDraftSource.localOnly,
            draftKey: activeDraftSource.draftKey,
          }
        : null,
    };
  };

  const handleDeleteDraft = async (draft: ComposeDraftOption) => {
    if (!onDeleteDraft) return;
    await onDeleteDraft(draft.id, draft);
    setShowDraftMenu(false);
    if (draft.draftKey === draftKey) {
      resetComposeToBlankDraft();
    }
  };

  const handleSend = async () => {
    if (sending || scheduling) return;

    const payload = buildComposeSendPayload();
    if (!payload) return;

    setSending(true);
    setError(null);

    try {
      const result = await onSend({
        accountId: payload.account.id,
        to: payload.to,
        subject: payload.subject,
        bodyText: payload.bodyText,
        bodyHtml: payload.bodyHtml,
        editableBody: payload.editableBody,
        draftKey: payload.draftKey,
        outgoingAttachments: payload.outgoingAttachments,
        sourceDraft: payload.sourceDraft,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.message);
      }
    } finally {
      setSending(false);
    }
  };

  const handleScheduleSend = async (scheduledAt: Date) => {
    if (sending || scheduling || !onScheduleSend) return;

    const validation = validateScheduledAt(scheduledAt);
    if (!validation.ok || !validation.scheduledAt) {
      setError(composeUi.schedulePastTimeError);
      return;
    }

    const payload = buildComposeSendPayload();
    if (!payload) return;

    setScheduling(true);
    setError(null);

    try {
      const result = await onScheduleSend({
        accountId: payload.account.id,
        fromEmail: payload.account.email,
        to: payload.to,
        subject: payload.subject,
        bodyText: payload.bodyText,
        bodyHtml: payload.bodyHtml,
        editableBody: payload.editableBody,
        draftKey: payload.draftKey,
        scheduledAt: validation.scheduledAt.toISOString(),
        quotedOriginal: payload.quotedOriginal,
        outgoingAttachments: payload.outgoingAttachments,
        sourceDraft: payload.sourceDraft,
      });

      if (result.success) {
        setShowScheduleMenu(false);
        onClose();
      } else {
        setError(result.message || composeUi.scheduleFailed);
      }
    } finally {
      setScheduling(false);
    }
  };

  const handleSchedulePreset = (preset: ComposeSchedulePreset) => {
    void handleScheduleSend(getSchedulePresetTime(preset));
  };

  const handleScheduleCustom = () => {
    const validation = validateScheduledAt(customScheduleValue);
    if (!validation.ok || !validation.scheduledAt) {
      setError(composeUi.schedulePastTimeError);
      return;
    }
    void handleScheduleSend(validation.scheduledAt);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden px-4 py-6 isolation-isolate">
      <div className="absolute inset-0 bg-black/70" onClick={() => void handleCloseRequest()} />

      <div
        className="relative z-10 w-full max-w-4xl max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden rounded-[24px] [-webkit-app-region:drag]"
        style={{ ...buildModalShellStyle(), backgroundColor: '#08111F', borderColor: 'rgba(148,163,184,0.12)' }}
      >
        <div
          className="flex items-center justify-between px-7 py-6"
          style={{ borderBottom: `1px solid ${uiColor.borderSubtle}` }}
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: uiColor.textSubtle }}>
              MiNiMail
            </div>
            <h2 className="mt-2 text-xl font-bold text-zinc-100">
              {`${composeUi.composeTitle} · ${composeUi.draftLabel}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void handleCloseRequest()}
            disabled={sending || scheduling}
            className="p-2 transition-colors disabled:opacity-40 [-webkit-app-region:no-drag]"
            style={buildIconButtonStyle()}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="px-7 py-5 space-y-4 [-webkit-app-region:no-drag]"
          style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.08), rgba(8,17,31,0))' }}
        >
          <div className="relative z-10 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div
              className="rounded-[20px] overflow-visible"
              style={{ backgroundColor: '#0C1729', border: `1px solid ${uiColor.borderSubtle}` }}
            >
              <div className="flex items-center px-5 py-4" style={buildFieldRowStyle()}>
                <label className="w-12 flex-shrink-0 text-sm text-zinc-500">{composeUi.fromLabel}</label>
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="flex-1 cursor-pointer bg-transparent text-sm text-zinc-100 focus:outline-none"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.email} className="bg-zinc-900">
                      {account.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-start px-5 py-4" style={buildFieldRowStyle()}>
                <label className="w-12 flex-shrink-0 pt-1.5 text-sm text-zinc-500">{composeUi.toLabel}</label>
                <div className="relative z-20 flex-1 min-w-0">
                  <div
                    className="flex min-h-[28px] max-h-[96px] flex-wrap items-start gap-2 overflow-y-auto pr-1"
                    style={{ scrollbarGutter: 'stable both-edges' }}
                  >
                    {recipients.map((recipient) => (
                      <button
                        key={recipient.email}
                        type="button"
                        onClick={() => removeRecipient(recipient.email)}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs cursor-pointer"
                        style={{
                          backgroundColor: 'rgba(124,58,237,0.16)',
                          color: '#EDE9FE',
                          border: '1px solid rgba(196,181,253,0.22)',
                        }}
                        title={recipient.email}
                      >
                        <span className="max-w-[180px] truncate">{recipient.label}</span>
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                    <input
                      ref={recipientInputRef}
                      type="text"
                      value={recipientInput}
                      onChange={(e) => {
                        setRecipientInput(e.target.value);
                        setShowRecipientSuggestions(true);
                      }}
                      onFocus={() => setShowRecipientSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowRecipientSuggestions(false), 120);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
                          e.preventDefault();
                          if (filteredSuggestions.length > 0 && recipientInput.trim()) {
                            addRecipient(filteredSuggestions[0]);
                          } else {
                            const values = normalizeComposeRecipientInput(recipientInput);
                            if (!values.length) return;
                            for (const value of values) {
                              const option = buildComposeRecipientOption(value, value.split('@')[0]);
                              if (option) addRecipient(option);
                            }
                          }
                        }
                        if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
                          removeRecipient(recipients[recipients.length - 1].email);
                        }
                      }}
                      className="min-w-[160px] flex-1 bg-transparent text-sm text-zinc-100 focus:outline-none"
                      placeholder={recipients.length === 0 ? composeUi.multipleRecipients : composeUi.recipientsHint}
                    />
                  </div>

                  {showRecipientSuggestions && filteredSuggestions.length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden"
                      style={{
                        backgroundColor: '#2A303A',
                        borderRadius: 16,
                        border: `1px solid ${uiColor.borderSubtle}`,
                        boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                        maxHeight: 248,
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                      }}
                    >
                      {filteredSuggestions.map((option) => (
                        <button
                          key={option.email}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addRecipient(option)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/6 cursor-pointer"
                        >
                          <span
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #60A5FA, #7C3AED)' }}
                          >
                            {option.label.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-zinc-100">{option.label}</div>
                            <div className="truncate text-xs" style={{ color: uiColor.textSubtle }}>
                              {option.email}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex items-center px-5 py-4">
                <label className="w-12 flex-shrink-0 text-sm text-zinc-500">{composeUi.subjectLabel}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-zinc-100 focus:outline-none"
                  placeholder={composeUi.subjectPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowDraftMenu((prev) => !prev)}
                  className="ml-2 flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${uiColor.borderSubtle}` }}
                  title={composeUi.chooseDraftLabel}
                >
                  {composeUi.draftLabel}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDraftMenu ? 'rotate-180' : ''}`} />
                </button>

                {showDraftMenu && (
                  <div
                    className="absolute right-4 top-full z-30 mt-2 w-[360px] overflow-hidden rounded-2xl"
                    style={{
                      backgroundColor: '#202938',
                      border: `1px solid ${uiColor.borderSubtle}`,
                      boxShadow: '0 18px 44px rgba(0,0,0,0.38)',
                    }}
                  >
                    <div
                      className="px-4 py-3 text-xs font-semibold"
                      style={{ color: '#DDD6FE', borderBottom: `1px solid ${uiColor.borderSubtle}` }}
                    >
                      {composeUi.chooseDraftLabel}
                    </div>
                    <div className="max-h-[260px] overflow-y-auto overscroll-contain">
                      {draftOptions.length === 0 ? (
                        <div className="px-4 py-4 text-sm" style={{ color: uiColor.textSubtle }}>
                          {composeUi.noDraftsLabel}
                        </div>
                      ) : (
                        draftOptions.map((draft) => (
                          <div
                            key={draft.id}
                            className="flex items-start gap-2 px-4 py-3"
                            style={{ borderBottom: `1px solid ${uiColor.borderSubtle}` }}
                          >
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => applyDraft(draft)}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="truncate text-sm font-semibold text-zinc-100">
                                {draft.subject || composeUi.draftLabel}
                              </div>
                              <div className="mt-1 truncate text-xs" style={{ color: uiColor.textSubtle }}>
                                {draft.body || draft.recipients.map((item) => item.label).join(', ')}
                              </div>
                            </button>
                            {onDeleteDraft && (
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => void handleDeleteDraft(draft)}
                                className="rounded-lg px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-red-300 cursor-pointer"
                                title={composeUi.deleteDraftLabel}
                              >
                                {composeUi.deleteDraftLabel}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="rounded-[20px] p-5"
              style={{ backgroundColor: '#0B1527', border: `1px solid ${uiColor.borderSubtle}` }}
            >
              <div className="text-[12px] font-semibold" style={{ color: '#DDD6FE' }}>
                {composeUi.aiAssistantLabel}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: uiColor.textSubtle }}>
                {composeUi.helperSubtitle}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePolish('formal')}
                  disabled={aiLoading || !body.trim()}
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                >
                  {composeUi.aiPolishLabel}
                </button>
                {(['proofread', 'simplify', 'shorter', 'longer', 'bullet_points'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => void handlePolish(style)}
                    disabled={aiLoading || !body.trim()}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${uiColor.borderSubtle}` }}
                  >
                    {composeUi.polishModes[style]}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleQuickTranslate}
                  disabled={aiLoading || !body.trim() || !quickTranslateTarget}
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                  title={quickTranslateLabel}
                >
                  <Languages className="h-3 w-3" />
                  {composeUi.quickTranslate}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLangMenu((prev) => !prev)}
                    disabled={aiLoading || !body.trim()}
                    className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                  >
                    <Globe className="h-3 w-3" />
                    {composeUi.aiTranslateLabel}
                  </button>
                  {showLangMenu && (
                    <div className="absolute left-0 top-full z-20 mt-2 min-w-[140px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl">
                      {aiLanguages.map((lang) => (
                        <button
                          type="button"
                          key={lang.value}
                          onClick={() => handleTranslate(lang.value)}
                          className="block w-full px-4 py-2.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700 cursor-pointer"
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {aiLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              </div>
            </div>
          </div>
        </div>

        <div className="px-7 pb-6 [-webkit-app-region:no-drag]">
          <div
            className="overflow-hidden rounded-[20px] border"
            style={{ borderColor: 'rgba(148,163,184,0.12)', backgroundColor: '#0B1527' }}
          >
            <div
              className="px-5 py-3 text-[11px]"
              style={{ color: uiColor.textSubtle, borderBottom: `1px solid ${uiColor.borderSubtle}` }}
            >
              {composeUi.bodyLabel}
            </div>
            <div className="p-5">
              <div
                className="compose-rich-text-editor min-h-72 px-3 py-2 text-sm leading-6 text-zinc-100"
                style={{ borderRadius: uiRadius.lg }}
              >
                <div ref={richTextContainerRef} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setShowQuickPhraseMenu((prev) => !prev);
                      setShowTemplateMenu(false);
                      setPendingTemplate(null);
                    }}
                    disabled={sending || savingDraft || quickPhrases.length === 0}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                    title={quickPhrases.length === 0 ? composeUi.quickPhrasesEmpty : composeUi.quickPhrasesLabel}
                  >
                    {composeUi.quickPhrasesLabel}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {showQuickPhraseMenu && (
                    <div
                      className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
                        {quickPhrases.slice(0, 8).map((phrase) => (
                          <button
                            type="button"
                            key={phrase.id}
                            onClick={() => handleInsertQuickPhrase(phrase.text)}
                            className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-zinc-700 cursor-pointer"
                          >
                            <div className="truncate text-xs font-semibold text-zinc-100">{phrase.title}</div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: uiColor.textSubtle }}>
                              {phrase.text.replace(/\s+/g, ' ').slice(0, 96)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setShowTemplateMenu((prev) => !prev);
                      setShowQuickPhraseMenu(false);
                      setPendingTemplate(null);
                    }}
                    disabled={sending || savingDraft || templates.length === 0}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                    title={templates.length === 0 ? composeUi.templatesEmpty : composeUi.templatesLabel}
                  >
                    {composeUi.templatesLabel}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {showTemplateMenu && (
                    <div
                      className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl"
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      {pendingTemplate ? (
                        <div className="p-2">
                          <div className="px-2 py-1.5 text-xs font-semibold text-zinc-100">{pendingTemplate.name}</div>
                          <div className="grid gap-1">
                            <button
                              type="button"
                              onClick={() => applyTemplate(pendingTemplate, 'replace')}
                              className="rounded-lg px-3 py-2 text-left text-xs text-zinc-100 transition-colors hover:bg-zinc-700 cursor-pointer"
                            >
                              {composeUi.replaceBodyLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTemplate(pendingTemplate, 'insert')}
                              className="rounded-lg px-3 py-2 text-left text-xs text-zinc-100 transition-colors hover:bg-zinc-700 cursor-pointer"
                            >
                              {composeUi.insertAtCursorLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingTemplate(null)}
                              className="rounded-lg px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-700 cursor-pointer"
                            >
                              {composeUi.cancelTemplateLabel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
                          {templates.slice(0, 8).map((template) => (
                            <button
                              type="button"
                              key={template.id}
                              onClick={() => handleSelectTemplate(template)}
                              className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-zinc-700 cursor-pointer"
                            >
                              <div className="truncate text-xs font-semibold text-zinc-100">{template.name}</div>
                              <div className="mt-1 truncate text-[11px]" style={{ color: uiColor.textSubtle }}>
                                {template.subject || composeUi.subjectLabel}
                              </div>
                              <div className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: uiColor.textSubtle }}>
                                {template.bodyText.replace(/\s+/g, ' ').slice(0, 96)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddAttachments()}
                  disabled={sending || savingDraft}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {composeUi.addAttachmentLabel}
                </button>
                {outgoingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex max-w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-200"
                    style={{ backgroundColor: 'rgba(124,58,237,0.16)', border: `1px solid ${uiColor.borderSubtle}` }}
                    title={attachment.filename}
                  >
                    <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="max-w-[220px] truncate">{attachment.filename}</span>
                    <button
                      type="button"
                      onClick={() => removeOutgoingAttachment(attachment.id)}
                      className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                      aria-label={composeUi.removeAttachmentLabel}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {currentQuotedOriginal && (
            <div
              className="mt-4 overflow-hidden rounded-[20px] border"
              style={{ borderColor: 'rgba(148,163,184,0.12)', backgroundColor: '#091321' }}
            >
              <button
                type="button"
                onClick={() => setShowQuotedOriginal((prev) => !prev)}
                className="flex w-full items-center justify-between px-5 py-3 text-left cursor-pointer"
                style={{ borderBottom: showQuotedOriginal ? `1px solid ${uiColor.borderSubtle}` : 'none' }}
              >
                <div className="min-w-0">
                  <div className="text-[11px]" style={{ color: uiColor.textSubtle }}>
                    {composeUi.quotedOriginalLabel}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-zinc-100">{currentQuotedOriginal.title}</div>
                  <div className="mt-1 truncate text-xs" style={{ color: uiColor.textSubtle }}>
                    {currentQuotedOriginal.meta}
                    {currentQuotedOriginal.previewText ? ` · ${currentQuotedOriginal.previewText}` : ''}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-xs" style={{ color: '#C4B5FD' }}>
                  <span>{showQuotedOriginal ? composeUi.hideOriginal : composeUi.showOriginal}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showQuotedOriginal ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {showQuotedOriginal && (
                <div
                  className="compose-quoted-original max-h-[320px] overflow-auto p-4 text-sm"
                  style={{ backgroundColor: '#0D1829' }}
                >
                  <div dangerouslySetInnerHTML={{ __html: sanitizedQuotedOriginalHtml }} />
                  {currentQuotedOriginal.mode === 'forward' && (currentQuotedOriginal.attachments?.length ?? 0) > 0 && (
                    <div
                      className="mt-4 rounded-2xl p-3 text-xs"
                      style={{
                        border: `1px solid ${uiColor.borderSubtle}`,
                        backgroundColor: 'rgba(251,191,36,0.08)',
                        color: uiColor.textSubtle,
                      }}
                    >
                      <div className="font-semibold text-amber-200">{composeUi.originalAttachmentsLabel}</div>
                      {unavailableOriginalAttachmentIds.size > 0 && (
                        <div className="mt-1 text-amber-100/80">{composeUi.attachmentUnavailableLabel}</div>
                      )}
                      <div className="mt-2 space-y-1">
                        {currentQuotedOriginal.attachments?.map((attachment, index) => (
                          <div
                            key={`${attachment.cacheId || attachment.filename || 'attachment'}-${index}`}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1"
                            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                          >
                            <span className="min-w-0 truncate text-zinc-200">{attachment.filename || 'attachment'}</span>
                            <span className="flex-shrink-0 text-zinc-500">{attachment.contentType || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-7 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-500">
            {error}
          </div>
        )}

        {statusMessage && !error && (
          <div className="mx-7 mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-sm text-emerald-300">
            {statusMessage}
          </div>
        )}

        <div
          className="flex items-center justify-between px-7 py-5 [-webkit-app-region:no-drag]"
          style={{ borderTop: `1px solid ${uiColor.borderSubtle}` }}
        >
          <button
            type="button"
            onClick={() => void handleCloseRequest()}
            disabled={sending || scheduling}
            className="cursor-pointer px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
          >
            {composeUi.cancelLabel}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={sending || scheduling || savingDraft}
              className="cursor-pointer rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
            >
              {savingDraft ? composeUi.savingDraftLabel : composeUi.saveDraftLabel}
            </button>
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || scheduling}
                className="cursor-pointer rounded-l-xl px-6 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #6366F1)' }}
                title={composeUi.sendNowLabel}
              >
                {sending ? composeUi.sendingLabel : composeUi.sendLabel}
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowScheduleMenu((prev) => !prev)}
                disabled={sending || scheduling || !onScheduleSend}
                className="cursor-pointer rounded-r-xl border-l border-white/15 px-3 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
                title={composeUi.sendLaterLabel}
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              </button>

              {showScheduleMenu && (
                <div
                  className="absolute bottom-full right-0 z-30 mb-2 w-[320px] overflow-hidden rounded-2xl text-left"
                  style={{
                    backgroundColor: '#202938',
                    border: `1px solid ${uiColor.borderSubtle}`,
                    boxShadow: '0 18px 44px rgba(0,0,0,0.38)',
                  }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: `1px solid ${uiColor.borderSubtle}` }}>
                    <div className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>
                      {composeUi.sendLaterLabel}
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed" style={{ color: uiColor.textSubtle }}>
                      <span className="font-semibold text-zinc-300">{composeUi.scheduleNoticeTitle}</span>
                      {' '}
                      {composeUi.scheduleNoticeBody}
                    </div>
                  </div>

                  <div className="p-2">
                    {([
                      ['10m', composeUi.scheduleIn10MinutesLabel],
                      ['this_evening', composeUi.scheduleThisEveningLabel],
                      ['tomorrow_morning', composeUi.scheduleTomorrowMorningLabel],
                    ] as Array<[ComposeSchedulePreset, string]>).map(([preset, label]) => (
                      <button
                        key={preset}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSchedulePreset(preset)}
                        disabled={scheduling}
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-xs text-zinc-200 transition-colors hover:bg-white/6 disabled:opacity-50 cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}

                    <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      <label className="block text-[11px] font-semibold" style={{ color: uiColor.textSubtle }}>
                        {composeUi.scheduleCustomTimeLabel}
                      </label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={customScheduleValue}
                          onChange={(event) => setCustomScheduleValue(event.target.value)}
                          className="min-w-0 flex-1 rounded-lg bg-zinc-900/70 px-2 py-2 text-xs text-zinc-100 focus:outline-none"
                          placeholder={composeUi.scheduleCustomTimePlaceholder}
                        />
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={handleScheduleCustom}
                          disabled={scheduling || !customScheduleValue}
                          className="rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                          style={{ backgroundColor: '#4F46E5' }}
                        >
                          {composeUi.scheduleConfirmLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
