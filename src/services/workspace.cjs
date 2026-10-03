'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWrite } = require('./store.cjs');
const MAX_FILE = 4 * 1024 * 1024;
const EXCLUDED = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  '.next',
  '.dart_tool',
  'coverage',
  '.idea',
  '.vscode',
]);
const revision = (content) => crypto.createHash('sha256').update(content).digest('hex');
const language = (filename) =>
  ({
    '.js': 'javascript',
    '.cjs': 'javascript',
    '.mjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.json': 'json',
    '.py': 'python',
    '.html': 'html',
    '.css': 'css',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.cs': 'csharp',
    '.rs': 'rust',
    '.go': 'go',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.dart': 'dart',
    '.txt': 'plaintext',
  })[path.extname(filename).toLowerCase()] || 'plaintext';
function contained(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}
class Workspace {
  constructor(store, options = {}) {
    this.store = store;
    this.chooseFolder = options.chooseFolder;
    this.trashPath = options.trashPath;
    this.emit = options.emit || (() => {});
    this.watcher = null;
    this.saves = new Map();
  }
  root() {
    const value = this.store.state.currentWorkspace;
    if (!value) throw new Error('Open a workspace folder first.');
    if (!fs.existsSync(value))
      throw new Error('The selected workspace no longer exists. Open another folder.');
    const real = fs.realpathSync(value);
    if (real !== value) throw new Error('The workspace location changed. Reopen the canonical folder.');
    return real;
  }
  resolve(input, allowRoot = false) {
    const root = this.root();
    if (typeof input !== 'string' || input.includes('\0') || (!input && !allowRoot))
      throw new Error('A relative workspace path is required.');
    if (path.isAbsolute(input)) throw new Error('Use a relative path inside the selected workspace.');
    const target = path.resolve(root, input || '.');
    if (!contained(root, target) || (!allowRoot && target === root))
      throw new Error('The path escapes the selected workspace.');
    let ancestor = target;
    while (!fs.existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error('The parent folder is unavailable.');
      ancestor = parent;
    }
    if (!contained(root, fs.realpathSync(ancestor)))
      throw new Error('A symbolic link points outside the selected workspace.');
    if (fs.existsSync(target) && !contained(root, fs.realpathSync(target)))
      throw new Error('A symbolic link points outside the selected workspace.');
    // .git mutations belong to Git itself, never editor writes.
    if (path.relative(root, target).split(path.sep).includes('.git'))
      throw new Error('Git internal files cannot be edited through AuraScript.');
    return target;
  }
  rel(target) {
    return path.relative(this.root(), target).split(path.sep).join('/');
  }
  async open(payload = {}) {
    let selected = payload.path;
    if (!selected) {
      if (!this.chooseFolder) throw new Error('Folder selection is unavailable.');
      selected = await this.chooseFolder();
    }
    if (!selected) return { cancelled: true };
    const root = await fsp.realpath(selected);
    if (!(await fsp.stat(root)).isDirectory()) throw new Error('Choose a directory for the workspace.');
    const item = { path: root, name: path.basename(root), lastOpenedAt: new Date().toISOString() };
    this.store.state.currentWorkspace = root;
    this.store.state.workspaces = [item, ...this.store.state.workspaces.filter((w) => w.path !== root)].slice(
      0,
      20,
    );
    this.store.save();
    this.watch(root);
    this.emit({ type: 'workspace:changed', root });
    return { root, workspace: item, ...(await this.list({})) };
  }
  watch(root) {
    if (this.watcher) this.watcher.close();
    try {
      let timer;
      this.watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (
          filename &&
          String(filename)
            .split(/[\\/]/)
            .some((p) => EXCLUDED.has(p))
        )
          return;
        clearTimeout(timer);
        timer = setTimeout(
          () => this.emit({ type: 'workspace:changed', root, path: filename?.toString() || '' }),
          180,
        );
        timer.unref?.();
      });
      this.watcher.on('error', () => {});
    } catch {
      /* File operations emit changes even on platforms without recursive watching. */
    }
  }
  async list(payload = {}) {
    const target = this.resolve(payload.path || '', true);
    const entries = [];
    for (const entry of await fsp.readdir(target, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name)) continue;
      const filename = path.join(target, entry.name);
      let stat;
      try {
        this.resolve(this.rel(filename));
        stat = await fsp.stat(filename);
      } catch {
        continue;
      }
      entries.push({
        name: entry.name,
        path: this.rel(filename),
        kind: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        symbolicLink: entry.isSymbolicLink(),
      });
    }
    entries.sort(
      (a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || a.name.localeCompare(b.name),
    );
    return { root: this.root(), path: this.rel(target), entries };
  }
  async read(payload) {
    const target = this.resolve(payload.path);
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error('Select a text file.');
    if (stat.size > MAX_FILE) throw new Error('Files larger than 4 MB cannot be opened in the editor.');
    const bytes = await fsp.readFile(target);
    if (bytes.includes(0)) throw new Error('Binary files cannot be opened as text.');
    const content = bytes.toString('utf8');
    return {
      path: this.rel(target),
      name: path.basename(target),
      content,
      revision: revision(bytes),
      language: language(target),
    };
  }
  async create(payload) {
    const target = this.resolve(payload.path);
    if (fs.existsSync(target)) throw new Error('A file or folder already exists at this location.');
    if (!fs.existsSync(path.dirname(target))) throw new Error('The parent directory does not exist.');
    if (payload.kind === 'directory') await fsp.mkdir(target);
    else if (payload.kind === 'file') await fsp.writeFile(target, '', { flag: 'wx' });
    else throw new Error('Choose file or directory.');
    this.changed(payload.path);
    return payload.kind === 'file' ? this.read(payload) : { path: this.rel(target), kind: 'directory' };
  }
  async save(payload) {
    const target = this.resolve(payload.path);
    const previous = this.saves.get(target) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => this.saveUnlocked(payload));
    this.saves.set(target, pending);
    try {
      return await pending;
    } finally {
      if (this.saves.get(target) === pending) this.saves.delete(target);
    }
  }
  async saveUnlocked(payload) {
    if (typeof payload.content !== 'string' || Buffer.byteLength(payload.content) > MAX_FILE)
      throw new Error('File content must be text smaller than 4 MB.');
    const target = this.resolve(payload.path);
    let mode = 0o600;
    if (fs.existsSync(target)) {
      if ((await fsp.lstat(target)).isSymbolicLink())
        throw new Error(
          'Symbolic links cannot be replaced through the editor. Open their actual file instead.',
        );
      const current = await this.read(payload);
      if (!payload.revision || payload.revision !== current.revision) {
        const error = new Error('The file changed on disk. Reload and compare before saving.');
        error.code = 'CONFLICT';
        throw error;
      }
      mode = (await fsp.stat(target)).mode;
    } else {
      if (payload.revision) {
        const error = new Error('The file was removed on disk. Recreate it explicitly.');
        error.code = 'CONFLICT';
        throw error;
      }
      if (!fs.existsSync(path.dirname(target))) throw new Error('The parent directory does not exist.');
    }
    if (fs.existsSync(target) && revision(fs.readFileSync(target)) !== payload.revision) {
      const error = new Error('The file changed on disk. Reload and compare before saving.');
      error.code = 'CONFLICT';
      throw error;
    }
    if (!fs.existsSync(target)) throw new Error('Create this file explicitly before saving it.');
    atomicWrite(target, payload.content, mode);
    this.changed(payload.path);
    return this.read(payload);
  }
  async rename(payload) {
    const original = this.resolve(payload.path),
      target = this.resolve(payload.newPath);
    if (!fs.existsSync(original)) throw new Error('The original file or folder does not exist.');
    if (fs.existsSync(target)) throw new Error('The destination already exists.');
    if (contained(original, target)) throw new Error('A folder cannot be moved inside itself.');
    if (!fs.existsSync(path.dirname(target))) throw new Error('The destination parent does not exist.');
    await fsp.rename(original, target);
    this.changed(payload.newPath);
    return { path: this.rel(target) };
  }
  async trash(payload) {
    const original = this.resolve(payload.path);
    if (!fs.existsSync(original)) throw new Error('The selected item does not exist.');
    if ((await fsp.lstat(original)).isSymbolicLink())
      throw new Error('Symbolic links cannot be retained through AuraScript trash.');
    const id = crypto.randomUUID(),
      retained = path.join(this.store.directory, 'trash', id);
    await fsp.mkdir(path.dirname(retained), { recursive: true });
    await fsp.cp(original, retained, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    const item = {
      id,
      path: this.rel(original),
      root: this.root(),
      name: path.basename(original),
      deletedAt: new Date().toISOString(),
      retained,
      status: 'prepared',
    };
    this.store.state.trash.unshift(item);
    try {
      this.store.save();
    } catch (error) {
      this.store.state.trash = this.store.state.trash.filter((t) => t.id !== id);
      throw error;
    }
    await fsp.rm(original, { recursive: true });
    item.status = 'retained';
    this.store.save();
    this.changed(item.path);
    return { id, path: item.path, restorable: true };
  }
  async restore(payload) {
    const item = this.store.state.trash.find((t) => t.id === payload.id);
    if (!item) throw new Error('The retained item does not exist.');
    if (item.root !== this.root()) throw new Error('Open the original workspace before restoring this item.');
    const expected = path.join(this.store.directory, 'trash', item.id);
    if (!/^[a-f0-9-]{36}$/.test(item.id) || path.resolve(item.retained) !== expected)
      throw new Error('The retained item has an invalid location.');
    const destination = this.resolve(item.path);
    if (fs.existsSync(destination)) throw new Error('Restore cannot replace an existing file or folder.');
    if (!fs.existsSync(item.retained)) throw new Error('The retained item is unavailable.');
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.cp(item.retained, destination, { recursive: true, force: false, errorOnExist: true });
    item.status = 'restored';
    this.store.save();
    await fsp.rm(item.retained, { recursive: true });
    this.store.state.trash = this.store.state.trash.filter((t) => t.id !== item.id);
    this.store.save();
    this.changed(item.path);
    return { path: item.path };
  }
  changed(relative) {
    this.emit({ type: 'workspace:changed', root: this.root(), path: relative });
  }
  async files() {
    const result = [];
    let examined = 0;
    const walk = async (directory) => {
      if (result.length >= 4000 || examined >= 20000) return;
      for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        if (++examined > 20000 || result.length >= 4000) return;
        if (EXCLUDED.has(entry.name) || entry.isSymbolicLink()) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(target);
        else if (entry.isFile() && (await fsp.stat(target)).size <= MAX_FILE) result.push(this.rel(target));
        if (result.length >= 4000) return;
      }
    };
    await walk(this.root());
    return result;
  }
  async search(payload = {}) {
    if (typeof payload.query !== 'string' || !payload.query || payload.query.length > 300)
      throw new Error('Enter a search query of 1–300 characters.');
    if (payload.regex)
      throw new Error(
        'Workspace regular expressions are disabled to prevent unbounded searches. Use literal text.',
      );
    const matches = [];
    let scannedBytes = 0,
      truncated = false;
    const needle = payload.caseSensitive ? payload.query : payload.query.toLowerCase();
    for (const filename of await this.files()) {
      const bytes = await fsp.readFile(this.resolve(filename));
      scannedBytes += bytes.length;
      if (scannedBytes > 32 * 1024 * 1024) {
        truncated = true;
        break;
      }
      if (bytes.includes(0)) continue;
      const lines = bytes.toString('utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        const text = lines[index];
        const haystack = payload.caseSensitive ? text : text.toLowerCase();
        let offset = 0,
          column;
        while ((column = haystack.indexOf(needle, offset)) !== -1) {
          matches.push({ path: filename, line: index + 1, column: column + 1, text: text.slice(0, 1000) });
          offset = column + Math.max(1, needle.length);
          if (matches.length >= 1000) {
            truncated = true;
            break;
          }
        }
        if (truncated) break;
      }
      if (truncated) break;
    }
    return { matches, truncated, scannedBytes };
  }
  async replace(payload = {}) {
    if (typeof payload.query !== 'string' || !payload.query || typeof payload.replacement !== 'string')
      throw new Error('Search and replacement text are required.');
    if (!Array.isArray(payload.paths) || !payload.paths.length || payload.paths.length > 50)
      throw new Error('Select 1�50 explicit files.');
    if (payload.matches !== undefined && (!Array.isArray(payload.matches) || payload.matches.length > 1000))
      throw new Error('Select at most 1,000 explicit matches.');
    const changes = [];
    for (const filename of [...new Set(payload.paths)]) {
      const file = await this.read({ path: filename });
      if (!payload.revisions?.[filename] || payload.revisions[filename] !== file.revision) {
        const error = new Error(`${filename} changed. Preview replacements again.`);
        error.code = 'CONFLICT';
        throw error;
      }
      const positions = [];
      const needle = payload.caseSensitive ? payload.query : payload.query.toLowerCase();
      const haystack = payload.caseSensitive ? file.content : file.content.toLowerCase();
      if (payload.matches) {
        const lines = file.content.split('\n');
        let offsets = [];
        let offset = 0;
        for (const line of lines) {
          offsets.push(offset);
          offset += line.length + 1;
        }
        for (const match of payload.matches.filter((item) => item.path === filename)) {
          if (
            !Number.isInteger(match.line) ||
            !Number.isInteger(match.column) ||
            match.line < 1 ||
            match.line > lines.length ||
            match.column < 1
          )
            throw new Error('A selected match has an invalid position.');
          const position = offsets[match.line - 1] + match.column - 1;
          if (
            position + payload.query.length > offsets[match.line - 1] + lines[match.line - 1].length ||
            haystack.slice(position, position + payload.query.length) !== needle
          )
            throw new Error('A selected match changed. Search again.');
          positions.push(position);
        }
      } else {
        let position = 0;
        while ((position = haystack.indexOf(needle, position)) !== -1) {
          positions.push(position);
          position += needle.length;
          if (positions.length > 1000) throw new Error('Replacement is limited to 1,000 matches per file.');
        }
      }
      const unique = [...new Set(positions)].sort((a, b) => a - b);
      for (let index = 1; index < unique.length; index++)
        if (unique[index] < unique[index - 1] + needle.length)
          throw new Error('Selected replacement matches overlap.');
      let content = file.content;
      for (const position of unique.slice().reverse())
        content =
          content.slice(0, position) + payload.replacement + content.slice(position + payload.query.length);
      if (Buffer.byteLength(content) > MAX_FILE) throw new Error('Replacement exceeds the file size limit.');
      if (content !== file.content)
        changes.push({
          path: filename,
          before: file.content,
          after: content,
          revision: file.revision,
          count: unique.length,
        });
    }
    if (!payload.confirmed) return { preview: true, changes };
    // Revalidate all files before the first synchronous commit; no awaited operation may interleave these writes.
    for (const change of changes)
      if (revision(fs.readFileSync(this.resolve(change.path))) !== change.revision) {
        const error = new Error('A selected file changed. Preview again.');
        error.code = 'CONFLICT';
        throw error;
      }
    for (const change of changes) {
      const target = this.resolve(change.path);
      if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Symbolic links cannot be replaced.');
      atomicWrite(target, change.after, fs.statSync(target).mode);
      this.changed(change.path);
    }
    this.store.receipt('workspace:replace', 'completed', {
      files: changes.map((c) => c.path),
      count: changes.reduce((sum, c) => sum + c.count, 0),
    });
    return { applied: true, count: changes.length, matches: changes.reduce((sum, c) => sum + c.count, 0) };
  }

  close() {
    this.watcher?.close();
  }
}
module.exports = { Workspace, revision, language, contained, MAX_FILE };
