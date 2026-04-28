export type KeyInfoFieldKey =
  | 'keyInfo'
  | 'processingLevel'
  | 'amount'
  | 'link'
  | 'action'
  | 'details'
  | 'time'
  | 'evidence'
  | 'recipient'
  | 'sender'
  | 'subject'
  | 'field';

export interface KeyInfoItem {
  key?: KeyInfoFieldKey;
  label: string;
  value: string;
}

const KEY_INFO_FIELD_KEYS: KeyInfoFieldKey[] = [
  'keyInfo',
  'processingLevel',
  'amount',
  'link',
  'action',
  'details',
  'time',
  'evidence',
  'recipient',
  'sender',
  'subject',
];

const CONTAINER_LABELS = new Set(['fields', 'items', 'details', 'keyinformation', 'extractedinfo']);

const LABEL_ALIASES: Record<string, KeyInfoFieldKey> = {
  keyinfo: 'keyInfo',
  keyinformation: 'keyInfo',
  information: 'keyInfo',
  info: 'keyInfo',
  '关键信息': 'keyInfo',
  '重要情報': 'keyInfo',
  '핵심정보': 'keyInfo',
  'informaciónclave': 'keyInfo',
  'informationsclés': 'keyInfo',
  'schlüsselinformationen': 'keyInfo',
  'ключеваяинформация': 'keyInfo',

  processinglevel: 'processingLevel',
  category: 'processingLevel',
  type: 'processingLevel',
  risk: 'processingLevel',
  priority: 'processingLevel',
  level: 'processingLevel',
  '处理级别': 'processingLevel',
  '处理等级': 'processingLevel',
  '分类': 'processingLevel',
  '类别': 'processingLevel',
  '类型': 'processingLevel',

  amount: 'amount',
  price: 'amount',
  cost: 'amount',
  fee: 'amount',
  money: 'amount',
  total: 'amount',
  '金额': 'amount',
  '费用': 'amount',
  '价格': 'amount',

  link: 'link',
  links: 'link',
  url: 'link',
  website: 'link',
  '链接': 'link',
  '网址': 'link',
  'リンク': 'link',
  '링크': 'link',
  enlace: 'link',
  lien: 'link',

  action: 'action',
  operation: 'action',
  task: 'action',
  todo: 'action',
  '操作': 'action',
  '行动': 'action',
  '待办': 'action',
  '対応': 'action',
  '조치': 'action',
  'acción': 'action',
  aktion: 'action',
  'действие': 'action',

  detail: 'details',
  details: 'details',
  description: 'details',
  note: 'details',
  '详情': 'details',
  '详细信息': 'details',

  time: 'time',
  timing: 'time',
  date: 'time',
  deadline: 'time',
  due: 'time',
  '时间': 'time',
  '日期': 'time',
  '截止时间': 'time',
  '期限': 'time',
  '시간': 'time',
  plazo: 'time',
  délai: 'time',
  zeitpunkt: 'time',
  срок: 'time',

  evidence: 'evidence',
  reason: 'evidence',
  basis: 'evidence',
  source: 'evidence',
  '依据': 'evidence',
  '原因': 'evidence',
  '根拠': 'evidence',
  '근거': 'evidence',
  evidencia: 'evidence',
  preuve: 'evidence',
  beleg: 'evidence',
  'основание': 'evidence',

  recipient: 'recipient',
  failedrecipient: 'recipient',
  originalrecipient: 'recipient',
  finalrecipient: 'recipient',
  to: 'recipient',
  '收件人': 'recipient',
  '失败收件人': 'recipient',

  sender: 'sender',
  from: 'sender',
  '发件人': 'sender',

  subject: 'subject',
  title: 'subject',
  topic: 'subject',
  '主题': 'subject',
};

const LABEL_PROPERTY_KEYS = new Set([
  'key',
  'field',
  'label',
  'title',
  'name',
  'typeLabel',
  'type',
  'category',
]);

const VALUE_PROPERTY_KEYS = [
  'value',
  'text',
  'content',
  'description',
  'detail',
  'details',
  'amount',
  'link',
  'url',
  'time',
  'date',
  'deadline',
  'evidence',
  'reason',
  'action',
];

export function normalizeKeyInfoLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/|｜]+/g, '');
}

export function keyInfoFieldFromLabel(label: string): KeyInfoFieldKey | undefined {
  return LABEL_ALIASES[normalizeKeyInfoLabel(label)];
}

export function containsChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function valueToText(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    return raw
      .map(valueToText)
      .filter(Boolean)
      .join('；');
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => {
        const text = valueToText(value);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('；');
  }
  return String(raw).trim();
}

function pushItem(items: KeyInfoItem[], label: string, rawValue: unknown) {
  const value = valueToText(rawValue);
  if (!value) return;

  const key = keyInfoFieldFromLabel(label);
  const fallbackLabel = label.trim() || 'field';
  items.push({
    key,
    label: key ?? fallbackLabel,
    value,
  });
}

function collectObjectItem(items: KeyInfoItem[], item: Record<string, unknown>) {
  const labelKey = Array.from(LABEL_PROPERTY_KEYS).find((key) => valueToText(item[key]));
  const label = labelKey ? valueToText(item[labelKey]) : '';

  const valueKey = VALUE_PROPERTY_KEYS.find((key) => key !== labelKey && valueToText(item[key]));
  if (label && valueKey) {
    pushItem(items, label, item[valueKey]);
    return;
  }

  const firstValueEntry = Object.entries(item).find(([key, value]) => !LABEL_PROPERTY_KEYS.has(key) && valueToText(value));
  if (label && firstValueEntry) {
    pushItem(items, label, firstValueEntry[1]);
    return;
  }

  const singleEntry = Object.entries(item).find(([, value]) => valueToText(value));
  if (singleEntry) {
    pushItem(items, singleEntry[0], singleEntry[1]);
  }
}

function collectContainer(items: KeyInfoItem[], raw: unknown) {
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        collectObjectItem(items, entry as Record<string, unknown>);
      } else {
        pushItem(items, 'keyInfo', entry);
      }
    }
    return;
  }

  if (raw && typeof raw === 'object') {
    for (const [label, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        collectContainer(items, value);
      } else {
        pushItem(items, label, value);
      }
    }
  }
}

function parseKeyInfoJson(value: string, maxItems: number): KeyInfoItem[] | null {
  const trimmed = value.trim();
  const jsonCandidate = trimmed.startsWith('{') || trimmed.startsWith('[')
    ? trimmed
    : trimmed.match(/(?:\{|\[)[\s\S]*(?:\}|\])/)?.[0];
  if (!jsonCandidate) return null;

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    const items: KeyInfoItem[] = [];

    if (Array.isArray(parsed)) {
      collectContainer(items, parsed);
      return items.slice(0, maxItems);
    }

    if (!parsed || typeof parsed !== 'object') return null;

    const object = parsed as Record<string, unknown>;
    for (const [label, raw] of Object.entries(object)) {
      const normalizedLabel = normalizeKeyInfoLabel(label);
      if (CONTAINER_LABELS.has(normalizedLabel) && typeof raw !== 'string') {
        collectContainer(items, raw);
        continue;
      }

      if (KEY_INFO_FIELD_KEYS.includes(label as KeyInfoFieldKey) || keyInfoFieldFromLabel(label)) {
        pushItem(items, label, raw);
      }
    }

    return items.length > 0 ? items.slice(0, maxItems) : null;
  } catch {
    return null;
  }
}

export function parseKeyInfoItems(value: string, maxItems = 10): KeyInfoItem[] {
  const jsonItems = parseKeyInfoJson(value, maxItems);
  if (jsonItems) return jsonItems;

  return value
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/\*\*/g, '')
      .trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((line) => {
      const separator = line.match(/[:：]/);
      if (!separator || separator.index === undefined) {
        return { key: 'keyInfo', label: 'keyInfo', value: line };
      }
      const rawLabel = line.slice(0, separator.index).trim() || 'keyInfo';
      const fieldKey = keyInfoFieldFromLabel(rawLabel);
      const itemValue = line.slice(separator.index + separator[0].length).trim();
      return { key: fieldKey, label: fieldKey ?? rawLabel, value: itemValue || line };
    });
}

export function resolveKeyInfoFieldLabel(
  item: KeyInfoItem,
  appLanguage: string,
  translate: (key: string) => string,
): string {
  if (item.key) return translate(`ai.keyInfo.${item.key}`);

  const isChineseUi = appLanguage.toLowerCase().startsWith('zh');
  if (!isChineseUi && containsChineseText(item.label)) {
    return translate('ai.keyInfo.field');
  }

  return item.label || translate('ai.keyInfo.field');
}
