export type AppLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru';

export type AiLanguageCode =
  | 'Chinese'
  | 'English'
  | 'Japanese'
  | 'Korean'
  | 'Spanish'
  | 'French'
  | 'German'
  | 'Russian';

const AI_LANGUAGE_ORDER: AiLanguageCode[] = [
  'Chinese',
  'English',
  'Japanese',
  'Korean',
  'Spanish',
  'French',
  'German',
  'Russian',
];

const AI_LANGUAGE_LABELS: Record<AppLanguage, Record<AiLanguageCode, string>> = {
  zh: {
    Chinese: '中文',
    English: '英语',
    Japanese: '日语',
    Korean: '韩语',
    Spanish: '西班牙语',
    French: '法语',
    German: '德语',
    Russian: '俄语',
  },
  en: {
    Chinese: 'Chinese',
    English: 'English',
    Japanese: 'Japanese',
    Korean: 'Korean',
    Spanish: 'Spanish',
    French: 'French',
    German: 'German',
    Russian: 'Russian',
  },
  ja: {
    Chinese: '中国語',
    English: '英語',
    Japanese: '日本語',
    Korean: '韓国語',
    Spanish: 'スペイン語',
    French: 'フランス語',
    German: 'ドイツ語',
    Russian: 'ロシア語',
  },
  ko: {
    Chinese: '중국어',
    English: '영어',
    Japanese: '일본어',
    Korean: '한국어',
    Spanish: '스페인어',
    French: '프랑스어',
    German: '독일어',
    Russian: '러시아어',
  },
  es: {
    Chinese: 'Chino',
    English: 'Inglés',
    Japanese: 'Japonés',
    Korean: 'Coreano',
    Spanish: 'Español',
    French: 'Francés',
    German: 'Alemán',
    Russian: 'Ruso',
  },
  fr: {
    Chinese: 'Chinois',
    English: 'Anglais',
    Japanese: 'Japonais',
    Korean: 'Coréen',
    Spanish: 'Espagnol',
    French: 'Français',
    German: 'Allemand',
    Russian: 'Russe',
  },
  de: {
    Chinese: 'Chinesisch',
    English: 'Englisch',
    Japanese: 'Japanisch',
    Korean: 'Koreanisch',
    Spanish: 'Spanisch',
    French: 'Französisch',
    German: 'Deutsch',
    Russian: 'Russisch',
  },
  ru: {
    Chinese: 'Китайский',
    English: 'Английский',
    Japanese: 'Японский',
    Korean: 'Корейский',
    Spanish: 'Испанский',
    French: 'Французский',
    German: 'Немецкий',
    Russian: 'Русский',
  },
};

const AI_LANGUAGE_ALIASES: Record<string, AiLanguageCode> = {
  Chinese: 'Chinese',
  中文: 'Chinese',
  中国語: 'Chinese',
  중국어: 'Chinese',
  Chino: 'Chinese',
  Chinois: 'Chinese',
  Chinesisch: 'Chinese',
  Китайский: 'Chinese',
  English: 'English',
  英语: 'English',
  英語: 'English',
  영어: 'English',
  Inglés: 'English',
  Anglais: 'English',
  Englisch: 'English',
  Английский: 'English',
  Japanese: 'Japanese',
  日语: 'Japanese',
  日本語: 'Japanese',
  일본어: 'Japanese',
  Japonés: 'Japanese',
  Japonais: 'Japanese',
  Japanisch: 'Japanese',
  Японский: 'Japanese',
  Korean: 'Korean',
  韩语: 'Korean',
  韓国語: 'Korean',
  한국어: 'Korean',
  Coreano: 'Korean',
  Coréen: 'Korean',
  Koreanisch: 'Korean',
  Корейский: 'Korean',
  Spanish: 'Spanish',
  西班牙语: 'Spanish',
  スペイン語: 'Spanish',
  스페인어: 'Spanish',
  Español: 'Spanish',
  Espagnol: 'Spanish',
  Spanisch: 'Spanish',
  Испанский: 'Spanish',
  French: 'French',
  法语: 'French',
  フランス語: 'French',
  프랑스어: 'French',
  Francés: 'French',
  Français: 'French',
  Französisch: 'French',
  Французский: 'French',
  German: 'German',
  德语: 'German',
  ドイツ語: 'German',
  독일어: 'German',
  Alemán: 'German',
  Allemand: 'German',
  Deutsch: 'German',
  Немецкий: 'German',
  Russian: 'Russian',
  俄语: 'Russian',
  ロシア語: 'Russian',
  러시아어: 'Russian',
  Ruso: 'Russian',
  Russe: 'Russian',
  Russisch: 'Russian',
  Русский: 'Russian',
};

export function normalizeAppLanguage(value?: string): AppLanguage {
  const lower = (value || '').toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('ru')) return 'ru';
  return 'en';
}

export function normalizeAiLanguage(value?: string): AiLanguageCode {
  if (!value) return 'Chinese';
  return AI_LANGUAGE_ALIASES[value] || 'Chinese';
}

export function getAiLanguageLabel(value: string, appLanguage: AppLanguage): string {
  const code = normalizeAiLanguage(value);
  return AI_LANGUAGE_LABELS[appLanguage][code];
}

export function getAiLanguageOptions(appLanguage: AppLanguage) {
  return AI_LANGUAGE_ORDER.map((value) => ({
    value,
    label: AI_LANGUAGE_LABELS[appLanguage][value],
  }));
}

export function detectAiLanguageFromText(value?: string): AiLanguageCode | null {
  const text = (value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b\S+@\S+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 4) {
    return null;
  }

  if (/[\uac00-\ud7af]/.test(text)) {
    return 'Korean';
  }

  if (/[\u3040-\u30ff]/.test(text)) {
    return 'Japanese';
  }

  if (/[\u0400-\u04ff]/.test(text)) {
    return 'Russian';
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'Chinese';
  }

  const lower = text.toLowerCase();
  const scoreByLanguage: Record<Exclude<AiLanguageCode, 'Chinese' | 'Japanese' | 'Korean' | 'Russian'>, number> = {
    English: 0,
    Spanish: 0,
    French: 0,
    German: 0,
  };

  const keywordGroups: Record<keyof typeof scoreByLanguage, string[]> = {
    English: [' the ', ' and ', ' please ', ' hello ', ' thanks ', ' regards ', ' account ', ' review '],
    Spanish: [' el ', ' la ', ' de ', ' por favor ', ' gracias ', ' cuenta ', ' respuesta ', ' hola '],
    French: [' le ', ' la ', ' de ', ' merci ', ' bonjour ', ' compte ', ' réponse ', ' cordialement '],
    German: [' der ', ' die ', ' und ', ' bitte ', ' danke ', ' konto ', ' antwort ', ' hallo '],
  };

  for (const [language, keywords] of Object.entries(keywordGroups) as Array<[keyof typeof scoreByLanguage, string[]]>) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scoreByLanguage[language] += 1;
      }
    }
  }

  const ranked = Object.entries(scoreByLanguage).sort((a, b) => b[1] - a[1]);
  const [bestLanguage, bestScore] = ranked[0] || [];

  if (bestLanguage && typeof bestScore === 'number' && bestScore > 0) {
    return bestLanguage as AiLanguageCode;
  }

  if (/[a-z]/i.test(text)) {
    return 'English';
  }

  return null;
}
