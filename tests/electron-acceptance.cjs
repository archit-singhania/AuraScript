'use strict';

const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const packaged = !!process.env.AURA_EXECUTABLE;
const output = path.join(repo, 'test-results', packaged ? 'electron-packaged' : 'electron-source');
const screenshots = path.join(repo, 'docs', 'screenshots');
const checks = [];
let app;
let page;
let recording;
const errors = [];

function git(root, args) {
  return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
}

function executable() {
  if (process.env.AURA_EXECUTABLE) return path.resolve(process.env.AURA_EXECUTABLE);
  const base = path.join(repo, 'node_modules', 'electron', 'dist');
  return process.platform === 'win32'
    ? path.join(base, 'electron.exe')
    : process.platform === 'darwin'
      ? path.join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : path.join(base, 'electron');
}

async function invoke(method, payload = {}) {
  return page.evaluate(async ({ method, payload }) => window.aura.invoke(method, payload), {
    method,
    payload,
  });
}

async function rejected(method, payload, expression) {
  const result = await page.evaluate(
    async ({ method, payload }) => {
      try {
        return { ok: true, value: await window.aura.invoke(method, payload) };
      } catch (error) {
        return { ok: false, message: error.message, code: error.code };
      }
    },
    { method, payload },
  );
  assert.equal(result.ok, false, `${method} unexpectedly succeeded`);
  if (expression) assert.match(result.message, expression);
  return result;
}

async function waitUntil(read, predicate, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  do {
    try {
      const value = await read();
      if (predicate(value)) return value;
    } catch(error) {
      if (!['EBUSY', 'ENOENT'].includes(error.code)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(message);
}

async function capture(name) {
  // Let the application's real 240 ms page transition finish before a still.
  await new Promise((resolve) => setTimeout(resolve, 350));
  const encoded = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  const bytes = Buffer.from(encoded, 'base64');
  assert(bytes.length > 10000, 'Application capture was unexpectedly empty');
  await fs.writeFile(path.join(output, name), bytes);
  await fs.mkdir(screenshots, { recursive: true });
  await fs.writeFile(path.join(screenshots, `${packaged ? 'packaged' : 'source'}-${name}`), bytes);
  return bytes;
}

async function startRecording() {
  const directory = await fs.mkdtemp(path.join(output, 'frames-'));
  let stopped = false;
  const startedAt = Date.now();
  const frames = [];
  const loop = (async () => {
    while (!stopped && Date.now() - startedAt < 90000) {
      const tick = Date.now();
      try {
        const encoded = await app.evaluate(async ({ BrowserWindow }) =>
          (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
        );
        const filename = `frame-${String(frames.length).padStart(5, '0')}.png`;
        await fs.writeFile(path.join(directory, filename), Buffer.from(encoded, 'base64'));
        frames.push({ filename, atMs: Date.now() - startedAt });
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, 200 - (Date.now() - tick))));
    }
  })();
  recording = {
    stop: async () => {
      stopped = true;
      await loop;
      const elapsedMs = Date.now() - startedAt;
      await fs.writeFile(
        path.join(output, 'recording.json'),
        JSON.stringify(
          {
            source: 'Actual Electron BrowserWindow capturePage',
            packaged,
            directory,
            requestedFramesPerSecond: 5,
            elapsedMs,
            frames,
          },
          null,
          2,
        ),
      );
      const ffmpeg = process.env.FFMPEG_BIN;
      if (ffmpeg && frames.length > 1) {
        const file = path.join(output, 'workflow.mp4');
        const result = spawnSync(
          ffmpeg,
          [
            '-y',
            '-framerate',
            '5',
            '-i',
            path.join(directory, 'frame-%05d.png'),
            '-vf',
            'scale=1500:-2',
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '25',
            '-pix_fmt',
            'yuv420p',
            '-r',
            '25',
            '-movflags',
            '+faststart',
            file,
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 60000 },
        );
        if (result.status !== 0)
          throw new Error(`Demo encoding failed: ${(result.stderr || '').slice(-1500)}`);
        const demo = path.join(repo, 'docs', 'demo');
        await fs.mkdir(demo, { recursive: true });
        await fs.copyFile(file, path.join(demo, `${packaged ? 'packaged' : 'source'}-workflow.mp4`));
      }
      return { frames: frames.length, elapsedMs, encoded: !!ffmpeg };
    },
  };
}

async function editFile(relative, content) {
  await page.waitForFunction(
    (relative) => document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.path === relative,
    relative,
  );
  await page.waitForFunction(
    (relative) => window.monaco?.editor.getModels().some((model) => model.uri.path.endsWith('/' + relative)),
    relative,
  );
  await page.evaluate(
    ({ relative, content }) => {
      const model = monaco.editor.getModels().find((item) => item.uri.path.endsWith('/' + relative));
      model.setValue(content);
    },
    { relative, content },
  );
  // Model changes redraw the tree/tab controls. A real user types and saves
  // from Monaco; do not send the shortcut to a detached tree button.
  await page.evaluate((relative) => {
    const activeEditor = monaco.editor.getEditors().find(
      (instance) => instance.getDomNode()?.closest('#editor-host') && instance.getModel()?.uri.path.endsWith('/' + relative),
    );
    if (!activeEditor) throw new Error('The selected file must be attached to the visible editor');
    activeEditor.focus();
  }, relative);
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'aurascript-public-acceptance-'));
  const workspace = path.join(fixture, 'workspace');
  const profile = path.join(fixture, 'profile');
  await fs.cp(path.join(repo, 'test-fixtures', 'workspace'), workspace, { recursive: true });
  git(workspace, ['init', '-q']);
  git(workspace, ['config', 'user.name', 'Public Acceptance Fixture']);
  git(workspace, ['config', 'user.email', 'fixture@example.invalid']);
  git(workspace, ['config', 'commit.gpgsign', 'false']);
  git(workspace, ['add', '--', '.']);
  git(workspace, ['commit', '-q', '-m', 'Public fixture baseline']);
  const environment = { ...process.env, AURA_HEADLESS: '1', AURA_TEST_DATA: profile };
  app = await electron.launch({
    executablePath: executable(),
    args: packaged ? [] : [repo],
    cwd: repo,
    env: environment,
    timeout: 40000,
  });
  page = await app.firstWindow();
  // Electron handles beforeunload with its own native Keep editing dialog.
  // Suppress Playwright's automatic dismissal, which races that native handler.
  page.on('dialog', () => {});
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('Renderer exception:', error.message);
  });
  await page.waitForFunction(
    () => !!window.aura && !!window.monaco && !document.querySelector('#app.loading'),
    null,
    { timeout: 40000 },
  );
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
  }, workspace);

  // A new absolute path cannot bypass the user-facing native folder selection.
  await rejected('workspace:open', { path: workspace }, /folder picker/i);
  await page.locator('#open-workspace').click();
  await page.locator('#workspace-status').filter({ hasText: 'Workspace connected' }).waitFor();
  checks.push('Explicit native folder selection and recent-workspace boundary');
  await rejected('file:read', { path: '../outside.txt' }, /escapes|relative/i);
  await rejected('file:create', { path: '.git/config', kind: 'file' }, /Git internal/i);
  checks.push('Filesystem traversal and Git internals are rejected through real IPC');

  await startRecording();
  // The remaining UI selectors follow the maintained shell, not a recreated test page.
  await page.locator('[data-action="tree-toggle"][data-path="src"]').click();
  await page.locator('[data-action="open-file"][data-path="src/main.py"]').first().click();
  await editFile('src/main.py', 'print("Persisted public acceptance")\n');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'src', 'main.py'), 'utf8'),
    (value) => value.includes('Persisted public acceptance'),
    'Visible save did not persist actual file content',
  );
  checks.push('Visible Monaco edit and keyboard save persist real disk bytes');
  await page.locator('#save-file').filter({ hasText: /^Saved$/ }).waitFor();

  const existing = await invoke('file:read', { path: 'src/main.py' });
  await rejected('file:create', { path: 'src/main.py', kind: 'file' }, /already exists/i);
  assert.equal(await fs.readFile(path.join(workspace, 'src', 'main.py'), 'utf8'), existing.content);
  // Keep an actual unsaved edit before the external write. A clean buffer is
  // allowed to refresh from disk; setting its old saved value can be a no-op.
  await editFile('src/main.py', 'print("Reviewed public acceptance revision")\n');
  await fs.writeFile(path.join(workspace, 'src', 'main.py'), 'print("External disk revision")\n');
  await rejected(
    'file:save',
    { path: 'src/main.py', content: 'Do not overwrite', revision: existing.revision },
    /changed on disk/i,
  );
  assert.equal(
    await fs.readFile(path.join(workspace, 'src', 'main.py'), 'utf8'),
    'print("External disk revision")\n',
  );
  // The visible editor also stops a stale save and requires a reviewed rebase.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await page.locator('#conflict').filter({ hasText: 'changed on disk' }).waitFor();
  await page.locator('[data-action="compare-disk"]').click();
  await page.getByRole('button', { name: 'Keep buffer on latest revision', exact: true }).click();
  await editFile('src/main.py', 'print("Reviewed public acceptance revision")\n');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'src', 'main.py'), 'utf8'),
    (value) => value.includes('Reviewed public acceptance revision'),
    'Reviewed editor rebase did not save the selected buffer',
  );
  checks.push('Exclusive file creation and stale-revision saves preserve existing data');

  await page.locator('[data-action="open-file"][data-path="settings.json"]').first().click();
  await editFile('settings.json', '{"enabled": }');
  await waitUntil(
    () => page.evaluate(() => monaco.editor.getModelMarkers({})),
    (markers) => markers.some((marker) => marker.resource.path.endsWith('/settings.json')),
    'Real Monaco JSON diagnostics did not appear',
  );
  await editFile('settings.json', '{"label":"Public acceptance fixture","enabled":true,"retries":3}\n');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'settings.json'), 'utf8'),
    (value) => value.includes('"retries":3'),
    'Second tab save did not persist',
  );
  const diagnostic = await invoke('diagnostics:check', { path: 'src/main.py', content: 'def broken(:\n' });
  assert.equal(diagnostic.provider, 'Python AST');
  assert(diagnostic.diagnostics.some((item) => item.severity === 'error' && item.line === 1));
  checks.push('Multiple real models, Monaco JSON diagnostics, and installed Python AST diagnostics');

  // Native close must honor unsaved changes without disposing the live services.
  await editFile('settings.json', '{"unsaved":true}\n');
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBoxSync = () => 0;
    BrowserWindow.getAllWindows()[0].close();
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await invoke('memory:list');
  await editFile('settings.json', '{"label":"Public acceptance fixture","enabled":true,"retries":3}\n');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  checks.push('Native Keep editing leaves the window and application services alive');

  const search = await invoke('workspace:search', { query: 'AURA_FIXTURE_TOKEN' });
  assert(search.matches.some((item) => item.path === 'notes.md'));
  await page.locator('#nav-search').click();
  await page.locator('#search-query').fill('AURA_FIXTURE_TOKEN');
  await page.locator('#search-replacement').fill('AURA_REPLACED_TOKEN');
  await fs.utimes(path.join(workspace, 'notes.md'), new Date(), new Date());
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(await page.locator('#search-query').inputValue(), 'AURA_FIXTURE_TOKEN');
  assert.equal(await page.locator('#search-replacement').inputValue(), 'AURA_REPLACED_TOKEN');
  await page.locator('#search-form').getByRole('button', { name: 'Find', exact: true }).click();
  await page.locator('#search-select-all').check();
  await page.locator('#replace-search').click();
  await page.getByRole('button', { name: /^Replace 1 match/ }).click();
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'notes.md'), 'utf8'),
    (value) => value.includes('AURA_REPLACED_TOKEN'),
    'Visible selected replacement did not persist actual file content',
  );
  await page.locator('#nav-explorer').click();
  const notes = await invoke('file:read', { path: 'notes.md' });
  const replace = {
    query: 'AURA_REPLACED_TOKEN',
    replacement: 'AURA_PREVIEWED_TOKEN',
    paths: ['notes.md'],
    revisions: { 'notes.md': notes.revision },
  };
  const preview = await invoke('workspace:replace', replace);
  assert.equal(preview.preview, true);
  assert(preview.changes[0].after.includes('AURA_PREVIEWED_TOKEN'));
  assert((await fs.readFile(path.join(workspace, 'notes.md'), 'utf8')).includes('AURA_REPLACED_TOKEN'));
  await invoke('workspace:replace', { ...replace, confirmed: true });
  assert((await fs.readFile(path.join(workspace, 'notes.md'), 'utf8')).includes('AURA_PREVIEWED_TOKEN'));
  checks.push('Bounded real workspace search and revision-checked preview/apply replacement');

  await rejected('process:start', { command: 'git --version' }, /confirm/i);
  await page.locator('#show-terminal').click();
  await page.locator('#terminal-command').fill('git --version');
  await page.locator('#terminal-run').click();
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  const completed = await waitUntil(
    () => invoke('process:list'),
    (rows) => rows.some((row) => row.command === 'git --version' && row.status === 'completed'),
    'Terminal did not report its actual exit',
  );
  const terminalRun = completed.find((row) => row.command === 'git --version');
  assert.match(completed.find((row) => row.id === terminalRun.id).output, /git version/i);
  await page.waitForFunction(() => document.querySelector('#terminal-stop').disabled);
  await page.locator('#terminal-command').fill('node scripts/long-process.cjs');
  await page.locator('#terminal-run').click();
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  const running = await waitUntil(
    () => invoke('process:list'),
    (rows) => rows.some((row) => row.command === 'node scripts/long-process.cjs' && row.status === 'running'),
    'Visible terminal command did not launch',
  );
  const long = running.find((row) => row.command === 'node scripts/long-process.cjs');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.locator('#terminal-stop').click();
  await waitUntil(
    () => invoke('process:list'),
    (rows) => rows.some((row) => row.id === long.id && row.status === 'cancelled'),
    'Terminal cancellation did not produce a cancelled exit',
  );
  await page.waitForFunction(() => document.querySelector('#terminal-stop').disabled);
  checks.push('Real terminal output, explicit confirmation, exit state, and process-tree cancellation');

  const status = await invoke('git:status');
  assert(status.files.some((item) => item.path === 'src/main.py'));
  await page.locator('#nav-git').click();
  for (const relative of ['src/main.py', 'settings.json', 'notes.md']) {
    await page.locator(`.git-select[data-path="${relative}"]`).check();
  }
  await fs.utimes(path.join(workspace, 'notes.md'), new Date(), new Date());
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(
    await page.locator('.git-select:checked').count(),
    3,
    'Watcher must retain explicit Git selections',
  );
  await page.locator('#git-stage-selected').click();
  await waitUntil(
    () => invoke('git:status'),
    (value) => value.files.every((item) => item.staged),
    'Visible Git staging did not update actual index',
  );
  const staged = await invoke('git:diff', { staged: true });
  assert(staged.diff.includes('Reviewed public acceptance revision'));
  await page.locator('#git-commit-message').fill('Real AuraScript acceptance checkpoint');
  await fs.utimes(path.join(workspace, 'notes.md'), new Date(), new Date());
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    await page.locator('#git-commit-message').inputValue(),
    'Real AuraScript acceptance checkpoint',
  );
  await page.locator('#git-commit').click();
  await page.getByRole('button', { name: 'Create commit', exact: true }).click();
  const commitHistory = await waitUntil(
    () => invoke('git:log'),
    (value) => value.commits.some((item) => item.message === 'Real AuraScript acceptance checkpoint'),
    'Visible checkpoint did not create an actual Git commit',
  );
  const commit = commitHistory.commits.find(
    (item) => item.message === 'Real AuraScript acceptance checkpoint',
  );
  assert.match(commit.hash, /^[a-f0-9]{40}$/);
  assert.equal(git(workspace, ['log', '-1', '--format=%s']).trim(), 'Real AuraScript acceptance checkpoint');
  const history = await invoke('git:log');
  assert(history.commits.some((item) => item.hash === commit.hash));
  assert((await invoke('git:diff', { commit: commit.hash })).diff.includes('Reviewed public acceptance revision'));
  checks.push('Actual Git staging, commit, log, and historical diff');

  await page.locator('#nav-explorer').click();
  await page.locator('#new-file').click();
  await page.locator('#field-path').fill('scratch.txt');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await editFile('scratch.txt', 'Recoverable public fixture\n');
  await page.keyboard.press('Control+s');
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'scratch.txt'), 'utf8'),
    (text) => text.startsWith('Recoverable'),
    'Scratch save failed',
  );
  await page.locator('[data-action="file-menu"][data-path="scratch.txt"]').click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.locator('#field-path').fill('renamed.txt');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.locator('[data-action="file-menu"][data-path="renamed.txt"]').waitFor();
  await assert.rejects(fs.stat(path.join(workspace, 'scratch.txt')), (error) => error.code === 'ENOENT');
  assert.equal(
    await fs.readFile(path.join(workspace, 'renamed.txt'), 'utf8'),
    'Recoverable public fixture\n',
  );
  await page.locator('[data-action="file-menu"][data-path="renamed.txt"]').click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-action="file-menu"][data-path="renamed.txt"]'),
  );
  await assert.rejects(fs.stat(path.join(workspace, 'renamed.txt')), (error) => error.code === 'ENOENT');
  await page.locator('#open-trash').click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await waitUntil(
    () => fs.readFile(path.join(workspace, 'renamed.txt'), 'utf8'),
    (text) => text.startsWith('Recoverable'),
    'Trash restore lost file bytes',
  );
  checks.push('Visible create, rename, recoverable trash, and restore preserve actual file bytes');

  await page.locator('#nav-memory').click();
  await page.locator('#new-memory').click();
  await page.locator('#field-title').fill('Public acceptance memory');
  await page.locator('#field-content').fill('Prefer explicit local acceptance evidence.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  const memoryRows = await waitUntil(
    () => invoke('memory:list'),
    (rows) => rows.some((item) => item.title === 'Public acceptance memory'),
    'Visible memory creation did not persist',
  );
  const memory = memoryRows.find((item) => item.title === 'Public acceptance memory');
  await page.locator(`[data-action="edit-memory"][data-id="${memory.id}"]`).click();
  await page.locator('#field-content').fill('Updated public acceptance memory survives restart.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await waitUntil(
    () => invoke('memory:list'),
    (rows) => rows.some((item) => item.id === memory.id && item.content.startsWith('Updated')),
    'Visible memory edit did not persist',
  );
  assert(
    (await invoke('memory:list')).some((item) => item.id === memory.id && item.content.startsWith('Updated')),
  );
  const documentPath = path.join(fixture, 'public-fixture-notes.md');
  await fs.writeFile(
    documentPath,
    'Fixture retrieval source AURA_DOCUMENT_TOKEN. It is labeled public acceptance data.',
  );
  await page.locator('#nav-knowledge').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-document').click();
  await (await chooser).setFiles(documentPath);
  const documentRows = await waitUntil(
    () => invoke('documents:list'),
    (rows) => rows.some((item) => item.name === 'public-fixture-notes.md'),
    'Visible selected-document import did not persist',
  );
  const document = documentRows.find((item) => item.name === 'public-fixture-notes.md');
  await page.locator('#documents-query').fill('AURA_DOCUMENT_TOKEN');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await page.locator('#document-results').filter({ hasText: 'AURA_DOCUMENT_TOKEN' }).waitFor();
  const retrieved = await invoke('documents:search', { query: 'AURA_DOCUMENT_TOKEN' });
  assert.equal(retrieved.method, 'local lexical retrieval');
  assert(
    retrieved.results.some((item) => item.id === document.id && item.excerpt.includes('AURA_DOCUMENT_TOKEN')),
  );
  checks.push('Actual editable memory and source-inspectable lexical document retrieval');

  await page.locator('#nav-memory').click();
  await page.locator('#new-reminder').click();
  await page.locator('#field-title').fill('Public acceptance reminder');
  await page.locator('#field-text').fill('Native notifications are a separate hardware gate.');
  await page.locator('#field-localTime').fill(new Date(Date.now() + 120000).toISOString().slice(0, 16));
  await page.locator('#field-timezone').fill('UTC');
  await page.getByRole('button', { name: 'Schedule reminder', exact: true }).click();
  const reminderRows = await waitUntil(
    () => invoke('reminders:list'),
    (rows) => rows.some((item) => item.title === 'Public acceptance reminder'),
    'Visible timezone-aware reminder did not persist',
  );
  const reminder = reminderRows.find((item) => item.title === 'Public acceptance reminder');
  await invoke('reminders:save', {
    ...reminder,
    dueAt: new Date(Date.now() + 2200).toISOString(),
    timezone: 'Asia/Kolkata',
  });
  await waitUntil(
    () => invoke('reminders:list'),
    (rows) => rows.some((row) => row.id === reminder.id && row.status === 'due'),
    'Reminder did not reach its real due state',
    8000,
  );
  await invoke('reminders:complete', { id: reminder.id });
  assert(
    (await invoke('reminders:list')).some((row) => row.id === reminder.id && row.status === 'completed'),
  );
  // A user can acknowledge the persistent due notification independently.
  const dueToast = page.locator('#notifications .toast').filter({ hasText: 'Public acceptance reminder' });
  if (await dueToast.count()) await dueToast.getByRole('button', { name: 'Dismiss notification' }).click();
  await rejected(
    'reminders:save',
    {
      title: 'Invalid fixture',
      dueAt: new Date(Date.now() + 60000).toISOString(),
      timezone: 'Invalid/Fixture',
    },
    /timezone/i,
  );
  await page.locator('#nav-workflows').click();
  await page.locator('#new-workflow').click();
  await page.locator('#field-name').fill('Public Git version workflow');
  await page.locator('#field-description').fill('An explicit harmless test command.');
  await page.locator('#field-commands').fill('git --version');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  const workflowRows = await waitUntil(
    () => invoke('workflows:list'),
    (rows) => rows.some((item) => item.name === 'Public Git version workflow'),
    'Visible workflow creation did not persist',
  );
  const workflow = workflowRows.find((item) => item.name === 'Public Git version workflow');
  await rejected('workflows:run', { id: workflow.id }, /confirm/i);
  const previousProcesses = new Set((await invoke('process:list')).map((row) => row.id));
  await page.locator(`[data-action="run-workflow"][data-id="${workflow.id}"]`).click();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  const workflowProcesses = await waitUntil(
    () => invoke('process:list'),
    (rows) =>
      rows.some(
        (row) =>
          !previousProcesses.has(row.id) && row.command === 'git --version' && row.status === 'completed',
      ),
    'Saved workflow did not execute its actual command',
  );
  const workflowRun = workflowProcesses.find(
    (row) => !previousProcesses.has(row.id) && row.command === 'git --version',
  );
  assert(
    (await invoke('receipts:list')).some(
      (row) => row.action === 'workflow:run' && row.processId === workflowRun.id,
    ),
  );
  checks.push('Timezone-aware due and completed reminders plus confirmed real workflow execution receipts');

  const patchFile = await invoke('file:read', { path: 'notes.md' });
  const patch = await invoke('patch:preview', {
    proposal: {
      path: 'notes.md',
      before: 'AURA_PREVIEWED_TOKEN',
      after: 'AURA_PATCHED_TOKEN',
      reason: 'Labeled fixture patch, never model inference.',
    },
  });
  assert(patch.id);
  assert.equal(await fs.readFile(path.join(workspace, 'notes.md'), 'utf8'), patchFile.content);
  await rejected('patch:apply', { id: patch.id }, /confirm/i);
  await invoke('patch:apply', { id: patch.id, confirmed: true });
  assert((await fs.readFile(path.join(workspace, 'notes.md'), 'utf8')).includes('AURA_PATCHED_TOKEN'));
  const stalePatch = await invoke('patch:preview', {
    proposal: {
      path: 'notes.md',
      before: 'AURA_PATCHED_TOKEN',
      after: 'STALE_PATCH',
      reason: 'Conflict fixture',
    },
  });
  await fs.appendFile(path.join(workspace, 'notes.md'), '\nExternal revision prevents stale patch.\n');
  await rejected('patch:apply', { id: stalePatch.id, confirmed: true }, /changed|revision|stale/i);
  assert(!(await fs.readFile(path.join(workspace, 'notes.md'), 'utf8')).includes('STALE_PATCH'));
  checks.push('Reviewed real patch preview/apply and stale-patch rejection');

  await page.locator('#nav-settings').click();
  await page.locator('#provider').selectOption('ollama');
  await page.locator('#field-model').fill('unavailable-fixture-model');
  await page.locator('#field-endpoint').fill('http://127.0.0.1:9');
  await page.locator('#save-provider').click();
  await waitUntil(
    () => invoke('settings:get'),
    (value) => value.endpoint === 'http://127.0.0.1:9' && value.model === 'unavailable-fixture-model',
    'Visible provider configuration did not persist',
  );
  await page.locator('#chat-input').fill('Public acceptance: demonstrate an unavailable provider error.');
  await page.locator('#send-message').click();
  const failedSessions = await waitUntil(
    () => invoke('conversations:list'),
    (rows) => rows.length > 0,
    'Assistant did not persist its selected unavailable-provider session',
  );
  const failed = await waitUntil(
    () => invoke('conversations:read', { id: failedSessions[0].id }),
    (row) => row.messages.some((message) => message.status === 'failed'),
    'Unavailable provider masqueraded as a successful response',
  );
  assert(failed.messages.some((message) => message.role === 'assistant' && message.status === 'failed'));
  await invoke('conversations:rename', { id: failed.id, title: 'Public unavailable-provider acceptance' });
  assert(
    (await invoke('conversations:search', { query: 'unavailable-provider acceptance' })).some(
      (row) => row.id === failed.id,
    ),
  );
  checks.push('Actual unreachable-provider failure and persistent searchable/renamed conversation history');

  const exported = await invoke('export:get');
  assert.equal(exported.format, 'aurascript');
  assert.equal(exported.version, 1);
  assert(!Object.hasOwn(exported.data, 'secrets'));
  assert(!Object.hasOwn(exported.data, 'workspaces'));
  const imported = await invoke('import:preview', { data: exported });
  assert.equal(imported.counts.memories, 1);
  await rejected('import:apply', { id: imported.id }, /confirm/i);
  await invoke('import:apply', { id: imported.id, confirmed: true });
  assert.equal((await invoke('memory:list')).length, 2);
  assert(
    (await invoke('reminders:list')).some(
      (row) => row.title === reminder.title && row.status === 'cancelled',
    ),
  );
  await rejected('import:preview', { data: { ...exported, version: 99 } }, /version 1/i);
  checks.push(
    'Versioned export, reviewed confirmed import, no secrets/workspace paths, and safe imported reminders',
  );

  await page.locator('#nav-memory').click();
  await page
    .getByRole('heading', { name: /Memory/ })
    .first()
    .waitFor();
  await capture('memory-and-reminders.png');
  await page.locator('#nav-knowledge').click();
  await capture('knowledge.png');
  await page.locator('#nav-workflows').click();
  await capture('workflows.png');
  await page.locator('#command-palette').click();
  await page.locator('#palette').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  checks.push('Visible assistant data pages and keyboard command palette');

  const dark = await invoke('settings:update', { theme: 'dark' });
  assert.equal((dark.settings || dark).theme, 'dark');
  await page.reload();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark' && !document.querySelector('#app.loading'),
  );
  await page.locator('#nav-explorer').click();
  assert(
    await page.evaluate(async () => (await document.fonts.load('500 16px "Manrope"')).length > 0),
    'The application must load its bundled Manrope font offline',
  );
  const darkCapture = await capture('desktop-dark.png');
  const light = await invoke('settings:update', { theme: 'light' });
  assert.equal((light.settings || light).theme, 'light');
  await page.reload();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'light' && !document.querySelector('#app.loading'),
  );
  await page.locator('#nav-explorer').click();
  const lightCapture = await capture('desktop-light.png');
  assert.notDeepEqual(lightCapture, darkCapture);
  assert.equal((await invoke('memory:list')).length, 2);
  assert((await invoke('documents:list')).some((item) => item.name === document.name));
  assert((await invoke('workflows:list')).some((item) => item.id === workflow.id));
  checks.push('Persistent dark/light settings and distinct actual native rendering');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(900, 700);
  });
  await page.waitForFunction(() => innerWidth <= 1000);
  await page.locator('[data-action="toggle-assistant"]').click();
  await page.locator('#assistant').waitFor({ state: 'visible' });
  await capture('compact-assistant.png');
  await page.locator('[data-action="toggle-assistant"]').click();
  await page.locator('#assistant').waitFor({ state: 'hidden' });
  await page.locator('#nav-settings').click();
  await capture('compact-preferences.png');
  await invoke('settings:update', {
    reducedMotion: true,
    reducedTransparency: true,
    highContrast: true,
    fontSize: 18,
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.reduceMotion === 'true' &&
      document.documentElement.dataset.reduceTransparency === 'true' &&
      document.documentElement.dataset.highContrast === 'true',
  );
  await capture('accessible-preferences.png');
  await invoke('settings:update', {
    reducedMotion: false,
    reducedTransparency: false,
    highContrast: false,
    fontSize: 14,
  });
  await page.locator('#nav-explorer').click();
  checks.push(
    'Compact assistant/preferences layout plus persisted reduced-motion, reduced-transparency, and high-contrast settings',
  );
  const recordingResult = await recording.stop();
  recording = null;
  assert.deepEqual(errors, []);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await app.close();
  app = await electron.launch({
    executablePath: executable(),
    args: packaged ? [] : [repo],
    cwd: repo,
    env: environment,
    timeout: 40000,
  });
  page = await app.firstWindow();
  page.on('dialog', () => {});
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => !document.querySelector('#app.loading') && !!window.aura, null, {
    timeout: 30000,
  });
  assert.equal((await invoke('bootstrap')).currentWorkspace, workspace);
  assert.equal((await invoke('settings:get')).theme, 'light');
  assert.equal((await invoke('memory:list')).length, 2);
  assert((await invoke('documents:list')).some((item) => item.name === document.name));
  assert(
    (await invoke('reminders:list')).some((item) => item.id === reminder.id && item.status === 'completed'),
  );
  assert((await invoke('workflows:list')).some((item) => item.id === workflow.id));
  assert(
    (await invoke('conversations:list')).some(
      (item) => item.title === 'Public unavailable-provider acceptance',
    ),
  );
  await page.waitForFunction(() =>
    monaco.editor.getModels().some((model) => model.uri.path.endsWith('/settings.json')),
  );
  checks.push(
    'Full application relaunch restores workspace, tabs, settings, and actual persisted assistant data',
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    date: new Date().toISOString(),
    platform: process.platform,
    node: process.versions.node,
    packaged,
    executable: executable(),
    workspace,
    profile,
    checks,
    rendererExceptions: errors,
    recording: recordingResult,
  };
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(result, null, 2));
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  app = null;
  console.log(`AuraScript ${packaged ? 'packaged' : 'source'} acceptance passed (${checks.length} groups).`);
}

main().catch(async (error) => {
  console.error(error);
  if (recording) {
    try {
      await recording.stop();
    } catch {}
  }
  try {
    await fs.mkdir(output, { recursive: true });
    if (app && page) {
      await capture('failure.png');
      console.error('Visible text:', (await page.locator('body').innerText()).slice(-5000));
    }
    await fs.writeFile(
      path.join(output, 'acceptance.json'),
      JSON.stringify(
        {
          passed: false,
          date: new Date().toISOString(),
          packaged,
          checks,
          rendererExceptions: errors,
          error: error.message,
        },
        null,
        2,
      ),
    );
  } catch {}
  if (app) {
    try {
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      });
      await app.close();
    } catch {}
  }
  process.exitCode = 1;
});
