const fs = require('node:fs');
const path = require('node:path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const mailDetail = fs.readFileSync(path.join(root, 'src/renderer/components/MailDetail.tsx'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src/renderer/i18n.ts'), 'utf8');

function testKeyInfoLabelsUseI18n() {
  const hasDynamicKeyInfoLookup = mailDetail.includes('resolveKeyInfoFieldLabel(item, normalizedLanguage, t)');
  for (const key of ['keyInfo', 'processingLevel', 'amount', 'link', 'action', 'details', 'time', 'evidence', 'recipient', 'sender', 'subject', 'field']) {
    assert(
      hasDynamicKeyInfoLookup
        || mailDetail.includes(`t('ai.keyInfo.${key}')`)
        || mailDetail.includes(`t(\`ai.keyInfo.${key}\`)`),
      `Expected MailDetail to render ${key} label through i18n`,
    );
  }

  assert(!mailDetail.includes("label: '淇℃伅'"), 'Expected mojibake key-info fallback label to be removed');
}

function testLanguageResourcesExist() {
  const expectations = [
    ['zh', "'ai.keyInfo.keyInfo': '关键信息'"],
    ['zh', "'ai.keyInfo.action': '行动'"],
    ['zh', "'ai.keyInfo.evidence': '依据'"],
    ['zh', "'ai.keyInfo.time': '时间'"],
    ['zh', "'ai.keyInfo.link': '链接'"],
    ['zh', "'ai.keyInfo.processingLevel': '处理级别'"],
    ['zh', "'ai.keyInfo.amount': '金额'"],
    ['zh', "'ai.keyInfo.details': '详情'"],
    ['en', "'ai.keyInfo.keyInfo': 'Key information'"],
    ['en', "'ai.keyInfo.action': 'Action'"],
    ['en', "'ai.keyInfo.evidence': 'Evidence'"],
    ['en', "'ai.keyInfo.time': 'Time'"],
    ['en', "'ai.keyInfo.link': 'Link'"],
    ['en', "'ai.keyInfo.processingLevel': 'Processing level'"],
    ['en', "'ai.keyInfo.amount': 'Amount'"],
    ['en', "'ai.keyInfo.details': 'Details'"],
    ['en', "'ai.keyInfo.recipient': 'Recipient'"],
    ['ja', "'ai.keyInfo.keyInfo': '重要情報'"],
    ['ja', "'ai.keyInfo.amount': '金額'"],
    ['de', "'ai.keyInfo.keyInfo': 'Schlüsselinformationen'"],
    ['de', "'ai.keyInfo.amount': 'Betrag'"],
  ];

  for (const [, snippet] of expectations) {
    assert(i18n.includes(snippet), `Expected i18n resources to include ${snippet}`);
  }
}

function testEnglishUiDoesNotHardcodeChineseKeyInfoLabels() {
  const englishBlock = i18n.slice(i18n.indexOf('en: {'), i18n.indexOf('ja: {'));
  for (const chineseLabel of ['关键信息', '处理级别', '金额', '链接', '操作', '详情', '时间', '依据']) {
    assert(!englishBlock.includes(chineseLabel), `Expected English resources not to include Chinese label ${chineseLabel}`);
  }
}

testKeyInfoLabelsUseI18n();
testLanguageResourcesExist();
testEnglishUiDoesNotHardcodeChineseKeyInfoLabels();

console.log('ai key-info i18n regression tests passed');
