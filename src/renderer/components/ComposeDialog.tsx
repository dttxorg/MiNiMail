import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ChevronDown, Globe, Languages, Loader2, Paperclip, X } from 'lucide-react';
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
  buildComposeHtmlBody,
  buildComposeRecipientOption,
  buildComposeTextBody,
  filterRecipientSuggestions,
  normalizeComposeRecipientInput,
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
  sendingLabel: string;
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
};

type ComposeTranslator = (key: string, options?: Record<string, unknown>) => string;

function labelWithFallback(
  t: ComposeTranslator,
  key: string,
  _appLanguage: AppLanguage,
  _fallbacks: Record<AppLanguage, string>,
): string {
  return t(key);
}

function buildComposeUiLabels(t: ComposeTranslator): ComposeUiLabels {
  const appLanguage = 'en' as AppLanguage;
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
    sendingLabel: t('composeDialog.sendingLabel'),
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
  initialRecipients?: ComposeRecipientOption[];
  initialSubject?: string;
  initialEditableBody?: string;
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
  onDeleteDraft,
  initialRecipients,
  initialSubject,
  initialEditableBody,
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
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showDraftMenu, setShowDraftMenu] = useState(false);
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
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodySelectionRef = useRef<{ start: number; end: number; userSet: boolean }>({ start: 0, end: 0, userSet: false });
  const lastInitialHydrateKeyRef = useRef<string | null>(null);
  const signatureApplyKeyRef = useRef<string | null>(null);

  const composeUi = useMemo(() => buildComposeUiLabels(t), [t, appLanguage]);
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

  const resetComposeToBlankDraft = () => {
    setDraftKey(createLocalDraftKey());
    setSubject('');
    setBody('');
    setRecipients([]);
    setRecipientInput('');
    setCurrentQuotedOriginal(null);
    setActiveDraftSource(null);
    setOutgoingAttachments([]);
    signatureApplyKeyRef.current = null;
    bodySelectionRef.current = { start: 0, end: 0, userSet: false };
    setShowQuotedOriginal(false);
    setShowDraftMenu(false);
    setShowQuickPhraseMenu(false);
    setShowTemplateMenu(false);
    setPendingTemplate(null);
    setError(null);
    setStatusMessage(null);
    setQuickTranslateToggled(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (lastInitialHydrateKeyRef.current === initialHydrateKey) return;
    lastInitialHydrateKeyRef.current = initialHydrateKey || null;

    setFrom(selectedAccount?.email || accounts[0]?.email || '');
    setRecipients(initialRecipients || []);
    setRecipientInput('');
    setSubject(initialSubject || '');
    setBody(initialEditableBody || '');
    signatureApplyKeyRef.current = null;
    bodySelectionRef.current = {
      start: getDefaultComposeCursorPosition(initialEditableBody || ''),
      end: getDefaultComposeCursorPosition(initialEditableBody || ''),
      userSet: false,
    };
    setError(null);
    setStatusMessage(null);
    setShowLangMenu(false);
    setShowDraftMenu(false);
    setShowQuickPhraseMenu(false);
    setShowTemplateMenu(false);
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
  }, [accounts, initialEditableBody, initialHydrateKey, initialOutgoingAttachments, initialQuotedOriginal, initialRecipients, initialSubject, isOpen, selectedAccount]);

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

    setBody((currentBody) => {
      const nextBody = applySignatureToBody(currentBody, signature, {
        knownSignatures: knownSignatureTexts,
      });
      if (!bodySelectionRef.current.userSet) {
        const cursor = getDefaultComposeCursorPosition(nextBody);
        bodySelectionRef.current = { start: cursor, end: cursor, userSet: false };
        requestAnimationFrame(() => {
          bodyTextareaRef.current?.focus();
          bodyTextareaRef.current?.setSelectionRange(cursor, cursor);
        });
      }
      return nextBody;
    });
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

  const rememberBodySelection = (userSet = true) => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    bodySelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      userSet,
    };
  };

  const handleInsertQuickPhrase = (phraseText: string) => {
    setBody((currentBody) => {
      const textarea = bodyTextareaRef.current;
      const storedSelection = bodySelectionRef.current;
      const fallbackCursor = getDefaultComposeCursorPosition(currentBody);
      const selection = textarea && storedSelection.userSet
        ? { start: textarea.selectionStart, end: textarea.selectionEnd }
        : storedSelection.userSet
          ? storedSelection
          : { start: fallbackCursor, end: fallbackCursor };
      const result = insertTextAtSelection(currentBody, phraseText, selection.start, selection.end);
      bodySelectionRef.current = { start: result.cursor, end: result.cursor, userSet: true };
      requestAnimationFrame(() => {
        bodyTextareaRef.current?.focus();
        bodyTextareaRef.current?.setSelectionRange(result.cursor, result.cursor);
      });
      return result.body;
    });
    setShowQuickPhraseMenu(false);
  };

  const applyTemplate = (template: ComposeTemplate, mode: 'replace' | 'insert') => {
    setBody((currentBody) => {
      const textarea = bodyTextareaRef.current;
      const storedSelection = bodySelectionRef.current;
      const fallbackCursor = getDefaultComposeCursorPosition(currentBody);
      const selection = mode === 'insert'
        ? textarea && storedSelection.userSet
          ? { start: textarea.selectionStart, end: textarea.selectionEnd }
          : storedSelection.userSet
            ? storedSelection
            : { start: fallbackCursor, end: fallbackCursor }
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
      bodySelectionRef.current = { start: result.cursor, end: result.cursor, userSet: true };
      requestAnimationFrame(() => {
        bodyTextareaRef.current?.focus();
        bodyTextareaRef.current?.setSelectionRange(result.cursor, result.cursor);
      });
      return result.body;
    });
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
    setBody(draft.body);
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

  const handlePolish = async () => {
    if (!body.trim()) return;

    setAiLoading(true);
    setError(null);

    try {
      const res = await window.electronAPI.invoke(
        'ai:polish',
        body,
        'formal',
        normalizeAiLanguage(aiTargetLanguage),
      ) as {
        success: boolean;
        content?: string;
        error?: string;
      };

      if (res.success && res.content) {
        setBody(res.content);
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
        setBody(res.content);
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
        setBody(res.content);
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
    if (sending) return;
    onClose();
  };

  const handleSaveDraft = async () => {
    if (sending || savingDraft) return;

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
        draftKey,
        quotedOriginal: currentQuotedOriginal,
        outgoingAttachments,
      });
      setStatusMessage(composeUi.draftSavedLabel);
    } finally {
      setSavingDraft(false);
    }
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
    if (sending) return;

    const resolvedRecipients = resolveRecipientsForSend();
    setRecipients(resolvedRecipients);
    setRecipientInput('');

    if (resolvedRecipients.length === 0) {
      setError(composeUi.recipientRequired);
      return;
    }

    if (!subject.trim()) {
      setError(composeUi.subjectRequired);
      return;
    }

    const account = accounts.find((item) => item.email === from);
    if (!account) {
      setError(composeUi.accountRequired);
      return;
    }

    setSending(true);
    setError(null);

    try {
      const editableBodyForSend = stripSignatureMarkerBeforeSend(body);
      const result = await onSend({
        accountId: account.id,
        to: resolvedRecipients.map((item) => item.email),
        subject: subject.trim(),
        bodyText: buildComposeTextBody(editableBodyForSend, currentQuotedOriginal),
        bodyHtml: currentQuotedOriginal ? buildComposeHtmlBody(editableBodyForSend, currentQuotedOriginal) : undefined,
        editableBody: editableBodyForSend,
        draftKey,
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
            disabled={sending}
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
                  onClick={handlePolish}
                  disabled={aiLoading || !body.trim()}
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
                >
                  {composeUi.aiPolishLabel}
                </button>

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
              <textarea
                ref={bodyTextareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onSelect={() => rememberBodySelection(true)}
                onKeyUp={() => rememberBodySelection(true)}
                onMouseUp={() => rememberBodySelection(true)}
                onFocus={() => rememberBodySelection(false)}
                className="h-72 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                placeholder={composeUi.bodyPlaceholder}
                style={{ borderRadius: uiRadius.lg }}
              />
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
            disabled={sending}
            className="cursor-pointer px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
          >
            {composeUi.cancelLabel}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={sending || savingDraft}
              className="cursor-pointer rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${uiColor.borderSubtle}` }}
            >
              {savingDraft ? composeUi.savingDraftLabel : composeUi.saveDraftLabel}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="cursor-pointer rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #6366F1)' }}
            >
              {sending ? composeUi.sendingLabel : composeUi.sendLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
