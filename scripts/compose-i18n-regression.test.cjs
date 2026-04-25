const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const composePath = path.join(root, 'src', 'renderer', 'components', 'ComposeDialog.tsx');
const i18nPath = path.join(root, 'src', 'renderer', 'i18n.ts');

const compose = fs.readFileSync(composePath, 'utf8');
const i18n = fs.readFileSync(i18nPath, 'utf8');

const languages = ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'ru'];
const requiredKeys = [
  'composeDialog.composeTitle',
  'composeDialog.draftLabel',
  'composeDialog.fromLabel',
  'composeDialog.toLabel',
  'composeDialog.subjectLabel',
  'composeDialog.subjectPlaceholder',
  'composeDialog.bodyLabel',
  'composeDialog.bodyPlaceholder',
  'composeDialog.aiAssistantLabel',
  'composeDialog.aiPolishLabel',
  'composeDialog.aiTranslateLabel',
  'composeDialog.cancelLabel',
  'composeDialog.sendLabel',
  'composeDialog.sendingLabel',
  'composeDialog.saveDraftLabel',
  'composeDialog.savingDraftLabel',
  'composeDialog.draftSavedLabel',
  'composeDialog.chooseDraftLabel',
  'composeDialog.noDraftsLabel',
  'composeDialog.deleteDraftLabel',
  'composeDialog.recipientRequired',
  'composeDialog.subjectRequired',
  'composeDialog.accountRequired',
  'composeDialog.multipleRecipients',
  'composeDialog.helperSubtitle',
  'composeDialog.recipientsHint',
  'composeDialog.quotedOriginalLabel',
  'composeDialog.showOriginal',
  'composeDialog.hideOriginal',
  'composeDialog.quickTranslate',
  'composeDialog.quickTranslateUnavailable',
  'composeDialog.quickTranslateTo',
  'composeDialog.quickTranslateBack',
  'composeDialog.polishFailed',
  'composeDialog.translateFailed',
];

assert(
  !compose.includes('const composeUiByLanguage'),
  'ComposeDialog should not keep an inline multilingual label table',
);
assert(
  compose.includes('buildComposeUiLabels('),
  'ComposeDialog should build labels from the shared i18n translator',
);

for (const key of requiredKeys) {
  assert(
    compose.includes(`'${key}'`) || compose.includes(`"${key}"`),
    `ComposeDialog should read ${key} through i18n`,
  );
}

for (const lang of languages) {
  const langBlock = i18n.match(new RegExp(`${lang}:\\s*\\{\\s*translation:\\s*\\{([\\s\\S]*?)(?=\\n\\s*\\},\\n\\s*(?:${languages.filter((item) => item !== lang).join('|')})\\s*:)`))
    || i18n.match(new RegExp(`${lang}:\\s*\\{\\s*translation:\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\s*,?\\s*\\}\\s*,?\\s*\\n\\};`));
  assert(langBlock, `Expected i18n resource block for ${lang}`);
  for (const key of requiredKeys) {
    const shortKey = key.replace('composeDialog.', '');
    assert(
      langBlock[1].includes(`${shortKey}:`),
      `Expected ${lang} to define composeDialog.${shortKey}`,
    );
  }
}

const mojibakePatterns = [/鍐|鏀|缈|鈥|氅|鞚|谩|贸|脌/];
for (const pattern of mojibakePatterns) {
  assert(!compose.match(pattern), `ComposeDialog should not contain mojibake pattern ${pattern}`);
}

async function testRuntimeLanguageSwitching() {
  const module = await import(pathToFileURL(i18nPath).href);
  const i18nInstance = module.default;
  const expectedTitles = {
    zh: '写邮件',
    en: 'Compose',
    ja: 'メール作成',
    ko: '메일 작성',
    es: 'Redactar',
    fr: 'Nouveau mail',
    de: 'Neue Nachricht',
    ru: 'Новое письмо',
  };

  for (const [lang, title] of Object.entries(expectedTitles)) {
    await i18nInstance.changeLanguage(lang);
    assert.strictEqual(i18nInstance.t('composeDialog.composeTitle'), title, `Expected ${lang} compose title to resolve through i18n`);
    assert(!i18nInstance.t('composeDialog.sendLabel').includes('composeDialog.'), `Expected ${lang} send label to be translated`);
  }
}

testRuntimeLanguageSwitching()
  .then(() => {
    console.log('compose i18n regression tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
