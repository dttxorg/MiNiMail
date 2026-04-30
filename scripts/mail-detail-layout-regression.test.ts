import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testMailListWidthIsResizable() {
  const app = read('src/renderer/App.tsx');
  const mailList = read('src/renderer/components/MailList.tsx');

  assert(app.includes('mailListWidth'), 'Expected App.tsx to hold mail list width in state');
  assert(app.includes('isResizingMailList'), 'Expected App.tsx to track resizing interaction state');
  assert(app.includes('mailListResizeRef'), 'Expected App.tsx to keep drag origin metadata');
  assert(app.includes('onMouseDown={startMailListResize}') || app.includes('onPointerDown={startMailListResize}'), 'Expected a resize handle to start list resizing');
  assert(!mailList.includes('width: 460'), 'Expected MailList to stop hardcoding a fixed width');
}

function testWindowControlsAreDetachedFromLegacyTopDragStrip() {
  const app = read('src/renderer/App.tsx');
  const main = read('src/main/index.ts');
  assert(!app.includes('fixed top-0 left-0 h-8 z-40 [-webkit-app-region:drag]'), 'Expected App.tsx to remove the legacy fixed top drag strip');
  assert(app.includes('WindowControls className='), 'Expected App.tsx to keep rendering custom window controls');
  assert(main.includes('frame: isMacOS'), 'Expected main BrowserWindow to stay frameless on Windows/Linux while using a native frame on macOS');
  assert(main.includes("titleBarStyle: 'hiddenInset'"), 'Expected macOS to use a native hiddenInset title bar');
}

function testWindowControlsKeepClickHandlersActive() {
  const controls = read('src/renderer/components/WindowControls.tsx');

  assert(!controls.includes('event.preventDefault()'), 'Expected window control drag guard to avoid preventDefault');
  assert(!controls.includes("position: 'relative'"), 'Expected WindowControls not to override absolute positioning from App.tsx');
  assert(controls.includes('onMouseUp={stopWindowDrag}'), 'Expected window control buttons to stop propagation on mouse up');
  assert(controls.includes('window.electronAPI.minimizeWindow()'), 'Expected minimize button click handler');
  assert(controls.includes('window.electronAPI.maximizeWindow()'), 'Expected maximize button click handler');
  assert(controls.includes('window.electronAPI.closeWindow()'), 'Expected close button click handler');
}

function testAssistantWaitsForDetailBodyBeforeAiActions() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('detailRequestRef = useRef<Promise<MailEmail> | null>(null)'), 'Expected MailDetail to keep a single in-flight detail request');
  assert(detail.includes('if (detailRequestRef.current) return detailRequestRef.current;'), 'Expected repeated AI/detail loads to await the same request instead of falling back to summary data');
  assert(!detail.includes('if (detail || loading) return detail ?? email;'), 'Expected MailDetail to stop returning summary mail data while detail is still loading');
}

function testDefaultExpandedConversationLoadsDetailBody() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('if (expanded && !detail && !loading)'), 'Expected expanded conversation cards without detail to auto-load their body');
  assert(detail.includes('void ensureDetailLoaded();'), 'Expected expanded conversation cards to invoke detail loading without waiting for a click');
}

function testCollapseIndicatorUsesChevronInsteadOfQuestionMark() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('ChevronDown') || detail.includes('ChevronUp'), 'Expected MailDetail to render a chevron collapse indicator');
  assert(!detail.includes("{expanded ? '?' : '?'}"), 'Expected MailDetail to stop showing question marks as collapse affordance');
}

function testUnifiedMailDetailAndAssistantWrapping() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const styles = read('src/renderer/styles/global.css');

  assert(detail.includes('whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0'), 'Expected assistant summary to wrap long content safely');
  assert(detail.includes('className="min-w-0 break-words"'), 'Expected assistant action items to wrap long content safely');
  assert(!detail.includes('borderBottom: `1px solid ${uiColor.borderSubtle}`'), 'Expected MailDetail to remove the old rigid top divider shell');
  assert(styles.includes('.overflow-wrap-anywhere'), 'Expected shared overflow-wrap utility class to exist');
}

function testSelfSentMailDoesNotAutoShowAssistant() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('const showAssistant = !isLocalSender;'), 'Expected self-sent mail to disable the assistant panel');
  assert(detail.includes('if (expanded && showAssistant)'), 'Expected assistant auto-load to skip self-sent mail');
  assert(detail.includes('{showAssistant && ('), 'Expected assistant panel rendering to be gated');
}

function testDetailToolbarOwnsActionsAndForwardIsNotAiGenerated() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('title={isSpam ? ui.removeSpam : isArchived ? ui.removeArchive : ui.archive}'), 'Expected archive button to become remove-spam in spam folder and remove-archive in archive folder');
  assert(detail.includes("onClick={() => void handleAIFunction('translate')}"), 'Expected translate action in the mail toolbar');
  assert(detail.includes('onClick={() => void handleAiReply()}'), 'Expected AI reply action in the mail toolbar');
  assert(detail.includes('onClick={() => void handleForward()}'), 'Expected forward action in the mail toolbar');
  assert(!detail.includes('onReplyWithSuggestion(`${aiForwardIntroLabel}'), 'Expected forward to stop generating an AI forwarding note');
}

function testTranslationCanRenderRichHtmlBody() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const sanitizer = read('src/renderer/utils/mailHtmlSanitizer.ts');

  assert(detail.includes('const [translatedHtml, setTranslatedHtml] = useState<string | null>(null);'), 'Expected MailDetail to keep translated HTML state');
  assert(detail.includes('translateHtmlPreservingMarkup('), 'Expected MailDetail to translate body HTML while preserving markup');
  assert(detail.includes('translatePlainTextFallback'), 'Expected MailDetail to keep a plain-text translation fallback path');
  assert(detail.includes('rich translation failed') && detail.includes('falling back to plain text translation'), 'Expected rich HTML translation to fall back to plain translation when markup preservation fails');
  assert(detail.includes('const fallbackHtml = await translatePlainTextFallback();'), 'Expected failed rich translation to render a plain-text translation result');
  assert(detail.includes('plain translation fallback failed') && detail.includes('setTranslatedHtml(null);'), 'Expected failed plain translation fallback to keep the original body visible');
  assert(detail.includes("bodyHtml={translatedHtml}"), 'Expected translated HTML to render through MailBody instead of a plain pre block');
  assert(sanitizer.includes("'width', 'height'"), 'Expected HTML sanitization to preserve image dimensions');
  assert(detail.includes("from '../../shared/email-ai/translateHtmlPreservingMarkup'"), 'Expected MailDetail to import the HTML translator directly instead of the shared barrel');
  assert(!detail.includes("from '../../shared/email-ai';"), 'Expected MailDetail to avoid the shared email-ai barrel import in renderer');
}

function testActionSuggestionParsingStripsRepeatedHandlingLevelPrefixes() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(detail.includes('function parseActionSuggestionLines'), 'Expected MailDetail to use a dedicated action suggestion parser');
  assert(detail.includes('Do not repeat the handling level on every action line') || detail.includes('HANDLING_LEVEL_PREFIXES'), 'Expected action parsing to be aware of repeated handling-level prefixes');
  assert(detail.includes('actions: parseActionSuggestionLines(actionsResult, 4)'), 'Expected assistant actions to use the dedicated action parser');
}

function testReplySuggestionsDoNotLeaveStandalonePanel() {
  const detail = read('src/renderer/components/MailDetail.tsx');

  assert(!detail.includes('setAiResult(result);\n      onReplyWithSuggestion(result);'), 'Expected AI reply action not to cache a duplicate aiResult panel');
  assert(detail.includes('onReplyWithSuggestion(result);'), 'Expected AI reply still to open compose with the generated reply');
  assert(detail.includes("aiFunction !== 'translate' && aiFunction !== 'reply'"), 'Expected reply results not to render as an extra standalone panel');
}

function testEmptyMailStateUsesBrandedCosmicArtwork() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const styles = read('src/renderer/styles/global.css');

  assert(detail.includes('function EmptyMailState'), 'Expected MailDetail to use a dedicated empty mail state');
  assert(detail.includes('empty-mail-cosmos'), 'Expected empty mail state to use the cosmic artwork shell');
  assert(detail.includes('暂无邮件'), 'Expected empty mail state to include the requested Chinese empty title');
  assert(styles.includes('@keyframes emptyMailOrbit'), 'Expected empty mail state to have subtle orbital motion');
  assert(styles.includes('.empty-mail-stars'), 'Expected empty mail state to include a star field treatment');
}

function testMailLinksOpenInSystemBrowser() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const preload = read('src/preload/index.ts');
  const main = read('src/main/index.ts');

  assert(detail.includes('closest?.(\'a[href]\')'), 'Expected MailDetail body click handling to detect anchor clicks');
  assert(detail.includes('window.electronAPI.openExternal(href)'), 'Expected MailDetail to route body links through preload openExternal');
  assert(preload.includes("openExternal: (target: string) => ipcRenderer.invoke('app:openExternal', target)"), 'Expected preload to expose a dedicated openExternal bridge');
  assert(main.includes("ipcMain.handle('app:openExternal'"), 'Expected main process to handle external-link requests');
  assert(main.includes('webContents.setWindowOpenHandler'), 'Expected main process to deny in-app popups and reroute them externally');
  assert(main.includes("webContents.on('will-navigate'"), 'Expected main process to block in-app navigation for external links');
}

function testHtmlMailPreservesNativeEmailLayoutAndColor() {
  const detail = read('src/renderer/components/MailDetail.tsx');
  const sanitizer = read('src/renderer/utils/mailHtmlSanitizer.ts');
  const styles = read('src/renderer/styles/global.css');

  assert(sanitizer.includes("'bgcolor'"), 'Expected MailDetail sanitization to preserve legacy email bgcolor attributes');
  assert(sanitizer.includes("'align'"), 'Expected MailDetail sanitization to preserve legacy email alignment attributes');
  assert(sanitizer.includes("'valign'"), 'Expected MailDetail sanitization to preserve legacy email vertical alignment attributes');
  assert(sanitizer.includes("'cellpadding'"), 'Expected MailDetail sanitization to preserve legacy email table spacing attributes');
  assert(sanitizer.includes("'cellspacing'"), 'Expected MailDetail sanitization to preserve legacy email table spacing attributes');
  assert(sanitizer.includes("'border'"), 'Expected MailDetail sanitization to preserve legacy email border attributes');
  assert(detail.includes('mail-body-html'), 'Expected MailDetail to distinguish HTML mail rendering from plain-text rendering');

  assert(styles.includes('.mail-body-html'), 'Expected dedicated HTML mail styling instead of a single forced body style');
  assert(!styles.includes('color: inherit !important;'), 'Expected HTML mail rendering not to force all text colors to inherit');
  assert(!styles.includes("background: transparent !important;"), 'Expected HTML mail rendering not to force all backgrounds transparent');
  assert(!styles.includes("background-color: transparent !important;"), 'Expected HTML mail rendering not to strip all email background colors');
  assert(!styles.includes('.mail-body-content table {\n  max-width: 100% !important;\n  width: 100% !important;'), 'Expected HTML mail rendering not to force email tables to full width');
  assert(!styles.includes(".mail-body-content [style*='max-width']"), 'Expected HTML mail rendering not to flatten native max-width containers');
  assert(!styles.includes('display: block;'), 'Expected HTML mail rendering not to force all images to block layout');
}

function run() {
  testMailListWidthIsResizable();
  testWindowControlsAreDetachedFromLegacyTopDragStrip();
  testWindowControlsKeepClickHandlersActive();
  testAssistantWaitsForDetailBodyBeforeAiActions();
  testDefaultExpandedConversationLoadsDetailBody();
  testCollapseIndicatorUsesChevronInsteadOfQuestionMark();
  testUnifiedMailDetailAndAssistantWrapping();
  testSelfSentMailDoesNotAutoShowAssistant();
  testDetailToolbarOwnsActionsAndForwardIsNotAiGenerated();
  testTranslationCanRenderRichHtmlBody();
  testActionSuggestionParsingStripsRepeatedHandlingLevelPrefixes();
  testReplySuggestionsDoNotLeaveStandalonePanel();
  testEmptyMailStateUsesBrandedCosmicArtwork();
  testMailLinksOpenInSystemBrowser();
  testHtmlMailPreservesNativeEmailLayoutAndColor();
  console.log('mail-detail-layout-regression tests passed');
}

run();
