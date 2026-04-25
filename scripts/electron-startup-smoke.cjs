const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const electronPath = require('electron');
const rendererIndex = path.join(root, 'dist', 'renderer', 'index.html');

assert(fs.existsSync(rendererIndex), 'Run npm run build before the Electron startup smoke test');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimail-electron-smoke-'));
const child = spawn(electronPath, ['.', `--user-data-dir=${userDataDir}`], {
  cwd: root,
  env: {
    ...process.env,
    MINIMAIL_ELECTRON_SMOKE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
const appendOutput = (chunk) => {
  output += chunk.toString();
};
child.stdout.on('data', appendOutput);
child.stderr.on('data', appendOutput);

const timeout = setTimeout(() => {
  child.kill();
  throw new Error(`Electron startup smoke test timed out.\n${output}`);
}, 30000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  assert.strictEqual(code, 0, `Electron startup smoke test failed with exit code ${code}.\n${output}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log('electron startup smoke passed');
});
