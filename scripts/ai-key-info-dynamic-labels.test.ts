import {
  parseKeyInfoItems,
  resolveKeyInfoFieldLabel,
  type KeyInfoItem,
} from '../src/renderer/utils/keyInfoItems';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakeT(key: string): string {
  const labels: Record<string, string> = {
    'ai.keyInfo.keyInfo': 'Key information',
    'ai.keyInfo.processingLevel': 'Processing level',
    'ai.keyInfo.amount': 'Amount',
    'ai.keyInfo.link': 'Link',
    'ai.keyInfo.action': 'Action',
    'ai.keyInfo.details': 'Details',
    'ai.keyInfo.time': 'Time',
    'ai.keyInfo.evidence': 'Evidence',
    'ai.keyInfo.recipient': 'Recipient',
    'ai.keyInfo.sender': 'Sender',
    'ai.keyInfo.subject': 'Subject',
    'ai.keyInfo.field': 'Field',
  };
  return labels[key] ?? key;
}

function labelsFor(items: KeyInfoItem[], language: string): string[] {
  return items.map((item) => resolveKeyInfoFieldLabel(item, language, fakeT));
}

function testChineseDynamicLabelsMapToEnglish() {
  const items = parseKeyInfoItems(JSON.stringify({
    fields: [
      { label: '处理级别', value: '高' },
      { label: '金额', value: '$100' },
      { label: '链接', value: 'https://example.com' },
      { label: '操作', value: '检查付款' },
      { label: '详情', value: '付款失败' },
      { label: '时间', value: 'Today' },
      { label: '依据', value: 'Error code 550' },
      { label: '失败收件人', value: 'user@example.com' },
      { label: '发件人', value: 'mailer-daemon@example.com' },
      { label: '主题', value: 'Delivery failed' },
    ],
  }));

  const labels = labelsFor(items, 'en');
  for (const chineseLabel of ['处理级别', '金额', '链接', '操作', '详情', '时间', '依据', '关键信息']) {
    assert(!labels.includes(chineseLabel), `English UI should not render Chinese label ${chineseLabel}`);
  }
  assert(labels.includes('Processing level'), 'Expected processing level to be localized');
  assert(labels.includes('Amount'), 'Expected amount to be localized');
  assert(labels.includes('Link'), 'Expected link to be localized');
  assert(labels.includes('Action'), 'Expected action to be localized');
  assert(labels.includes('Details'), 'Expected details to be localized');
  assert(labels.includes('Recipient'), 'Expected failed recipient to be localized as recipient');
}

function testItemsArrayAndAliasKeysAreNormalized() {
  const items = parseKeyInfoItems(JSON.stringify({
    items: [
      { name: 'price', text: '$20' },
      { typeLabel: 'deadline', content: 'Tomorrow' },
      { category: 'risk', value: 'High' },
      { title: '网址', value: 'https://example.com' },
    ],
  }));
  const labels = labelsFor(items, 'en');
  assert(labels.includes('Amount'), 'Expected price alias to map to Amount');
  assert(labels.includes('Time'), 'Expected deadline alias to map to Time');
  assert(labels.includes('Processing level'), 'Expected category/type alias to map to Processing level');
  assert(labels.includes('Link'), 'Expected Chinese URL alias to map to Link');
}

function testUnknownChineseLabelFallsBackOutsideChineseUi() {
  const item: KeyInfoItem = { label: '自定义字段', value: '旧缓存内容' };
  assert(resolveKeyInfoFieldLabel(item, 'en', fakeT) === 'Field', 'English UI should hide unknown Chinese labels');
  assert(resolveKeyInfoFieldLabel(item, 'zh', fakeT) === '自定义字段', 'Chinese UI may keep unknown Chinese labels');
}

function testLegacyLineParsingNormalizesChineseLabels() {
  const items = parseKeyInfoItems('金额：$10\n操作：确认付款\n详情：发票已生成');
  const labels = labelsFor(items, 'en');
  assert(labels.includes('Amount'), 'Expected legacy amount line to map to Amount');
  assert(labels.includes('Action'), 'Expected legacy action line to map to Action');
  assert(labels.includes('Details'), 'Expected legacy details line to map to Details');
}

testChineseDynamicLabelsMapToEnglish();
testItemsArrayAndAliasKeysAreNormalized();
testUnknownChineseLabelFallsBackOutsideChineseUi();
testLegacyLineParsingNormalizesChineseLabels();

console.log('ai key-info dynamic label regression tests passed');
