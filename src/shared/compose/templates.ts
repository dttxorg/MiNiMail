import { getDefaultComposeCursorPosition } from './signatures';
import { insertTextAtSelection } from './quickPhrases';

export const COMPOSE_TEMPLATES_SETTING_KEY = 'compose_templates_v1';

export type ComposeTemplateSettings = {
  version: 1;
  templates: ComposeTemplate[];
};

export type ComposeTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  tags: string[];
  updatedAt: string;
};

export type ComposeTemplateInput = {
  id?: string;
  name?: string;
  subject?: string;
  bodyText?: string;
  tags?: string[] | string;
  updatedAt?: string;
};

export type ApplyComposeTemplateInput = {
  currentSubject: string;
  currentBody: string;
  template: ComposeTemplate;
  mode: 'replace' | 'insert';
  selectionStart?: number;
  selectionEnd?: number;
};

export type ApplyComposeTemplateResult = {
  subject: string;
  body: string;
  cursor: number;
};

export function createEmptyComposeTemplateSettings(): ComposeTemplateSettings {
  return {
    version: 1,
    templates: [],
  };
}

export function normalizeTemplateText(value: string): string {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizeTemplateLine(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTemplateTags(tags: string[] | string | undefined): string[] {
  const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of rawTags) {
    const value = normalizeTemplateLine(tag);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function normalizeTemplateId(id: string | undefined): string {
  return String(id || '').trim();
}

function createTemplateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateTemplateName(subject: string, bodyText: string): string {
  const source = normalizeTemplateLine(subject) || normalizeTemplateLine(bodyText) || 'Template';
  return source.length > 40 ? `${source.slice(0, 40).trimEnd()}...` : source;
}

export function parseComposeTemplateSettings(raw: string | null | undefined): ComposeTemplateSettings {
  if (!raw) return createEmptyComposeTemplateSettings();

  try {
    const parsed = JSON.parse(raw) as Partial<ComposeTemplateSettings> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.templates)) {
      return createEmptyComposeTemplateSettings();
    }

    const seenIds = new Set<string>();
    const templates: ComposeTemplate[] = [];
    for (const template of parsed.templates) {
      if (!template || typeof template !== 'object') continue;
      const id = normalizeTemplateId((template as Partial<ComposeTemplate>).id);
      if (!id || seenIds.has(id)) continue;

      const subject = normalizeTemplateLine((template as Partial<ComposeTemplate>).subject || '');
      const bodyText = normalizeTemplateText((template as Partial<ComposeTemplate>).bodyText || '');
      if (!subject && !bodyText) continue;

      seenIds.add(id);
      templates.push({
        id,
        name: normalizeTemplateLine((template as Partial<ComposeTemplate>).name || '')
          || generateTemplateName(subject, bodyText),
        subject,
        bodyText,
        tags: normalizeTemplateTags((template as Partial<ComposeTemplate>).tags),
        updatedAt: String((template as Partial<ComposeTemplate>).updatedAt || ''),
      });
    }

    return { version: 1, templates };
  } catch {
    return createEmptyComposeTemplateSettings();
  }
}

export function serializeComposeTemplateSettings(settings: ComposeTemplateSettings): string {
  return JSON.stringify({
    version: 1,
    templates: (settings.templates || []).map((template) => {
      const subject = normalizeTemplateLine(template.subject);
      const bodyText = normalizeTemplateText(template.bodyText);
      return {
        id: template.id,
        name: normalizeTemplateLine(template.name) || generateTemplateName(subject, bodyText),
        subject,
        bodyText,
        tags: normalizeTemplateTags(template.tags),
        updatedAt: template.updatedAt,
      };
    }).filter((template) => template.id && (template.subject || template.bodyText)),
  } satisfies ComposeTemplateSettings);
}

export function upsertComposeTemplate(
  settings: ComposeTemplateSettings | null | undefined,
  input: ComposeTemplateInput,
  updatedAt = new Date().toISOString(),
): ComposeTemplateSettings {
  const subject = normalizeTemplateLine(input.subject || '');
  const bodyText = normalizeTemplateText(input.bodyText || '');
  if (!subject && !bodyText) {
    throw new Error('Template subject or body is required.');
  }

  const templates = [...(settings || createEmptyComposeTemplateSettings()).templates];
  const inputId = normalizeTemplateId(input.id);
  const existingIndex = inputId ? templates.findIndex((template) => template.id === inputId) : -1;
  const existing = existingIndex >= 0 ? templates[existingIndex] : null;
  const nextTemplate: ComposeTemplate = {
    id: existing?.id || inputId || createTemplateId(),
    name: normalizeTemplateLine(input.name || '') || generateTemplateName(subject, bodyText),
    subject,
    bodyText,
    tags: normalizeTemplateTags(input.tags),
    updatedAt: input.updatedAt || updatedAt,
  };

  if (existingIndex >= 0) {
    templates[existingIndex] = nextTemplate;
  } else {
    templates.push(nextTemplate);
  }

  return { version: 1, templates };
}

export function deleteComposeTemplate(
  settings: ComposeTemplateSettings | null | undefined,
  id: string,
): ComposeTemplateSettings {
  const targetId = normalizeTemplateId(id);
  return {
    version: 1,
    templates: (settings || createEmptyComposeTemplateSettings()).templates
      .filter((template) => template.id !== targetId),
  };
}

export function applyComposeTemplateToDraft(input: ApplyComposeTemplateInput): ApplyComposeTemplateResult {
  const templateSubject = normalizeTemplateLine(input.template.subject);
  const templateBody = normalizeTemplateText(input.template.bodyText);
  const currentSubject = String(input.currentSubject || '');
  const currentBody = String(input.currentBody || '').replace(/\r\n/g, '\n');
  const nextSubject = !currentSubject.trim() || input.mode === 'replace'
    ? templateSubject
    : currentSubject;

  if (!templateBody) {
    return {
      subject: nextSubject,
      body: currentBody,
      cursor: getDefaultComposeCursorPosition(currentBody),
    };
  }

  if (input.mode === 'replace') {
    const signatureStart = getDefaultComposeCursorPosition(currentBody);
    const result = insertTextAtSelection(currentBody, templateBody, 0, signatureStart);
    return {
      subject: nextSubject,
      body: result.body,
      cursor: result.cursor,
    };
  }

  const fallbackCursor = getDefaultComposeCursorPosition(currentBody);
  const selectionStart = input.selectionStart ?? fallbackCursor;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const result = insertTextAtSelection(currentBody, templateBody, selectionStart, selectionEnd);
  return {
    subject: nextSubject,
    body: result.body,
    cursor: result.cursor,
  };
}
