import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testMailListGetsDenser() {
  const mailList = read('src/renderer/components/MailList.tsx');

  assert(mailList.includes('className="px-4 pt-4 pb-2 flex-shrink-0 space-y-3'), 'Expected MailList header block to tighten vertical spacing');
  assert(mailList.includes('className="flex items-center gap-2 px-4 py-2.5'), 'Expected search bar to use tighter vertical padding');
  assert(mailList.includes('className="flex-1 overflow-y-auto px-3 pb-3"'), 'Expected MailList body gutter to tighten slightly');
  assert(mailList.includes('className="px-3 pt-3 pb-1.5 text-[11px]'), 'Expected time-group headers to reduce top and bottom padding');
  assert(mailList.includes('className="mb-1.5 px-3 py-2.5 transition-colors flex items-center gap-2.5'), 'Expected mail rows to reduce margin, padding, and gap');
  assert(!mailList.includes('className="mb-2 px-3 py-3 transition-colors flex items-center gap-3 relative cursor-pointer"'), 'Expected old looser mail row spacing to be removed');
}

function testMailListHeaderUsesAppLanguageLabels() {
  const mailList = read('src/renderer/components/MailList.tsx');
  const app = read('src/renderer/App.tsx');

  assert(mailList.includes('appLanguage: AppLanguage;'), 'Expected MailList to receive appLanguage explicitly');
  assert(mailList.includes('const MAIL_LIST_UI'), 'Expected MailList to own stable localized header labels');
  assert(mailList.includes("searchPlaceholder: 'メール / 差出人 / 件名 / 本文を検索'"), 'Expected Japanese search placeholder to be present');
  assert(mailList.includes("tabs: { all: 'すべて', unread: '未読', read: '既読', attachments: '添付' }"), 'Expected Japanese tab labels to be present');
  assert(mailList.includes("groups: { today: '今日', yesterday: '昨日'"), 'Expected Japanese group labels to be present');
  assert(mailList.includes('placeholder={listUi.searchPlaceholder}'), 'Expected search input placeholder to use appLanguage labels');
  assert(mailList.includes('title={listUi.searchOptions}'), 'Expected search options button title to use appLanguage labels');
  assert(mailList.includes('aria-label={listUi.clearSearch}'), 'Expected clear-search aria label to use appLanguage labels');
  assert(mailList.includes('localizedFilterTabs.map'), 'Expected MailList to render localized tabs');
  assert(mailList.includes('getTimeGroupLabel(appLanguage, group)'), 'Expected MailList group headers to use appLanguage');
  assert(app.includes('appLanguage={appLanguage}'), 'Expected App to pass appLanguage into MailList');
}

function testSidebarUsesConsistentTopLevelRhythmAndLanguage() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  const tokens = read('src/renderer/utils/uiDesignTokens.ts');
  const app = read('src/renderer/App.tsx');

  assert(sidebar.includes('space-y-1.5'), 'Expected Sidebar top-level navigation to use a consistent stack rhythm');
  assert(sidebar.includes('space-y-1 pt-0.5'), 'Expected nested folder groups to use a subtle, consistent follow-up spacing');
  assert(sidebar.includes('appLanguage: AppLanguage;'), 'Expected Sidebar to receive appLanguage explicitly');
  assert(sidebar.includes("composeTitle: 'Compose'"), 'Expected Sidebar compose title to have English localization');
  assert(sidebar.includes("composeTitle: 'メール作成'"), 'Expected Sidebar compose title to have Japanese localization');
  assert(sidebar.includes('title={ui.composeTitle}'), 'Expected Sidebar compose button title to use localized UI labels');
  assert(sidebar.includes('const appLanguage = normalizeAppLanguage(appLanguageSetting || i18n.language);'), 'Expected Sidebar to prefer the app language setting over i18n fallback');
  assert(app.includes('appLanguage={appLanguage}'), 'Expected App to pass appLanguage into Sidebar and MailList');
  assert(!sidebar.includes('space-y-1 mt-2'), 'Expected Sidebar to stop mixing standalone groups with extra top margins');
  assert(!sidebar.includes('mt-2" style={buildSidebarItemStyle(false)}'), 'Expected settings entry to stop using a special extra top margin');
  assert(tokens.includes('padding: `7px ${uiSpacing.md}px 7px ${nested ? 18 : uiSpacing.sm}px`'), 'Expected sidebar item padding to tighten slightly');
  assert(tokens.includes('minHeight: 32'), 'Expected sidebar items to render with a denser height');
}

function run() {
  testMailListGetsDenser();
  testMailListHeaderUsesAppLanguageLabels();
  testSidebarUsesConsistentTopLevelRhythmAndLanguage();
  console.log('mail density and sidebar spacing tests passed');
}

run();
