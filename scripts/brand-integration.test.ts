import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testPackageUsesCanonicalBrandName() {
  const pkg = JSON.parse(read('package.json')) as {
    build?: {
      productName?: string;
      appId?: string;
      nsis?: {
        installerIcon?: string;
        uninstallerIcon?: string;
        installerHeaderIcon?: string;
        shortcutName?: string;
      };
    };
  };
  assert(pkg.build?.productName === 'MiNiMail', `Expected productName to be MiNiMail, got ${pkg.build?.productName}`);
  assert(pkg.build?.appId === 'com.minimail.email', 'Expected Windows AppUserModelId/appId to remain stable');
  assert(pkg.build?.nsis?.installerIcon === 'build/icons/icon.ico', 'Expected NSIS installer icon to use the branded ICO');
  assert(pkg.build?.nsis?.uninstallerIcon === 'build/icons/icon.ico', 'Expected NSIS uninstaller icon to use the branded ICO');
  assert(pkg.build?.nsis?.installerHeaderIcon === 'build/icons/icon.ico', 'Expected NSIS header icon to use the branded ICO');
  assert(pkg.build?.nsis?.shortcutName === 'MiNiMail', 'Expected installer shortcuts to use canonical brand name');
}

function testMainProcessAppliesBrandEverywhere() {
  const main = read('src/main/index.ts');
  const brand = read('src/main/brand.ts');
  assert(brand.includes("export const APP_NAME = 'MiNiMail'"), 'Expected brand module to define canonical app name');
  assert(main.includes('app.setName(APP_NAME)'), 'Expected Electron app name to be set explicitly');
  assert(main.includes('app.setAppUserModelId(APP_USER_MODEL_ID)'), 'Expected Windows notifications to use stable AppUserModelId');
  assert(main.includes('title: APP_NAME'), 'Expected BrowserWindow title to use canonical app name');
  assert(main.includes("process.platform === 'win32' ? 'ico' : 'png'"), 'Expected Windows BrowserWindow icon to use the branded ICO');
  assert(main.includes('new Tray(') && main.includes('if (isMacOS) return;'), 'Expected main process to create a Windows/Linux tray icon while skipping macOS');
  assert(main.includes('appTray.setToolTip(APP_NAME)'), 'Expected tray tooltip to use canonical app name');
  assert(main.includes('function quitApplication'), 'Expected main process to centralize explicit quit behavior');
  assert(
    main.includes("ipcMain.on('window:close'") &&
    main.includes('if (isMacOS)') &&
    main.includes('mainWindow?.close();') &&
    main.includes('quitApplication();'),
    'Expected close button IPC to hide on macOS and quit on Windows/Linux',
  );
  assert(main.includes('appTray?.destroy()'), 'Expected quit path to destroy tray so the process is not kept alive');
}

function testNotificationsUseIconAndAppName() {
  const service = read('src/main/services/mailService.ts');
  assert(service.includes('getMailNotificationIconPath'), 'Expected mail notifications to use a shared branded icon path');
  assert(service.includes('icon: getMailNotificationIconPath()'), 'Expected native notification to include branded icon');
}

function testRendererUsesCleanLogoAsset() {
  const sidebar = read('src/renderer/components/Sidebar.tsx');
  assert(sidebar.includes('minimailLogo'), 'Expected Sidebar to use the packaged clean logo asset');
  assert(sidebar.includes('alt="MiNiMail"'), 'Expected Sidebar logo alt text to use canonical brand name');
  assert(!sidebar.includes('rounded-2xl object-contain flex-shrink-0 shadow'), 'Expected Sidebar logo image to avoid a filled rounded container/shadow');
}

function testIconAssetsExist() {
  const iconPng = path.join(process.cwd(), 'build/icons/app-icon.png');
  const iconIco = path.join(process.cwd(), 'build/icons/icon.ico');
  const rendererLogo = path.join(process.cwd(), 'src/renderer/assets/minimail-logo.png');
  assert(fs.existsSync(iconPng) && fs.statSync(iconPng).size > 1000, 'Expected branded PNG app icon asset to exist');
  assert(fs.existsSync(iconIco) && fs.statSync(iconIco).size > 1000, 'Expected branded ICO app icon asset to exist');
  assert(fs.existsSync(rendererLogo) && fs.statSync(rendererLogo).size > 1000, 'Expected renderer logo asset to exist');
}

function readPngCornerAlpha(filePath: string): number {
  const data = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      colorType = chunk[9];
    }
    if (type === 'IDAT') idat.push(chunk);
    offset += 12 + length;
  }

  assert(width > 0 && height > 0, 'Expected valid PNG dimensions');
  assert(colorType === 6, `Expected RGBA PNG color type 6, got ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const filter = raw[0];
  raw.copy(current, 0, 1, 1 + stride);

  if (filter === 1) {
    for (let i = 0; i < stride; i++) current[i] = (current[i] + (i >= bytesPerPixel ? current[i - bytesPerPixel] : 0)) & 0xff;
  } else if (filter === 2) {
    for (let i = 0; i < stride; i++) current[i] = (current[i] + previous[i]) & 0xff;
  } else if (filter !== 0) {
    throw new Error(`Unsupported PNG filter in logo alpha test: ${filter}`);
  }

  return current[3];
}

function testLogoBackgroundIsTransparent() {
  const rendererLogo = path.join(process.cwd(), 'src/renderer/assets/minimail-logo.png');
  const appIcon = path.join(process.cwd(), 'build/icons/app-icon.png');
  assert(readPngCornerAlpha(rendererLogo) < 8, 'Expected renderer logo corner to be transparent, not black or checkerboard filled');
  assert(readPngCornerAlpha(appIcon) < 8, 'Expected app icon corner to be transparent, not black filled');
}

function run() {
  testPackageUsesCanonicalBrandName();
  testMainProcessAppliesBrandEverywhere();
  testNotificationsUseIconAndAppName();
  testRendererUsesCleanLogoAsset();
  testIconAssetsExist();
  testLogoBackgroundIsTransparent();
  console.log('brand-integration tests passed');
}

run();
