'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function version(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 3000 });
  return result.status === 0
    ? { available: true, version: (result.stdout || result.stderr).trim().split('\n')[0] }
    : { available: false };
}
(async () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supportedNode = major > 22 || (major === 22 && minor >= 12);
  const report = {
    node: { version: process.versions.node, supported: supportedNode },
    electron: {
      installed:
        fs.existsSync(path.join(root, 'node_modules/electron/dist/electron.exe')) ||
        fs.existsSync(path.join(root, 'node_modules/electron/dist/electron')) ||
        fs.existsSync(path.join(root, 'node_modules/electron/dist/Electron.app')),
    },
    offlineEditor: fs.existsSync(path.join(root, 'src/vendor/editor.js')),
    git: version('git', ['--version']),
    python: version(process.env.PYTHON_BIN || 'python', ['--version']),
    privateData:
      'Operating-system application data / AuraScriptStudio. The app checks secure key storage at runtime.',
  };
  try {
    const endpoint = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const result = await fetch(endpoint.replace(/\/$/, '') + '/api/tags', {
      signal: AbortSignal.timeout(2500),
    });
    const data = await result.json();
    report.ollama = { available: result.ok, models: (data.models || []).map((model) => model.name) };
  } catch {
    report.ollama = { available: false };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!supportedNode || !report.electron.installed || !report.offlineEditor) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
