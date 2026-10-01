const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// Prevent audio or window popups during headless smoke check
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.resolve(__dirname, '../dist/main/preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });

  const indexPath = path.resolve(__dirname, '../dist/renderer/index.html');
  await win.loadFile(indexPath);

  // Wait for React to mount and run initial state renders
  await new Promise((r) => setTimeout(r, 1500));

  const pageInfo = await win.webContents.executeJavaScript(`
    (() => {
      const root = document.getElementById('root');
      const text = document.body.innerText || '';
      const hasWorkspace = Boolean(
        document.querySelector('[data-testid="minimail-app-workspace"]') ||
        document.querySelector('.relative.flex.flex-col.h-screen')
      );
      const hasErrorBoundary = Boolean(
        document.querySelector('[data-testid="root-error-boundary"]') ||
        text.includes('界面加载遇到异常') ||
        text.includes('Cannot access')
      );
      return {
        hasRoot: Boolean(root),
        childCount: root ? root.childElementCount : 0,
        hasWorkspace,
        hasErrorBoundary,
      };
    })()
  `);

  win.destroy();

  if (pageInfo.hasRoot && pageInfo.childCount > 0 && pageInfo.hasWorkspace && !pageInfo.hasErrorBoundary) {
    console.log('renderer render smoke passed: main workspace successfully mounted without error boundaries');
    app.exit(0);
  } else {
    console.error('renderer render smoke failed:', JSON.stringify(pageInfo));
    app.exit(1);
  }
});
