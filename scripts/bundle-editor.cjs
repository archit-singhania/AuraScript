'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'src', 'vendor');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const options = {
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'chrome140',
    logLevel: 'warning',
    loader: { '.ttf': 'file' },
  };
  await esbuild.build({
    ...options,
    entryPoints: [path.join(root, 'scripts/editor-entry.mjs')],
    outfile: path.join(output, 'editor.js'),
  });
  for (const [name, module] of Object.entries({
    editor: 'editor/editor.worker.js',
    json: 'language/json/json.worker.js',
    css: 'language/css/css.worker.js',
    html: 'language/html/html.worker.js',
    typescript: 'language/typescript/ts.worker.js',
  })) {
    await esbuild.build({
      ...options,
      entryPoints: [path.join(root, 'node_modules/monaco-editor/esm/vs', module)],
      outfile: path.join(output, name + '.worker.js'),
    });
  }
  for (const name of ['monaco-editor', 'dompurify']) {
    await fs.copyFile(path.join(root, 'node_modules', name, 'LICENSE'), path.join(output, name + '-LICENSE'));
  }
  console.log('Offline editor, language workers and licenses are bundled.');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
