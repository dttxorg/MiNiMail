const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const main = read('src/main/index.ts');
const preload = read('src/preload/index.ts');
const app = read('src/renderer/App.tsx');
const sidebar = read('src/renderer/components/Sidebar.tsx');

assert(main.includes("const isMacOS = process.platform === 'darwin';"), 'Expected a shared macOS platform guard');
assert(main.includes('function buildApplicationMenu(): Menu'), 'Expected a native macOS application menu builder');
assert(main.includes('APPLICATION_MENU_TEXT'), 'Expected localized macOS menu copy');
assert(main.includes("settings: '设置...'") && main.includes("settings: 'Settings...'"), 'Expected localized Settings menu label');
assert(main.includes("mail: '邮件'") && main.includes("mail: 'Mail'"), 'Expected localized Mail menu label');
assert(main.includes("compose: '写邮件'") && main.includes("compose: 'Compose New Mail'"), 'Expected localized Compose New Mail menu label');
assert(main.includes("refresh: '刷新邮件'") && main.includes("refresh: 'Refresh Mail'"), 'Expected localized Refresh Mail menu label');
assert(main.includes("search: '搜索邮件'") && main.includes("search: 'Search Mail'"), 'Expected localized Search Mail menu label');
assert(main.includes("edit: '编辑'") && main.includes("edit: 'Edit'"), 'Expected localized Edit menu label');
assert(main.includes("cut: '剪切'") && main.includes("copy: '复制'") && main.includes("paste: '粘贴'") && main.includes("selectAll: '全选'"), 'Expected localized Edit menu item labels');
assert(main.includes("window: '窗口'") && main.includes("window: 'Window'"), 'Expected localized Window menu label');
assert(main.includes("minimize: '最小化'") && main.includes("zoom: '缩放'") && main.includes("closeWindow: '关闭窗口'"), 'Expected localized Window menu item labels');
assert(main.includes('label: text.settings') && main.includes("accelerator: 'Command+,'"), 'Expected Cmd+, Settings menu item');
assert(main.includes('label: text.mail'), 'Expected a mail-specific macOS menu');
assert(main.includes('label: text.compose') && main.includes("accelerator: 'Command+N'") && main.includes('click: openComposeWindow'), 'Expected Cmd+N Compose New Mail menu item');
assert(main.includes('label: text.refresh') && main.includes("accelerator: 'Command+R'") && main.includes('click: refreshMailWindow'), 'Expected Cmd+R Refresh Mail menu item');
assert(main.includes('label: text.search') && main.includes("accelerator: 'Command+F'") && main.includes('enabled: false'), 'Expected Search Mail to stay disabled until a safe search focus entry exists');
assert(main.includes("role: 'copy'") && main.includes("role: 'paste'") && main.includes("role: 'selectAll'"), 'Expected native Edit menu roles');
assert(main.includes("role: 'minimize'") && main.includes("role: 'zoom'") && main.includes("role: 'close'"), 'Expected native Window menu roles');
assert(main.includes("accelerator: 'Command+Q'") && main.includes('click: quitApplication'), 'Expected Cmd+Q to quit explicitly');
assert(main.includes('Menu.setApplicationMenu(isMacOS ? buildApplicationMenu() : null)'), 'Expected app menu only on macOS');
assert(!main.includes("label: 'View'") && !main.includes("role: 'help'"), 'Expected first macOS menu pass to stay minimal');
assert(main.includes("getSetting('app_language')"), 'Expected macOS menu language to hydrate from app settings');
assert(main.includes("ipcMain.handle('app:set-language'") && main.includes('updateApplicationMenuLanguage(language)'), 'Expected language changes to rebuild the macOS menu');

assert(main.includes('frame: isMacOS'), 'Expected macOS to use native frame while other platforms stay frameless');
assert(main.includes("titleBarStyle: 'hiddenInset'"), 'Expected macOS hiddenInset title bar');
assert(main.includes('trafficLightPosition'), 'Expected macOS traffic light positioning');
assert(main.includes('if (isMacOS && !isQuitting)') && main.includes('window.hide();'), 'Expected macOS close to hide without quitting');

assert(main.includes('function createAppTray(): void') && main.includes('if (isMacOS) return;'), 'Expected macOS to skip tray creation');
assert(main.includes('if (!isMacOS) {\n    createAppTray();\n  }'), 'Expected tray setup to remain for Windows/Linux');
assert(main.includes("app.on('activate', () => {\n    showMainWindow();\n  });"), 'Expected Dock activate to restore a hidden macOS window');

assert(preload.includes('onOpenSettings: (callback: () => void)') && preload.includes("ipcRenderer.on('app:open-settings'"), 'Expected preload to expose Settings menu event');
assert(preload.includes('onComposeNewMail: (callback: () => void)') && preload.includes("ipcRenderer.on('app:compose-new-mail'"), 'Expected preload to expose Compose menu event');
assert(preload.includes('onRefreshMail: (callback: () => void)') && preload.includes("ipcRenderer.on('app:refresh-mail'"), 'Expected preload to expose Refresh Mail menu event');
assert(preload.includes("'app:set-language'"), 'Expected preload allowlist to expose the menu language refresh event');
assert(app.includes('const isMacOS = useMemo('), 'Expected renderer to detect macOS');
assert(app.includes('onOpenSettings?.(() => setShowSettings(true))'), 'Expected renderer to open Settings from Cmd+, menu event');
assert(app.includes("onComposeNewMail?.(() => openCompose('new', null))"), 'Expected renderer to open compose from Cmd+N menu event');
assert(app.includes('onRefreshMail?.(() => {') && app.includes('void handleRefresh();'), 'Expected renderer to refresh mail from Cmd+R menu event');
assert(app.includes("window.electronAPI.invoke('app:set-language', appLanguage)"), 'Expected renderer language changes to refresh the native macOS menu');
assert(app.includes('{!isMacOS && <WindowControls'), 'Expected custom window controls to be hidden on macOS');
assert(app.includes('isMacOS={isMacOS}'), 'Expected App to pass macOS state to Sidebar');
assert(sidebar.includes('isMacOS?: boolean;'), 'Expected Sidebar to accept a macOS layout flag');
assert(sidebar.includes('style={isMacOS ? { paddingTop: 36 } : undefined}'), 'Expected Sidebar brand header to reserve vertical macOS traffic light space only on macOS');
assert(!sidebar.includes('paddingLeft: 76'), 'Expected macOS traffic light spacing not to push the brand header too far right');

console.log('macOS native experience regression passed');
