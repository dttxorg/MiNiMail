import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const languageKeys = ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'ru'] as const;

function countKey(source: string, key: string): number {
  return (source.match(new RegExp(`${key}:`, 'g')) || []).length;
}

function testSidebarHasEightLanguageLabels() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');

  for (const key of languageKeys) {
    assert(sidebar.includes(`${key}:`), `Expected Sidebar labels to include ${key}`);
  }

  assert(sidebar.includes("ja: '仕事 / 業務'"), 'Expected Japanese AI category label');
  assert(sidebar.includes("ko: '업무 / 비즈니스'"), 'Expected Korean AI category label');
  assert(sidebar.includes("es: 'Trabajo / Negocio'"), 'Expected Spanish AI category label');
  assert(sidebar.includes("fr: 'Travail / Affaires'"), 'Expected French AI category label');
  assert(sidebar.includes("de: 'Arbeit / Geschäft'"), 'Expected German AI category label');
  assert(sidebar.includes("ru: 'Работа / Бизнес'"), 'Expected Russian AI category label');
  assert(sidebar.includes("'GitHub/Security': { zh: '安全', en: 'Security', ja: 'セキュリティ', ko: '보안', es: 'Seguridad', fr: 'Sécurité', de: 'Sicherheit', ru: 'Безопасность' }"), 'Expected GitHub smart folders to include all 8 language labels');
  assert(sidebar.includes("'Priority/Needs Reply': { zh: '需回复', en: 'Needs Reply', ja: '返信が必要', ko: '답장 필요', es: 'Requiere respuesta', fr: 'Réponse requise', de: 'Antwort erforderlich', ru: 'Нужен ответ' }"), 'Expected priority folders to include all 8 language labels');
  assert(!sidebar.includes("labels[appLanguage as keyof typeof category.labels] || category.labels.en"), 'Expected category label lookup not to fall back to English for localized languages');
}

function testMailDetailAssistantHasEightLanguageLabels() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  for (const key of languageKeys) {
    assert(detail.includes(`${key}: {`), `Expected MailDetail assistant labels to include ${key}`);
  }

  assert(detail.includes("title: 'AI アシスタント'"), 'Expected Japanese AI assistant title');
  assert(detail.includes("title: 'AI 도우미'"), 'Expected Korean AI assistant title');
  assert(detail.includes("title: 'Asistente de IA'"), 'Expected Spanish AI assistant title');
  assert(detail.includes("title: 'Assistant IA'"), 'Expected French AI assistant title');
  assert(detail.includes("title: 'KI-Assistent'"), 'Expected German AI assistant title');
  assert(detail.includes("title: 'ИИ-ассистент'"), 'Expected Russian AI assistant title');
  assert(detail.includes('assistantLabelsByLanguage[normalizedLanguage]'), 'Expected MailDetail to select labels from normalized app language');
}

function testDefaultWindowWidthIsTwentyPercentLonger() {
  const main = read('src/main/index.ts');
  assert(main.includes('width: 1536'), 'Expected default window width to be 20% longer than 1280');
  assert(!main.includes('width: 1280'), 'Expected old default window width to be removed');
}

function testLocalizationTablesAreNotPartial() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  const detail = read('src/renderer/components/MailDetail.tsx');
  const aiLanguages = read('src/renderer/utils/aiLanguages.ts');

  for (const key of languageKeys) {
    assert(countKey(sidebar, key) >= 4, `Expected Sidebar to have multiple ${key} localization entries`);
    assert(countKey(detail, key) >= 2, `Expected MailDetail to have multiple ${key} localization entries`);
  }

  assert(aiLanguages.includes("zh: {"), 'Expected AI language labels to include Chinese UI table');
  assert(aiLanguages.includes("ja: {"), 'Expected AI language labels to include Japanese UI table');
  assert(aiLanguages.includes("ko: {"), 'Expected AI language labels to include Korean UI table');
  assert(aiLanguages.includes("ru: {"), 'Expected AI language labels to include Russian UI table');
  assert(aiLanguages.includes("Japanese: '日本語'"), 'Expected AI language labels to show Japanese correctly');
  assert(aiLanguages.includes("Russian: 'Русский'"), 'Expected AI language labels to show Russian correctly');
}

function run() {
  testSidebarHasEightLanguageLabels();
  testMailDetailAssistantHasEightLanguageLabels();
  testDefaultWindowWidthIsTwentyPercentLonger();
  testLocalizationTablesAreNotPartial();
  console.log('japanese-ui-language-regression tests passed');
}

run();
