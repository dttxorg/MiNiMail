import type { AppLanguage } from '../../shared/mailFolders';
import { MAIL_CACHE_RANGE_VALUES, MAIL_HISTORY_RANGE_VALUES, type MailCacheRange, type MailHistoryRange } from '../../shared/mailSyncSettings';

export interface Option<T> {
  value: T;
  label: string;
}

const HISTORY_RANGE_LABELS: Record<AppLanguage | 'default', Record<MailHistoryRange, string>> = {
  default: {
    '7d': '7 days',
    '15d': '15 days',
    '1mo': '1 month',
    '6mo': '6 months',
    '1y': '1 year',
    all: 'All',
  },
  zh: {
    '7d': '7 天',
    '15d': '15 天',
    '1mo': '1 个月',
    '6mo': '6 个月',
    '1y': '1 年',
    all: '全部',
  },
  ja: {
    '7d': '7日',
    '15d': '15日',
    '1mo': '1か月',
    '6mo': '6か月',
    '1y': '1年',
    all: 'すべて',
  },
  ko: {
    '7d': '7일',
    '15d': '15일',
    '1mo': '1개월',
    '6mo': '6개월',
    '1y': '1년',
    all: '전체',
  },
  es: {
    '7d': '7 días',
    '15d': '15 días',
    '1mo': '1 mes',
    '6mo': '6 meses',
    '1y': '1 año',
    all: 'Todo',
  },
  fr: {
    '7d': '7 jours',
    '15d': '15 jours',
    '1mo': '1 mois',
    '6mo': '6 mois',
    '1y': '1 an',
    all: 'Tout',
  },
  de: {
    '7d': '7 Tage',
    '15d': '15 Tage',
    '1mo': '1 Monat',
    '6mo': '6 Monate',
    '1y': '1 Jahr',
    all: 'Alle',
  },
  ru: {
    '7d': '7 дней',
    '15d': '15 дней',
    '1mo': '1 месяц',
    '6mo': '6 месяцев',
    '1y': '1 год',
    all: 'Все',
  },
  en: {
    '7d': '7 days',
    '15d': '15 days',
    '1mo': '1 month',
    '6mo': '6 months',
    '1y': '1 year',
    all: 'All',
  },
};

const CACHE_RANGE_LABELS: Record<AppLanguage | 'default', Record<MailCacheRange, string>> = {
  default: {
    '3d': '3 days',
    '7d': '7 days',
    '1mo': '1 month',
    '6mo': '6 months',
    all: 'All',
  },
  zh: {
    '3d': '3 天',
    '7d': '7 天',
    '1mo': '1 个月',
    '6mo': '半年',
    all: '全部',
  },
  ja: {
    '3d': '3日',
    '7d': '7日',
    '1mo': '1か月',
    '6mo': '半年',
    all: 'すべて',
  },
  ko: {
    '3d': '3일',
    '7d': '7일',
    '1mo': '1개월',
    '6mo': '반년',
    all: '전체',
  },
  es: {
    '3d': '3 días',
    '7d': '7 días',
    '1mo': '1 mes',
    '6mo': '6 meses',
    all: 'Todo',
  },
  fr: {
    '3d': '3 jours',
    '7d': '7 jours',
    '1mo': '1 mois',
    '6mo': '6 mois',
    all: 'Tout',
  },
  de: {
    '3d': '3 Tage',
    '7d': '7 Tage',
    '1mo': '1 Monat',
    '6mo': '6 Monate',
    all: 'Alle',
  },
  ru: {
    '3d': '3 дня',
    '7d': '7 дней',
    '1mo': '1 месяц',
    '6mo': '6 месяцев',
    all: 'Все',
  },
  en: {
    '3d': '3 days',
    '7d': '7 days',
    '1mo': '1 month',
    '6mo': '6 months',
    all: 'All',
  },
};

const AUTO_FETCH_LABELS: Record<AppLanguage | 'default', Record<number, string>> = {
  default: {
    0: 'Off',
    1: 'Every minute',
    5: 'Every 5 min',
    10: 'Every 10 min',
    15: 'Every 15 min',
    30: 'Every 30 min',
    60: 'Every 60 min',
  },
  zh: {
    0: '关闭',
    1: '每分钟',
    5: '每 5 分钟',
    10: '每 10 分钟',
    15: '每 15 分钟',
    30: '每 30 分钟',
    60: '每 60 分钟',
  },
  ja: {
    0: 'オフ',
    1: '1分ごと',
    5: '5分ごと',
    10: '10分ごと',
    15: '15分ごと',
    30: '30分ごと',
    60: '60分ごと',
  },
  ko: {
    0: '끔',
    1: '1분마다',
    5: '5분마다',
    10: '10분마다',
    15: '15분마다',
    30: '30분마다',
    60: '60분마다',
  },
  es: {
    0: 'Desactivado',
    1: 'Cada minuto',
    5: 'Cada 5 min',
    10: 'Cada 10 min',
    15: 'Cada 15 min',
    30: 'Cada 30 min',
    60: 'Cada 60 min',
  },
  fr: {
    0: 'Désactivé',
    1: 'Chaque minute',
    5: 'Toutes les 5 min',
    10: 'Toutes les 10 min',
    15: 'Toutes les 15 min',
    30: 'Toutes les 30 min',
    60: 'Toutes les 60 min',
  },
  de: {
    0: 'Aus',
    1: 'Jede Minute',
    5: 'Alle 5 Min.',
    10: 'Alle 10 Min.',
    15: 'Alle 15 Min.',
    30: 'Alle 30 Min.',
    60: 'Alle 60 Min.',
  },
  ru: {
    0: 'Выкл.',
    1: 'Каждую минуту',
    5: 'Каждые 5 мин.',
    10: 'Каждые 10 мин.',
    15: 'Каждые 15 мин.',
    30: 'Каждые 30 мин.',
    60: 'Каждые 60 мин.',
  },
  en: {
    0: 'Never',
    1: 'Every minute',
    5: 'Every 5 min',
    10: 'Every 10 min',
    15: 'Every 15 min',
    30: 'Every 30 min',
    60: 'Every 60 min',
  },
};

function getHistoryLabels(language: AppLanguage): Record<MailHistoryRange, string> {
  return HISTORY_RANGE_LABELS[language] ?? HISTORY_RANGE_LABELS.default;
}

function getCacheLabels(language: AppLanguage): Record<MailCacheRange, string> {
  return CACHE_RANGE_LABELS[language] ?? CACHE_RANGE_LABELS.default;
}

function getAutoFetchLabels(language: AppLanguage): Record<number, string> {
  return AUTO_FETCH_LABELS[language] ?? AUTO_FETCH_LABELS.default;
}

export function getMailHistoryRangeLabel(language: AppLanguage, value: MailHistoryRange): string {
  return getHistoryLabels(language)[value];
}

export function formatStagedHistoryLabel(range: MailHistoryRange, language: AppLanguage): string {
  const rangeLabel = getMailHistoryRangeLabel(language, range);

  if (language === 'ja') {
    if (range === '7d') return `直近${rangeLabel}のメールを同期中`;
    if (range === 'all') return 'すべてのメール履歴を同期中';
    return `${rangeLabel}まで同期範囲を拡張中`;
  }

  if (language === 'en') {
    if (range === '7d') return 'Syncing the last 7 days';
    if (range === 'all') return 'Syncing all mail history';
    return `Expanding sync to ${rangeLabel.toLowerCase()}`;
  }

  if (language === 'ko') {
    if (range === '7d') return `최근 ${rangeLabel} 메일을 동기화하는 중`;
    if (range === 'all') return '전체 메일 기록을 동기화하는 중';
    return `${rangeLabel}까지 동기화 범위를 확장하는 중`;
  }

  if (language === 'es') {
    if (range === '7d') return `Sincronizando los últimos ${rangeLabel}`;
    if (range === 'all') return 'Sincronizando todo el historial de correo';
    return `Ampliando la sincronización a ${rangeLabel.toLowerCase()}`;
  }

  if (language === 'fr') {
    if (range === '7d') return `Synchronisation des ${rangeLabel} derniers`;
    if (range === 'all') return 'Synchronisation de tout l’historique des mails';
    return `Extension de la synchronisation à ${rangeLabel.toLowerCase()}`;
  }

  if (language === 'de') {
    if (range === '7d') return `Synchronisiere die letzten ${rangeLabel}`;
    if (range === 'all') return 'Synchronisiere den gesamten Mailverlauf';
    return `Erweitere die Synchronisation auf ${rangeLabel.toLowerCase()}`;
  }

  if (language === 'ru') {
    if (range === '7d') return `Синхронизация почты за ${rangeLabel}`;
    if (range === 'all') return 'Синхронизация всей истории почты';
    return `Расширение синхронизации до ${rangeLabel.toLowerCase()}`;
  }

  if (range === '7d') return `正在同步最近 ${rangeLabel} 邮件`;
  if (range === 'all') return '正在同步全部历史邮件';
  return `正在扩展到 ${rangeLabel}`;
}

export function getMailHistoryRangeOptions(language: AppLanguage): Option<MailHistoryRange>[] {
  const labels = getHistoryLabels(language);
  return MAIL_HISTORY_RANGE_VALUES.map((value) => ({
    value,
    label: labels[value],
  }));
}

export function getMailCacheRangeOptions(language: AppLanguage): Option<MailCacheRange>[] {
  const labels = getCacheLabels(language);
  return MAIL_CACHE_RANGE_VALUES.map((value) => ({
    value,
    label: labels[value],
  }));
}

export function getAutoFetchIntervalOptions(language: AppLanguage): Option<number>[] {
  const labels = getAutoFetchLabels(language);
  return [0, 1, 5, 10, 15, 30, 60].map((value) => ({
    value,
    label: labels[value],
  }));
}
