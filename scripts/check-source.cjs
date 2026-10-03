'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(cjs|mjs|js)$/.test(entry.name)) files.push(file);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
walk(path.join(root, 'tests'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
if (/https?:\/\/[^"'<>\s]+\.js/.test(html)) throw new Error('Renderer scripts must be bundled locally.');
console.log(`Syntax checked ${files.length} maintained source files.`);
