'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { contained } = require('./workspace.cjs');
const MAX_OUTPUT = 2 * 1024 * 1024;
function execute(program, args, { cwd, timeout = 20000, input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      env: env || process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${program} timed out.`));
    }, timeout);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${program} is unavailable: ${error.code || error.message}`));
    });
    for (const [name, stream] of [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ])
      stream.setEncoding('utf8').on('data', (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_OUTPUT) {
          child.kill();
          reject(new Error('Command output exceeded the safety limit.'));
          return;
        }
        if (name === 'stdout') stdout += chunk.toString();
        else stderr += chunk.toString();
      });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}
class Processes {
  constructor(store, workspace, emit) {
    this.store = store;
    this.workspace = workspace;
    this.emit = emit;
    this.active = new Map();
  }
  start(payload = {}) {
    if (payload.confirmed !== true) throw new Error('Confirm the exact terminal command before running it.');
    if (
      typeof payload.command !== 'string' ||
      !payload.command.trim() ||
      payload.command.length > 10000 ||
      payload.command.includes('\0')
    )
      throw new Error('Enter a valid terminal command.');
    if (this.active.size >= 4) throw new Error('At most four terminal commands can run concurrently.');
    const cwd = this.workspace.root(),
      id = crypto.randomUUID();
    const program = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/sh';
    const args =
      process.platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', payload.command]
        : ['-lc', payload.command];
    const child = spawn(program, args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let finish;
    const finished = new Promise((resolve) => {
      finish = resolve;
    });
    const row = {
      finished,
      id,
      command: payload.command,
      cwd,
      startedAt: new Date().toISOString(),
      status: 'running',
      cancelled: false,
      output: '',
      child,
    };
    this.active.set(id, row);
    this.store.state.processHistory.unshift({
      id,
      command: payload.command,
      workspace: path.basename(cwd),
      startedAt: row.startedAt,
      status: 'running',
    });
    this.store.state.processHistory = this.store.state.processHistory.slice(0, 100);
    this.store.save();
    for (const [streamName, stream] of [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ])
      stream.setEncoding('utf8').on('data', (bytes) => {
        const data = bytes;
        row.output = (row.output + data).slice(-MAX_OUTPUT);
        this.emit({ type: 'process:data', id, stream: streamName, data });
      });
    child.on('error', (error) => {
      this.emit({
        type: 'process:data',
        id,
        stream: 'stderr',
        data: `Unable to launch the command: ${error.code || 'unknown error'}\n`,
      });
    });
    child.on('close', (code, signal) => {
      this.active.delete(id);
      const saved = this.store.state.processHistory.find((p) => p.id === id);
      if (saved) {
        Object.assign(saved, {
          status: row.cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed',
          finishedAt: new Date().toISOString(),
          code,
          signal,
          output: row.output,
        });
        this.store.save();
      }
      this.store.receipt('terminal', row.cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed', {
        command: row.command,
        code,
        processId: id,
      });
      this.emit({ type: 'process:exit', id, code, signal, cancelled: row.cancelled });
      finish();
    });
    return { id, command: payload.command, startedAt: row.startedAt };
  }
  async cancel(payload = {}) {
    const row = this.active.get(payload.id);
    if (!row) throw new Error('This command is no longer running.');
    row.cancelled = true;
    if (process.platform === 'win32') {
      const result = await execute('taskkill.exe', ['/PID', String(row.child.pid), '/T', '/F'], {
        timeout: 10000,
      });
      if (result.code !== 0 && this.active.has(row.id)) {
        row.cancelled = false;
        this.store.receipt('terminal:cancel', 'failed', {
          processId: row.id,
          error: 'Windows refused process-tree termination.',
        });
        throw new Error(
          'Windows refused process-tree termination. Check process permissions and stop this command in Windows if needed.',
        );
      }
    } else {
      try {
        process.kill(-row.child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      const timer = setTimeout(() => {
        try {
          process.kill(-row.child.pid, 'SIGKILL');
        } catch {}
      }, 1500);
      timer.unref();
    }
    await Promise.race([
      row.finished,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('The command has not confirmed termination yet.')),
          5000,
        );
        timer.unref();
      }),
    ]);
    return { id: payload.id, cancelled: true };
  }
  list() {
    return this.store.state.processHistory.map((row) => ({ ...row, running: this.active.has(row.id) }));
  }
  async close() {
    const rows = [...this.active.values()];
    await Promise.allSettled(rows.map((row) => this.cancel({ id: row.id })));
    await Promise.allSettled(
      rows.map((row) =>
        Promise.race([
          row.finished,
          new Promise((resolve) => {
            const timer = setTimeout(resolve, 5000);
            timer.unref();
          }),
        ]),
      ),
    );
  }
}
class Git {
  constructor(workspace, store) {
    this.workspace = workspace;
    this.store = store;
  }
  async run(args, check = true) {
    const root = this.workspace.root();
    const result = await execute(
      'git',
      ['-c', `safe.directory=${root.split(path.sep).join('/')}`, '-C', root, ...args],
      { cwd: root },
    );
    if (check && result.code !== 0)
      throw new Error((result.stderr || result.stdout || 'Git operation failed.').trim().slice(0, 4000));
    return result;
  }
  async verify() {
    const root = this.workspace.root();
    const result = await this.run(['rev-parse', '--show-toplevel'], false);
    if (result.code !== 0)
      throw new Error(
        'The selected workspace is not a Git repository. Initialize Git outside AuraScript or open an existing repository.',
      );
    const actual = fs.realpathSync(result.stdout.trim());
    if (path.relative(root, actual) !== '')
      throw new Error('Open the repository root before using Git operations.');
    return root;
  }
  async status() {
    await this.verify();
    const result = await this.run(['status', '--porcelain=v1', '-z', '--branch']);
    const segments = result.stdout.split('\0').filter(Boolean),
      files = [];
    let branch = '';
    for (let index = 0; index < segments.length; index++) {
      const line = segments[index];
      if (line.startsWith('##')) {
        branch = line.slice(3);
        continue;
      }
      const status = line.slice(0, 2),
        filename = line.slice(3);
      let originalPath;
      if (status.includes('R') || status.includes('C')) originalPath = segments[++index];
      files.push({
        path: filename,
        status,
        staged: status[0] !== ' ' && status[0] !== '?',
        unstaged: status[1] !== ' ',
        originalPath,
      });
    }
    return { branch, files, clean: files.length === 0 };
  }
  async diff(payload = {}) {
    await this.verify();
    const args = ['diff', '--no-ext-diff', '--no-color'];
    if (payload.commit) {
      if (!/^[a-fA-F0-9]{7,40}$/.test(payload.commit)) throw new Error('Choose a valid commit hash.');
      args.splice(0, args.length, 'show', '--format=fuller', '--no-ext-diff', '--no-color', payload.commit);
    } else if (payload.staged) args.push('--cached');
    if (payload.path) {
      this.workspace.resolve(payload.path);
      args.push('--', payload.path);
    }
    const result = await this.run(args);
    return { diff: result.stdout };
  }
  paths(payload) {
    if (!Array.isArray(payload.paths) || !payload.paths.length || payload.paths.length > 100)
      throw new Error('Select 1–100 explicit files.');
    for (const filename of payload.paths) this.workspace.resolve(filename);
    return payload.paths;
  }
  async stage(payload) {
    await this.verify();
    const paths = this.paths(payload);
    await this.run(['add', '--', ...paths]);
    this.store.receipt('git:stage', 'completed', { paths });
    return this.status();
  }
  async unstage(payload) {
    await this.verify();
    const paths = this.paths(payload);
    let result = await this.run(['restore', '--staged', '--', ...paths], false);
    if (result.code !== 0) {
      const head = await this.run(['rev-parse', '--verify', 'HEAD'], false);
      if (head.code !== 0) result = await this.run(['rm', '--cached', '--', ...paths], false);
    }
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Git unstage failed.');
    return this.status();
  }
  async commit(payload) {
    await this.verify();
    if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 2000)
      throw new Error('Enter a commit message of 1–2000 characters.');
    const staged = await this.run(['diff', '--cached', '--name-only']);
    if (!staged.stdout.trim()) throw new Error('Stage changes before creating a checkpoint.');
    const result = await this.run(['commit', '-m', payload.message]);
    const hash = (await this.run(['rev-parse', 'HEAD'])).stdout.trim();
    this.store.receipt('git:commit', 'completed', { hash, message: payload.message });
    return { hash, output: result.stdout, ...(await this.status()) };
  }
  async log() {
    await this.verify();
    const result = await this.run(['log', '-30', '--format=%H%x1f%an%x1f%aI%x1f%s'], false);
    if (result.code !== 0) return { commits: [] };
    return {
      commits: result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, author, date, message] = line.split('\x1f');
          return { hash, author, date, message };
        }),
    };
  }
  async branches() {
    await this.verify();
    const result = await this.run(['branch', '--format=%(refname:short)%09%(HEAD)']);
    return {
      branches: result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, head] = line.split('\t');
          return { name, current: head === '*' };
        }),
    };
  }
  async branch(payload) {
    await this.verify();
    if (typeof payload.name !== 'string' || payload.name.length > 100 || payload.name.startsWith('-'))
      throw new Error('Enter a valid branch name.');
    await this.run(['check-ref-format', '--branch', payload.name]);
    await this.run(['switch', '-c', payload.name]);
    this.store.receipt('git:branch', 'completed', { name: payload.name });
    return this.branches();
  }
}
async function diagnostics(workspace, payload) {
  if (typeof payload.content !== 'string' || Buffer.byteLength(payload.content) > 4 * 1024 * 1024)
    throw new Error('Diagnostics require text smaller than 4 MB.');
  workspace.resolve(payload.path);
  const extension = path.extname(payload.path).toLowerCase();
  if (extension === '.json') {
    try {
      JSON.parse(payload.content);
      return { provider: 'JSON parser', diagnostics: [] };
    } catch (error) {
      const position = /position (\d+)/.exec(error.message);
      let offset = position ? Number(position[1]) : 0;
      const lineMatch = /line (\d+) column (\d+)/.exec(error.message);
      const before = payload.content.slice(0, offset);
      return {
        provider: 'JSON parser',
        diagnostics: [
          {
            line: lineMatch ? Number(lineMatch[1]) : before.split('\n').length,
            column: lineMatch ? Number(lineMatch[2]) : before.length - before.lastIndexOf('\n'),
            message: error.message,
            severity: 'error',
          },
        ],
      };
    }
  }
  if (extension === '.py') {
    const program = process.env.PYTHON_BIN || 'python';
    const code =
      "import ast,json,sys\nsource=sys.stdin.read()\ntry:\n ast.parse(source)\n print(json.dumps([]))\nexcept SyntaxError as e:\n print(json.dumps([{'line':e.lineno or 1,'column':e.offset or 1,'endLine':e.end_lineno,'endColumn':e.end_offset,'message':e.msg,'severity':'error'}]))\n";
    const result = await execute(program, ['-I', '-c', code], { input: payload.content, timeout: 15000 });
    if (result.code !== 0)
      throw new Error(
        'Python diagnostics are unavailable. Install Python or set PYTHON_BIN to its executable.',
      );
    return { provider: 'Python AST', diagnostics: JSON.parse(result.stdout) };
  }
  return {
    provider: 'Monaco',
    diagnostics: [],
    message:
      'Language diagnostics for this file are supplied by the editor. JSON and Python syntax are additionally checked locally.',
  };
}
module.exports = { Processes, Git, execute, diagnostics };
