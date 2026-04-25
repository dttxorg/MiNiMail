const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'src', 'main', 'index.ts');
const preloadPath = path.join(root, 'src', 'preload', 'index.ts');

const main = fs.readFileSync(mainPath, 'utf8');
const preload = fs.readFileSync(preloadPath, 'utf8');

const browserWindowBlock = main.match(/mainWindow\s*=\s*new BrowserWindow\(\{[\s\S]*?webPreferences:\s*\{([\s\S]*?)\n\s*\},\n\s*\}\);/);
assert(browserWindowBlock, 'Expected main window BrowserWindow webPreferences block to be present');

const webPreferences = browserWindowBlock[1];

assert(
  /sandbox:\s*true/.test(webPreferences),
  'Main renderer must explicitly enable sandbox: true',
);
assert(
  /contextIsolation:\s*true/.test(webPreferences),
  'Main renderer must keep contextIsolation: true',
);
assert(
  /nodeIntegration:\s*false/.test(webPreferences),
  'Main renderer must keep nodeIntegration: false',
);
assert(
  !/webSecurity:\s*false/.test(webPreferences),
  'Main renderer must not disable webSecurity',
);
assert(
  !/allowRunningInsecureContent:\s*true/.test(webPreferences),
  'Main renderer must not allow insecure mixed content',
);

assert(
  preload.includes("import { contextBridge, ipcRenderer } from 'electron';"),
  'Preload should only import Electron bridge primitives at top level',
);
assert(
  preload.includes("contextBridge.exposeInMainWorld('electronAPI'"),
  'Preload must expose renderer APIs through contextBridge',
);
assert(
  /const validChannels = \[[\s\S]*?\];/.test(preload),
  'Preload generic invoke must remain guarded by a channel allowlist',
);
assert(
  /if \(validChannels\.includes\(channel\)\) \{\s*return ipcRenderer\.invoke\(channel, \.\.\.args\);\s*\}/.test(preload),
  'Preload generic invoke must only invoke explicitly allowed channels',
);
assert(
  !/window\.(ipcRenderer|require|electron)\s*=/.test(preload),
  'Preload must not expose raw ipcRenderer, require, or electron globals',
);

console.log('electron-sandbox-security regression passed');
