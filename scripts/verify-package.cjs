'use strict';
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'dist/win-unpacked/resources/app.asar');
const files = asar.listPackage(archive), checked = [], mismatched = [];
for (const entry of files) {
  const relative = entry.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  if (!relative.startsWith('src/') && !relative.startsWith('assets/')) continue;
  const local = path.join(root, relative);
  if (!fs.statSync(local).isFile()) continue;
  checked.push(relative);
  if (!fs.readFileSync(local).equals(asar.extractFile(archive, relative.split('/').join(path.sep)))) mismatched.push(relative);
}
const privateEntries = files.filter(entry => /\.env|\.runtime|test-results|state\.json|node_modules/.test(entry));
const result = {checkedAt: new Date().toISOString(), checked: checked.length, mismatched, privateEntries};
fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
fs.writeFileSync(path.join(root, 'test-results/package-source-match.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (mismatched.length || privateEntries.length) process.exitCode = 1;
