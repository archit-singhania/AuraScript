'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const defaults = () => ({
  version: 1,
  settings: {
    theme: 'system',
    collection: 'amethyst',
    fontSize: 14,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    reducedMotion: false,
    reducedTransparency: false,
    highContrast: false,
    autosave: false,
    provider: 'ollama',
    model: '',
    endpoint: 'http://127.0.0.1:11434',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    monthlyBudget: 0,
  },
  workspaces: [],
  currentWorkspace: null,
  sessions: [],
  memories: [],
  documents: [],
  reminders: [],
  workflows: [],
  receipts: [],
  processHistory: [],
  trash: [],
  secrets: {},
  usage: { requests: 0, inputCharacters: 0, outputCharacters: 0, estimatedCost: 0 },
});
function atomicWrite(filename, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, value, { mode, flag: 'wx' });
    const handle = fs.openSync(temporary, 'r+');
    try {
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, filename);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true });
    this.filename = path.join(this.directory, 'state.json');
    this.state = defaults();
    if (fs.existsSync(this.filename)) {
      let saved;
      try {
        saved = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      } catch {
        throw new Error(
          'Saved AuraScript state is unreadable. Preserve state.json and restore its backup before continuing.',
        );
      }
      if (saved.version !== 1) throw new Error('Saved AuraScript state uses an unsupported version.');
      this.state = {
        ...this.state,
        ...saved,
        settings: { ...this.state.settings, ...saved.settings },
        usage: { ...this.state.usage, ...saved.usage },
      };
      for (const key of [
        'workspaces',
        'sessions',
        'memories',
        'documents',
        'reminders',
        'workflows',
        'receipts',
        'processHistory',
        'trash',
      ])
        if (!Array.isArray(this.state[key])) throw new Error(`Saved ${key} must be a list.`);
    }
  }
  save() {
    atomicWrite(this.filename, JSON.stringify(this.state, null, 2));
  }
  receipt(action, status, details = {}) {
    const receipt = { id: crypto.randomUUID(), action, status, at: new Date().toISOString(), ...details };
    this.state.receipts.unshift(receipt);
    this.state.receipts = this.state.receipts.slice(0, 500);
    this.save();
    return receipt;
  }
}
module.exports = { Store, atomicWrite };
