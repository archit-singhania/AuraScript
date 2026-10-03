import * as monaco from 'monaco-editor';

window.MonacoEnvironment = {
  getWorkerUrl(_moduleId, label) {
    const workers = {
      json: 'json',
      css: 'css',
      scss: 'css',
      less: 'css',
      html: 'html',
      handlebars: 'html',
      razor: 'html',
      typescript: 'typescript',
      javascript: 'typescript',
    };
    return '/vendor/' + (workers[label] || 'editor') + '.worker.js';
  },
};
window.monaco = monaco;
window.monacoReady = Promise.resolve(monaco);
export { monaco };
