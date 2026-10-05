import { VoiceInput, stopSpeech, speak, voiceAvailability } from './voice.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const attr = esc;
const base = (path) =>
  String(path || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || path;
const errorText = (e) => e?.message || String(e);
const array = (result) => (Array.isArray(result) ? result : result?.items || []);
const invoke = (method, payload = {}) => window.aura.invoke(method, payload);
const paths = {
  folder: 'M3 7h6l2 2h10v11H3z M3 7V4h6l2 3',
  file: 'M6 3h8l4 4v14H6z M14 3v5h4',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
  search: 'M21 21l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  git: 'M7 3v11a4 4 0 0 0 4 4h6M17 6v8 M10 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  chat: 'M3 4h18v13H8l-5 4z M7 8h10M7 12h6',
  book: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16',
  memory: 'M8 3h8v4h4v10h-4v4H8v-4H4V7h4z M9 9h6v6H9z',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-8z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  save: 'M4 3h13l3 3v15H4z M8 3v6h8V3M8 21v-8h8v8',
  chevron: 'm9 5 7 7-7 7',
  down: 'm5 9 7 7 7-7',
  refresh: 'M20 7a9 9 0 1 0 1 8M20 2v5h-5',
  trash: 'M4 6h16M9 6V3h6v3M6 6v15h12V6M10 10v7M14 10v7',
  edit: 'm4 16 12-12 4 4-12 12-5 1z M14 6l4 4',
  play: 'm8 4 12 8-12 8z',
  stop: 'M6 6h12v12H6z',
  terminal: 'm4 5 6 6-6 6M12 18h8',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2m-1 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10',
  check: 'm4 12 5 5L20 6',
  warning: 'm12 3 10 18H2z M12 9v5M12 17v1',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',
  download: 'M12 3v13m-5-5 5 5 5-5M4 14v7h16v-7',
  mic: 'M9 3h6v11H9z M5 11v3a7 7 0 0 0 14 0v-3M12 21v-3M8 21h8',
  image: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M17 7h.01',
  send: 'm3 3 19 9-19 9 4-9z M7 12h15',
  history: 'M3 4v5h5M3 9a9 9 0 1 1-1 6M12 7v5l4 2',
  shield: 'm12 2 9 4v7l-3 5-6 4-6-4-3-5V6z M8 12l3 3 5-6',
  copy: 'M8 8h13v13H8z M3 16V3h13',
  external: 'M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
const button = (action, label, { id = '', className = '', iconName = '', data = '', title = '' } = {}) =>
  `<button type="button" ${id ? `id="${id}"` : ''} class="${className}" data-action="${action}" ${data} ${title ? `title="${attr(title)}" aria-label="${attr(title)}"` : ''}>${iconName ? icon(iconName) : ''}${label}</button>`;
const field = (name, label, type = 'text', value = '', hint = '', extra = '') =>
  `<div class="field"><label for="field-${name}">${label}</label>${type === 'textarea' ? `<textarea id="field-${name}" name="${name}" ${extra}>${esc(value)}</textarea>` : `<input id="field-${name}" name="${name}" type="${type}" value="${attr(value)}" ${extra}>`}${hint ? `<small>${hint}</small>` : ''}</div>`;
const date = (value) => (value ? new Date(value).toLocaleString() : '');
const state = {
  settings: {
    theme: 'system',
    fontSize: 14,
    minimap: true,
    wordWrap: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  workspace: null,
  workspaces: [],
  tree: new Map(),
  expanded: new Set(),
  files: new Map(),
  tabs: [],
  activeFile: null,
  view: 'editor',
  sidebar: 'explorer',
  bottom: 'terminal',
  bottomOpen: true,
  processes: new Map(),
  activeProcess: null,
  diagnostics: [],
  git: null,
  gitSelected: new Set(),
  messages: [],
  conversationId: null,
  turnId: null,
  pendingAI: null,
  conversations: [],
  documents: [],
  memories: [],
  reminders: [],
  workflows: [],
  receipts: [],
  usage: {},
  capabilities: {},
  search: { query: '', replacement: '', caseSensitive: false, matches: [], selected: new Set() },
  commitMessage: '',
  context: null,
};
let editor,
  monaco,
  unsubscribe,
  persistTimer,
  diagnosticsTimer,
  autosaveTimer,
  editorListener,
  closing = false;
const modelListeners = new Map();
let paletteCommands = [],
  paletteIndex = 0;

function toast(message, type = 'good', duration = 5500) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.dataset.persistent = String(duration === 0);
  node.innerHTML = `${icon(type === 'error' ? 'warning' : type === 'warning' ? 'warning' : 'check')}<span class="grow" title="${attr(message)}">${esc(message)}</span><button type="button" aria-label="Dismiss notification">×</button>`;
  node.querySelector('button').onclick = () => node.remove();
  const stack = $('#notifications');
  stack.append(node);
  while (stack.children.length > 4) {
    const oldestTransient = [...stack.children].find((item) => item.dataset.persistent !== 'true');
    (oldestTransient || stack.firstElementChild).remove();
  }
  if (duration) setTimeout(() => node.remove(), duration);
}
function applySettings() {
  const s = state.settings;
  const chosen =
    s.theme === 'system' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : s.theme;
  document.documentElement.dataset.theme = chosen;
  document.documentElement.dataset.reduceMotion = Boolean(s.reducedMotion);
  document.documentElement.dataset.reduceTransparency = Boolean(s.reducedTransparency);
  document.documentElement.dataset.highContrast = Boolean(s.highContrast);
  document.documentElement.style.setProperty('--scale', s.uiScale || 1);
  if (monaco) {
    monaco.editor.setTheme(chosen === 'light' ? 'aura-light' : 'aura-dark');
    editor?.updateOptions({
      fontSize: Number(s.fontSize) || 14,
      lineHeight: Math.round((Number(s.fontSize) || 14) * 1.65),
      fontFamily: s.fontFamily || 'Cascadia Code, Consolas, monospace',
      tabSize: Number(s.tabSize) || 2,
      wordWrap: s.wordWrap ? 'on' : 'off',
      minimap: { enabled: s.minimap !== false },
      accessibilitySupport: 'auto',
      smoothScrolling: !s.reducedMotion,
      cursorSmoothCaretAnimation: s.reducedMotion ? 'off' : 'on',
    });
  }
  const toggle = $('#theme-toggle');
  if (toggle) {
    toggle.innerHTML = icon(chosen === 'light' ? 'moon' : 'sun');
    toggle.title = `Switch to ${chosen === 'light' ? 'dark' : 'light'} theme`;
    toggle.setAttribute('aria-label', toggle.title);
  }
}
async function updateSettings(patch) {
  const result = await invoke('settings:update', patch);
  state.settings = { ...state.settings, ...patch, ...(result?.settings || result || {}) };
  applySettings();
  persistSession();
}
function shell() {
  const nav = [
    ['explorer', 'folder', 'Files'],
    ['search', 'search', 'Find in workspace'],
    ['git', 'git', 'Source control'],
    ['history', 'history', 'Conversations'],
    ['knowledge', 'book', 'Knowledge'],
    ['memory', 'memory', 'Memory & reminders'],
    ['workflows', 'bolt', 'Workflows'],
  ];
  $('#app').className = 'app';
  $('#app').setAttribute('aria-busy', 'false');
  $('#app').innerHTML =
    `<header class="topbar"><div class="brand"><img src="assets/aura.svg" alt=""/><div class="brand-name">Aura<span>Script</span></div></div>${button('open-workspace', `<span class="workspace-label">${esc(base(state.workspace) || 'Open a workspace')}</span>${icon('down')}`, { id: 'open-workspace', className: 'workspace-chip', iconName: 'folder' })}<span class="platform-state">Private by default</span>${button('palette', '<span>Search commands</span><kbd>Ctrl K</kbd>', { id: 'command-palette', className: 'palette-trigger', iconName: 'search', title: 'Open command palette' })}${button('toggle-assistant', '', { className: 'icon-button ghost', iconName: 'chat', title: 'Toggle assistant' })}${button('theme', '', { id: 'theme-toggle', className: 'icon-button ghost', iconName: 'sun', title: 'Switch theme' })}</header><nav class="rail" aria-label="Workspace navigation">${nav.map(([id, i, label]) => button(`nav:${id}`, '', { id: `nav-${id}`, className: `icon-button ${id === 'explorer' ? 'active' : ''}`, iconName: i, title: label })).join('')}<div class="spacer"></div>${button('nav:settings', '', { id: 'nav-settings', className: 'icon-button', iconName: 'settings', title: 'Preferences' })}</nav><aside class="sidebar" id="sidebar" aria-label="Files sidebar"></aside><main class="main" id="main" aria-label="Workspace"><div id="editor-layout" class="stack" style="height:100%;gap:0"><div class="tabs" id="tabs" role="tablist" aria-label="Open files"></div><div class="editor-toolbar" id="editor-toolbar"></div><div id="conflict" class="hidden"></div><div class="editor-wrap" id="editor-wrap"><div id="editor-host" class="editor-host"></div><div id="editor-empty" class="editor-empty"></div></div><section class="bottom-panel" id="bottom-panel" aria-label="Terminal and diagnostics"></section></div><div id="page" class="page hidden"></div></main><aside class="assistant" id="assistant" aria-label="Coding assistant"><div class="pane-head"><div class="assistant-brand grow"><span class="assistant-orb"></span><div><strong>Aura assistant</strong><div class="assistant-subtitle">Considered. Contextual. Yours.</div></div></div>${button('new-conversation', '', { id: 'new-conversation', className: 'icon-button ghost', iconName: 'plus', title: 'New conversation' })}</div><div class="assistant-tools"><select id="assistant-mode" aria-label="Assistant mode"><option value="chat">Conversation</option><option value="review">Code review</option><option value="patch">Propose a patch</option></select>${button('nav:settings', '', { className: 'icon-button ghost', iconName: 'settings', title: 'Configure provider' })}</div><div class="assistant-content" id="assistant-content" aria-live="polite"></div><form class="chat-composer" id="chat-form"><label class="sr-only" for="chat-input">Ask the assistant</label><textarea id="chat-input" placeholder="Ask a question or review your code…" aria-label="Ask the assistant"></textarea><div class="context-chip" id="context-chip"></div><div class="composer-actions">${button('attach-context', '', { id: 'attach-context', className: 'icon-button ghost', iconName: 'code', title: 'Attach selected code or current file' })}${button('voice', '', { id: 'voice-input', className: 'icon-button ghost', iconName: 'mic', title: 'Record speech' })}${button('vision', '', { id: 'vision-input', className: 'icon-button ghost', iconName: 'image', title: 'Analyze a selected image' })}<span class="voice-meter hidden" id="voice-meter"><span></span></span><span id="voice-state" class="voice-state"></span><button type="submit" id="send-message" class="primary">Send ${icon('send')}</button>${button('cancel-ai', 'Stop', { id: 'stop-generation', className: 'hidden', iconName: 'stop' })}</div></form></aside><footer class="statusbar"><span class="status-dot"></span><span id="workspace-status">${esc(state.workspace ? 'Workspace connected' : 'No workspace open')}</span><span class="wide-status" id="git-status-label"></span><button data-action="bottom:diagnostics" id="diagnostics-count">0 problems</button><span class="right" id="cursor-status"></span><span id="language-status"></span><button data-action="bottom:terminal">${icon('terminal')} Terminal</button></footer>`;
  renderSidebar();
  renderTabs();
  renderAssistant();
  renderBottom();
  applySettings();
}
function setView(view) {
  state.view = view;
  $('#editor-layout').classList.toggle('hidden', view !== 'editor');
  $('#page').classList.toggle('hidden', view === 'editor');
  $$('.rail button').forEach((b) =>
    b.classList.toggle('active', b.dataset.action === `nav:${view === 'editor' ? state.sidebar : view}`),
  );
  if (view === 'editor') {
    editor?.layout();
  } else renderPage();
  persistSession();
}
function nav(view) {
  if (innerWidth <= 1000) document.body.classList.remove('assistant-mobile-open');
  if (['explorer', 'search', 'git'].includes(view)) {
    state.sidebar = view;
    setView('editor');
    document.body.classList.remove('sidebar-hidden');
    if (innerWidth <= 720) document.body.classList.toggle('sidebar-mobile-open');
    renderSidebar();
    if (view === 'git') refreshGit();
  } else {
    setView(view);
    document.body.classList.remove('sidebar-mobile-open');
  }
}
function sessionKey() {
  return `aurascript.workspace.v1:${state.workspace || 'none'}`;
}
function sessionSnapshot() {
  return JSON.stringify({
    tabs: [...state.tabs],
    activeFile: state.activeFile,
    view: state.view,
    sidebar: state.sidebar,
    bottomOpen: state.bottomOpen,
    buffers: state.tabs
      .map((path) => {
        const f = state.files.get(path);
        return f
          ? {
              path,
              ...(f.dirty ? { content: f.model?.getValue() ?? f.content } : {}),
              revision: f.revision,
              dirty: f.dirty,
            }
          : null;
      })
      .filter(Boolean),
  });
}
function flushSession() {
  clearTimeout(persistTimer);
  try {
    localStorage.setItem(sessionKey(), sessionSnapshot());
  } catch {
    toast('Session buffers could not be stored. Save your changed files.', 'warning');
  }
}
function persistSession() {
  clearTimeout(persistTimer);
  const key = sessionKey(),
    snapshot = sessionSnapshot();
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(key, snapshot);
    } catch {
      toast('Session buffers could not be stored. Save your changed files.', 'warning');
    }
  }, 180);
}
async function restoreSession() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(sessionKey()) || 'null');
  } catch {
    return;
  }
  if (!saved) return;
  for (const buffer of saved.buffers || []) {
    try {
      const disk = await invoke('file:read', { path: buffer.path });
      addFile(
        {
          ...disk,
          ...(buffer.dirty
            ? {
                content: buffer.content,
                revision: buffer.revision,
                dirty: true,
                external: disk.revision !== buffer.revision,
              }
            : {}),
        },
        false,
      );
    } catch (e) {
      toast(`Could not restore ${base(buffer.path)}: ${errorText(e)}`, 'warning');
    }
  }
  state.activeFile = state.files.has(saved.activeFile) ? saved.activeFile : state.tabs[0] || null;
  state.sidebar = ['explorer', 'search', 'git'].includes(saved.sidebar) ? saved.sidebar : 'explorer';
  state.bottomOpen = saved.bottomOpen !== false;
  renderTabs();
  activateFile(state.activeFile);
  renderBottom();
  if (['history', 'knowledge', 'memory', 'workflows', 'settings'].includes(saved.view)) setView(saved.view);
}
async function openWorkspace(path) {
  if ([...state.files.values()].some((f) => f.dirty)) {
    if (
      !(await confirm(
        'Switch workspace?',
        'Unsaved buffers are retained locally for this workspace. Save any work you want written to disk before switching.',
        'Switch workspace',
      ))
    )
      return;
  }
  flushSession();
  clearTimeout(autosaveTimer);
  clearTimeout(diagnosticsTimer);
  const result = await invoke('workspace:open', path ? { path } : {});
  const chosen = result?.path || result?.root || result?.currentWorkspace || result;
  if (!chosen || typeof chosen !== 'string') return;
  voice?.stop();
  clearContext();
  state.workspace = chosen;
  state.tree.clear();
  state.expanded.clear();
  for (const f of state.files.values()) {
    f.model?.dispose();
  }
  for (const l of modelListeners.values()) l.dispose();
  modelListeners.clear();
  state.files.clear();
  state.tabs = [];
  state.activeFile = null;
  state.git = null;
  state.gitSelected.clear();
  state.commitMessage = '';
  state.search = { query: '', replacement: '', caseSensitive: false, matches: [], selected: new Set() };
  state.workspaces = array(await invoke('workspace:recent'));
  state.view = 'editor';
  shell();
  defineEditor();
  await refreshTree();
  await restoreSession();
  toast(`Opened ${base(chosen)}`);
}
async function refreshTree(path = '') {
  if (!state.workspace) return;
  const result = await invoke('workspace:list', { path });
  state.tree.set(path, result.entries || []);
  if (state.sidebar === 'explorer') renderSidebar();
}
function treeRows(path = '', depth = 0) {
  return (state.tree.get(path) || [])
    .map((entry) => {
      const isDir = entry.kind === 'directory' || entry.kind === 'folder' || entry.isDir;
      const open = state.expanded.has(entry.path);
      return `<div class="tree-item ${state.activeFile === entry.path ? 'selected' : ''}" data-testid="tree-entry" data-path="${attr(entry.path)}"><button data-action="${isDir ? 'tree-toggle' : 'open-file'}" data-path="${attr(entry.path)}" title="${attr(entry.path)}">${icon(isDir ? (open ? 'down' : 'chevron') : 'file')} ${esc(entry.name)}</button><button class="tree-menu" data-action="file-menu" data-path="${attr(entry.path)}" data-kind="${isDir ? 'directory' : 'file'}" aria-label="Actions for ${attr(entry.name)}">···</button></div>${isDir && open ? `<div class="tree-children">${treeRows(entry.path, depth + 1)}</div>` : ''}`;
    })
    .join('');
}
function renderSidebar() {
  const focused = document.activeElement;
  const focusId = $('#sidebar')?.contains(focused) ? focused.id : null;
  const selection =
    focusId && typeof focused.selectionStart === 'number'
      ? [focused.selectionStart, focused.selectionEnd]
      : null;
  if ($('#git-commit-message')) state.commitMessage = $('#git-commit-message').value;
  const side = $('#sidebar');
  if (!side) return;
  side.setAttribute('aria-label', `${state.sidebar} sidebar`);
  if (state.sidebar === 'explorer') {
    side.innerHTML = `<div class="pane-head"><span class="pane-title grow">Explorer</span>${button('new-file', '', { id: 'new-file', className: 'icon-button ghost', iconName: 'plus', title: 'Create file or folder' })}${button('refresh-tree', '', { className: 'icon-button ghost', iconName: 'refresh', title: 'Refresh files' })}</div><div class="pane-body tree" id="file-tree">${state.workspace ? treeRows() || '<div class="tree-empty">This workspace is empty.<br>Create your first file to begin.</div>' : '<div class="tree-empty">Choose a local folder to open your workspace. Files stay on your computer.</div>'}</div><div class="sidebar-footer"><div class="ellipsis" title="${attr(state.workspace || '')}">${esc(state.workspace || 'A quiet place to build.')}</div>${button('recent-workspaces', 'Recent workspaces', { id: 'recent-workspaces', className: 'ghost small' })}${button('trash-list', 'Restore deleted files', { id: 'open-trash', className: 'ghost small' })}</div>`;
  } else if (state.sidebar === 'search') {
    side.innerHTML = `<div class="pane-head"><span class="pane-title grow">Find in workspace</span>${button('refresh-search', '', { className: 'icon-button ghost', iconName: 'refresh', title: 'Run search' })}</div><form id="search-form" class="search-controls"><label class="sr-only" for="search-query">Find text</label><input id="search-query" placeholder="Find literal text" value="${attr(state.search.query)}"><label class="sr-only" for="search-replacement">Replace with</label><input id="search-replacement" placeholder="Replace with" value="${attr(state.search.replacement)}"><label class="row small"><input type="checkbox" id="search-case" ${state.search.caseSensitive ? 'checked' : ''}> Match case</label><div class="row"><button type="submit" class="primary grow">Find</button>${button('replace-search', 'Replace selected', { id: 'replace-search', className: 'grow' })}</div><div class="small muted">Literal search • selected matches only • revision checked</div></form><div class="pane-body" style="padding:0" id="search-results">${renderSearchMatches()}</div>`;
  } else if (state.sidebar === 'git') {
    side.innerHTML = `<div class="pane-head"><span class="pane-title grow">Source control</span>${button('refresh-git', '', { className: 'icon-button ghost', iconName: 'refresh', title: 'Refresh Git' })}</div><div class="pane-body" id="git-panel" style="padding:0">${renderGit()}</div>`;
  }
  if (focusId) {
    const restored = document.getElementById(focusId);
    if (restored && side.contains(restored)) {
      restored.focus({ preventScroll: true });
      if (selection && restored.setSelectionRange) restored.setSelectionRange(...selection);
    }
  }
}
function renderSearchMatches() {
  if (!state.search.matches.length)
    return '<div class="tree-empty">Search results will appear here. Binary files and ignored folders are excluded.</div>';
  return `<div class="row small muted" style="padding:10px"><label><input type="checkbox" id="search-select-all" ${state.search.selected.size === state.search.matches.length ? 'checked' : ''}> Select all</label><span class="grow"></span>${state.search.matches.length} matches</div>${state.search.matches.map((m, i) => `<div class="row" style="gap:0"><input type="checkbox" class="match-select" data-index="${i}" aria-label="Select ${attr(m.path)} line ${m.line}" ${state.search.selected.has(i) ? 'checked' : ''} style="margin-left:10px"><button class="search-result grow" data-action="search-location" data-index="${i}"><strong>${esc(base(m.path))} <span class="selection" style="display:inline">:${m.line}</span></strong><span>${esc(m.text)}</span></button></div>`).join('')}`;
}
async function runSearch() {
  state.search.query = $('#search-query')?.value || state.search.query;
  state.search.replacement = $('#search-replacement')?.value ?? state.search.replacement;
  if (!state.search.query.trim()) throw new Error('Enter text to find.');
  const queryAtStart = state.search.query;
  const caseAtStart = state.search.caseSensitive;
  const workspaceAtStart = state.workspace;
  const r = await invoke('workspace:search', {
    query: state.search.query,
    caseSensitive: state.search.caseSensitive,
  });
  if (
    state.search.query !== queryAtStart ||
    state.search.caseSensitive !== caseAtStart ||
    state.workspace !== workspaceAtStart
  )
    return;
  state.search.matches = r.matches || [];
  state.search.selected = new Set();
  if ($('#search-results')) $('#search-results').innerHTML = renderSearchMatches();
  if (r.truncated) toast('Search results were bounded. Narrow your search for remaining matches.', 'warning');
}
async function replaceSearch() {
  const matches = [...state.search.selected].map((i) => state.search.matches[i]);
  if (!matches.length) throw new Error('Select matches to replace.');
  state.search.replacement = $('#search-replacement').value;
  const unique = [...new Set(matches.map((m) => m.path))];
  const revisions = {};
  for (const path of unique) {
    const f = state.files.get(path);
    if (f?.dirty) throw new Error(`Save ${base(path)} before replacing matches.`);
    revisions[path] = (await invoke('file:read', { path })).revision;
  }
  if (
    !(await confirm(
      'Review replacement',
      `${matches.length} selected matches in ${unique.length} files.\nFind: ${state.search.query}\nReplace: ${state.search.replacement}\nEach file must still match its current revision.`,
      `Replace ${matches.length} matches`,
    ))
  )
    return;
  await invoke('workspace:replace', {
    query: state.search.query,
    replacement: state.search.replacement,
    paths: unique,
    revisions,
    matches,
    confirmed: true,
    caseSensitive: state.search.caseSensitive,
  });
  for (const path of unique) {
    if (state.files.has(path)) {
      const f = await invoke('file:read', { path });
      const existing = state.files.get(path);
      existing.revision = f.revision;
      existing.model.setValue(f.content);
      existing.dirty = false;
    }
  }
  toast('Selected replacements saved.');
  renderTabs();
  await runSearch();
}
function defineEditor() {
  editorListener?.dispose();
  editor?.dispose();
  monaco.editor.defineTheme('aura-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '77798E', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'BAA2FA' },
      { token: 'string', foreground: 'A3CFBB' },
      { token: 'number', foreground: 'E5BF91' },
      { token: 'type', foreground: '9DBBE8' },
    ],
    colors: {
      'editor.background': '#191b25',
      'editor.foreground': '#e6e5f0',
      'editorLineNumber.foreground': '#515365',
      'editorLineNumber.activeForeground': '#b4a1ff',
      'editor.selectionBackground': '#9983ef29',
      'editor.inactiveSelectionBackground': '#9983ef15',
      'editorCursor.foreground': '#b4a1ff',
      'editor.lineHighlightBackground': '#ffffff04',
      'editorIndentGuide.background1': '#ffffff0b',
      'editorWidget.background': '#242631',
      'editorWidget.border': '#ffffff20',
      'editorGutter.background': '#191b25',
    },
  });
  monaco.editor.defineTheme('aura-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '898398', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7850B2' },
      { token: 'string', foreground: '337C5D' },
      { token: 'number', foreground: 'A56829' },
    ],
    colors: {
      'editor.background': '#faf9fc',
      'editor.foreground': '#302b40',
      'editorLineNumber.foreground': '#b7b2c2',
      'editorLineNumber.activeForeground': '#7859cc',
      'editor.selectionBackground': '#7859cc20',
      'editor.lineHighlightBackground': '#25243603',
      'editorCursor.foreground': '#7859cc',
      'editorIndentGuide.background1': '#2524360b',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#2d284625',
      'editorGutter.background': '#faf9fc',
    },
  });
  editor = monaco.editor.create($('#editor-host'), {
    model: null,
    automaticLayout: true,
    theme: document.documentElement.dataset.theme === 'light' ? 'aura-light' : 'aura-dark',
    padding: { top: 17, bottom: 20 },
    fontSize: state.settings.fontSize || 14,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    lineHeight: 23,
    scrollBeyondLastLine: false,
    minimap: { enabled: state.settings.minimap !== false },
    roundedSelection: true,
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    suggest: { preview: true },
    folding: true,
    accessibilitySupport: 'auto',
  });
  editor.onDidChangeCursorPosition((e) => {
    $('#cursor-status').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => guard(saveActive));
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, openPalette);
  editor.addAction({
    id: 'aura.review',
    label: 'AuraScript: Review selected code',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
    run: () => attachContext('review'),
  });
  editorListener = monaco.editor.onDidChangeMarkers((uris) => {
    const active = state.files.get(state.activeFile);
    if (active && uris.some((u) => u.toString() === active.model.uri.toString())) renderProblems();
  });
  applySettings();
}
function addFile(data, activate = true) {
  const existing = state.files.get(data.path);
  if (existing) {
    if (activate) activateFile(data.path);
    return existing;
  }
  const uri = monaco.Uri.file(`${state.workspace.replace(/\\/g, '/')}/${data.path.replace(/\\/g, '/')}`);
  const model = monaco.editor.createModel(data.content || '', data.language || undefined, uri);
  const f = { ...data, dirty: !!data.dirty, model, viewState: null };
  state.files.set(data.path, f);
  state.tabs.push(data.path);
  modelListeners.set(
    data.path,
    model.onDidChangeContent(() => {
      f.dirty = true;
      persistSession();
      renderTabs();
      clearTimeout(diagnosticsTimer);
      diagnosticsTimer = setTimeout(() => guard(checkDiagnostics), 550);
      clearTimeout(autosaveTimer);
      if (state.settings.autosave) autosaveTimer = setTimeout(() => guard(() => saveFile(data.path)), 1200);
    }),
  );
  if (activate) activateFile(data.path);
  renderTabs();
  return f;
}
async function openFile(path, line, column = 1) {
  if (!state.workspace) throw new Error('Open a workspace first.');
  const existing = state.files.get(path);
  if (!existing) addFile(await invoke('file:read', { path }));
  activateFile(path);
  if (line) {
    editor.setPosition({ lineNumber: Number(line), column: Number(column) || 1 });
    editor.revealLineInCenter(Number(line));
  }
  document.body.classList.remove('sidebar-mobile-open');
}
function activateFile(path) {
  if (editor) {
    const previous = state.files.get(state.activeFile);
    if (previous) previous.viewState = editor.saveViewState();
  }
  state.activeFile = path;
  const f = state.files.get(path);
  if (editor) {
    editor.setModel(f?.model || null);
    if (f?.viewState) editor.restoreViewState(f.viewState);
    editor.layout();
  }
  setView('editor');
  renderTabs();
  renderToolbar();
  renderSidebar();
  renderProblems();
  persistSession();
  if (f) guard(checkDiagnostics);
}
function renderTabs() {
  const tabs = $('#tabs');
  if (!tabs) return;
  tabs.innerHTML =
    state.tabs
      .map((path) => {
        const f = state.files.get(path);
        return `<button class="tab ${state.activeFile === path ? 'active' : ''}" role="tab" aria-selected="${state.activeFile === path}" id="tab-${attr(path.replace(/[^a-z0-9]/gi, '-'))}" data-testid="editor-tab" data-path="${attr(path)}" data-action="open-file">${icon('file')}<span class="ellipsis grow">${esc(base(path))}</span><span class="${f?.dirty ? 'dirty' : 'close-tab'}" data-action="close-file" data-path="${attr(path)}" role="button" tabindex="0" aria-label="Close ${attr(base(path))}">${f?.dirty ? '●' : '×'}</span></button>`;
      })
      .join('') + button('new-file', '', { className: 'tab add-tab', iconName: 'plus', title: 'New file' });
  const empty = $('#editor-empty');
  empty.classList.toggle('hidden', !!state.activeFile);
  $('#editor-host').classList.toggle('hidden', !state.activeFile);
  if (!state.activeFile) {
    empty.innerHTML = `<img src="assets/aura.svg" alt=""><h2>A little space. A lot of possibility.</h2><p>${state.workspace ? 'Open a file from the explorer or create something new. Your workspace, assistant, and tools are ready.' : 'Choose a folder to begin. Your code stays local, and you decide what to share with an AI provider.'}</p><div class="quick-actions">${button('open-workspace', 'Open workspace', { className: 'primary', iconName: 'folder' })}${state.workspace ? button('new-file', 'Create file', { iconName: 'plus' }) : button('nav:settings', 'Configure assistant', { iconName: 'settings' })}</div><div class="shortcuts"><span>Commands <kbd>Ctrl K</kbd></span><span>Save <kbd>Ctrl S</kbd></span><span>Find <kbd>Ctrl Shift F</kbd></span></div>${
      !state.workspace && state.workspaces.length
        ? '<div style="width:min(460px,100%);text-align:left;margin-top:20px"><div class="eyebrow">Recent workspaces</div>' +
          state.workspaces
            .slice(0, 4)
            .map((w) =>
              button(
                'open-recent',
                `<span class="grow"><strong>${esc(w.name || base(w.path))}</strong><small class="ellipsis">${esc(w.path)}</small></span>${icon('chevron')}`,
                { className: 'recent-workspace', iconName: 'folder', data: `data-path="${attr(w.path)}"` },
              ),
            )
            .join('') +
          '</div>'
        : ''
    }`;
  }
  renderToolbar();
}
function renderToolbar() {
  const f = state.files.get(state.activeFile);
  $('#editor-toolbar').innerHTML = f
    ? `<span class="path">${esc(base(state.workspace))} <span class="muted">/</span> ${esc(f.path.replace(/\\/g, ' / '))}</span>${button('review-file', 'Review', { id: 'review-file', className: 'ghost', iconName: 'chat' })}${button('save-file', f.dirty ? 'Save changes' : 'Saved', { id: 'save-file', className: f.dirty ? 'toolbar-highlight' : 'ghost', iconName: 'save' })}`
    : '<span class="path">Your next idea starts here.</span>';
  $('#language-status').textContent = f?.language || '';
  const banner = $('#conflict');
  banner.className = f?.external ? 'conflict-banner' : 'hidden';
  banner.innerHTML = f?.external
    ? `<span class="grow">This file changed on disk. Review before overwriting.</span>${button('reload-file', 'Reload disk version')}${button('compare-disk', 'Compare')}`
    : '';
}
async function saveFile(path) {
  const f = state.files.get(path);
  if (!f) return;
  if (!f.dirty) return;
  try {
    const result = await invoke('file:save', { path, content: f.model.getValue(), revision: f.revision });
    f.revision = result.revision;
    f.content = result.content;
    f.dirty = false;
    f.external = false;
    renderTabs();
    persistSession();
    toast(`Saved ${base(path)}`);
    await checkDiagnostics();
  } catch (e) {
    if (
      e.code === 'REVISION_CONFLICT' ||
      e.code === 'CONFLICT' ||
      /revision|changed.*disk|conflict/i.test(errorText(e))
    ) {
      f.external = true;
      renderToolbar();
      toast('The file changed on disk. Compare or reload it before saving.', 'warning');
    } else throw e;
  }
}
async function saveActive() {
  return saveFile(state.activeFile);
}
async function closeFile(path) {
  const f = state.files.get(path);
  if (!f) return;
  if (f.dirty) {
    const answer = await dialog({
      title: `Close ${base(path)}?`,
      body: '<p>Your changes have not been written to disk.</p>',
      buttons: [
        { label: 'Keep editing', value: 'cancel' },
        { label: 'Discard changes', value: 'discard' },
        { label: 'Save and close', value: 'save', primary: true },
      ],
    });
    if (answer === 'cancel' || answer == null) return;
    if (answer === 'save') {
      await saveFile(path);
      if (f.dirty) return;
    }
  }
  clearTimeout(autosaveTimer);
  clearTimeout(diagnosticsTimer);
  const i = state.tabs.indexOf(path);
  state.tabs = state.tabs.filter((p) => p !== path);
  modelListeners.get(path)?.dispose();
  modelListeners.delete(path);
  f.model.dispose();
  state.files.delete(path);
  if (state.context?.path === path) clearContext();
  if (state.activeFile === path) activateFile(state.tabs[Math.min(i, state.tabs.length - 1)] || null);
  else renderTabs();
  persistSession();
}
async function newFile(parent = '') {
  if (!state.workspace) throw new Error('Open a workspace first.');
  const r = await formDialog(
    'Create in workspace',
    field(
      'path',
      'Workspace-relative path',
      'text',
      parent ? `${parent}/` : '',
      'Paths stay inside the selected workspace.',
      'required',
    ) +
      `<div class="field"><label for="field-kind">Kind</label><select id="field-kind" name="kind"><option value="file">File</option><option value="directory">Folder</option></select></div>`,
    'Create',
  );
  if (!r) return;
  await invoke('file:create', { path: r.path.trim(), kind: r.kind });
  await refreshTree();
  if (r.kind === 'file') await openFile(r.path.trim());
  toast(`${r.kind === 'file' ? 'File' : 'Folder'} created.`);
}
async function fileMenu(path, kind) {
  const answer = await dialog({
    title: base(path),
    body: `<p class="mono">${esc(path)}</p>`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Rename', value: 'rename' },
      { label: 'Move to trash', value: 'trash' },
      ...(kind === 'directory' ? [{ label: 'Create inside', value: 'new' }] : []),
    ],
  });
  if (answer === 'rename') {
    const r = await formDialog(
      'Rename safely',
      field(
        'path',
        'New workspace-relative path',
        'text',
        path,
        'Renaming keeps the file inside your workspace.',
        'required',
      ),
      'Rename',
    );
    if (!r) return;
    if ([...state.files.entries()].some(([p, f]) => f.dirty && (p === path || p.startsWith(path + '/'))))
      throw new Error('Save changed files in this folder before renaming.');
    const affected = state.tabs.filter((p) => p === path || p.startsWith(path + '/'));
    await invoke('file:rename', { path, newPath: r.path });
    for (const oldPath of affected) {
      await closeFile(oldPath);
      await openFile(r.path + oldPath.slice(path.length));
    }
    state.tree.clear();
    state.expanded.clear();
    await refreshTree();
  } else if (answer === 'trash') {
    if (
      !(await confirm(
        'Move to recoverable trash?',
        `${path}\nYou can restore it from “Restore deleted files”.`,
        'Move to trash',
      ))
    )
      return;
    if ([...state.files.entries()].some(([p, f]) => f.dirty && (p === path || p.startsWith(path + '/'))))
      throw new Error('Save or close changed files in this folder before moving it to trash.');
    await invoke('file:trash', { path });
    for (const p of [...state.tabs]) if (p === path || p.startsWith(`${path}/`)) await closeFile(p);
    state.tree.clear();
    state.expanded.clear();
    await refreshTree();
    toast('Moved to recoverable trash.');
  } else if (answer === 'new') await newFile(path);
}
async function trashList() {
  const items = array(await invoke('trash:list'));
  await dialog({
    title: 'Recoverable trash',
    body: items.length
      ? items
          .map(
            (t) =>
              `<article class="row" style="margin-bottom:12px"><div class="grow"><strong>${esc(t.path || t.originalPath)}</strong><p class="small">${esc(date(t.deletedAt || t.createdAt))}</p></div>${button('restore-trash', 'Restore', { data: `data-id="${attr(t.id)}"` })}</article>`,
          )
          .join('')
      : '<p>No deleted files in this workspace.</p>',
    buttons: [{ label: 'Done', value: 'done' }],
  });
}
async function reloadFile() {
  const f = state.files.get(state.activeFile);
  if (!f) return;
  if (
    f.dirty &&
    !(await confirm(
      'Discard editor changes?',
      'The current file will be replaced with its latest version on disk.',
      'Reload file',
    ))
  )
    return;
  const disk = await invoke('file:read', { path: f.path });
  f.model.setValue(disk.content);
  f.revision = disk.revision;
  f.dirty = false;
  f.external = false;
  renderTabs();
  persistSession();
}
async function compareDisk() {
  const f = state.files.get(state.activeFile);
  if (!f) return;
  const disk = await invoke('file:read', { path: f.path });
  await dialog({
    title: 'Disk change review',
    wide: true,
    body: `<div class="form-grid"><div><h3>Editor buffer</h3><pre class="mono-preview">${esc(f.model.getValue())}</pre></div><div><h3>Current disk version</h3><pre class="mono-preview">${esc(disk.content)}</pre></div></div><p>Save is blocked until you reload or explicitly rebase your buffer onto the latest revision.</p>`,
    buttons: [
      { label: 'Keep editing', value: 'cancel' },
      { label: 'Use disk version', value: 'reload' },
      { label: 'Keep buffer on latest revision', value: 'rebase', primary: true },
    ],
  }).then(async (answer) => {
    if (answer === 'reload') await reloadFile();
    if (answer === 'rebase') {
      f.revision = disk.revision;
      f.external = false;
      f.dirty = true;
      renderTabs();
      persistSession();
      toast('Buffer rebased. Review and Save to write it.', 'warning');
    }
  });
}
async function checkDiagnostics() {
  const f = state.files.get(state.activeFile);
  if (!f) return;
  const path = f.path,
    content = f.model.getValue();
  const result = await invoke('diagnostics:check', { path, content });
  if (state.activeFile !== path || f.model.getValue() !== content) return;
  state.diagnostics = result.diagnostics || [];
  monaco.editor.setModelMarkers(
    f.model,
    'aura-service',
    state.diagnostics.map((d) => ({
      startLineNumber: Math.max(1, d.line || 1),
      startColumn: Math.max(1, d.column || 1),
      endLineNumber: Math.max(1, d.endLine || d.line || 1),
      endColumn: Math.max(2, d.endColumn || (d.column || 1) + 1),
      message: d.message,
      severity: d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    })),
  );
  renderProblems();
}
function problems() {
  const f = state.files.get(state.activeFile);
  return f && monaco ? monaco.editor.getModelMarkers({ resource: f.model.uri }) : [];
}
function renderProblems() {
  const items = problems();
  const count = $('#diagnostics-count');
  if (count) count.textContent = `${items.length} problem${items.length === 1 ? '' : 's'}`;
  if (state.bottom === 'diagnostics' && $('#bottom-content'))
    $('#bottom-content').innerHTML = items.length
      ? items
          .map(
            (d, i) =>
              `<button class="diagnostic" data-action="diagnostic-location" data-index="${i}"><span class="severity">${icon(d.severity === monaco.MarkerSeverity.Warning ? 'warning' : 'close')}</span><span class="grow">${esc(d.message)}</span><span class="location">${d.startLineNumber}:${d.startColumn}</span></button>`,
          )
          .join('')
      : '<div class="loading-row">No diagnostics for the current file. JSON, Python, JavaScript and TypeScript checks use the actual editor buffer.</div>';
}

function dialog({
  title,
  body,
  buttons = [
    { label: 'Cancel', value: 'cancel' },
    { label: 'Continue', value: 'ok', primary: true },
  ],
  wide = false,
  form = false,
}) {
  const d = $('#dialog');
  if (d.open) d.close();
  d.className = wide ? 'wide' : '';
  d.innerHTML = `<form id="dialog-form"><div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" data-dialog-value="cancel" class="icon-button ghost" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div><div class="dialog-error hidden" id="dialog-error" role="alert"></div><div class="dialog-actions">${buttons.map((b) => `<button type="${form && b.primary ? 'submit' : 'button'}" data-dialog-value="${attr(b.value)}" class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`).join('')}</div></form>`;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      d.close();
      resolve(v);
    };
    d.addEventListener('cancel', () => finish(null), { once: true });
    d.onclick = (e) => {
      const b = e.target.closest('[data-dialog-value]');
      if (b && b.type !== 'submit') finish(b.dataset.dialogValue);
    };
    $('#dialog-form').onsubmit = (e) => {
      e.preventDefault();
      if (!form) return;
      const formData = Object.fromEntries(new FormData(e.target));
      finish(formData);
    };
    d.showModal();
    const input = $('input,textarea,select', d);
    if (input) setTimeout(() => input.focus(), 0);
  });
}
async function formDialog(title, body, submit = 'Save', wide = false) {
  const r = await dialog({
    title,
    body,
    form: true,
    wide,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: submit, value: 'save', primary: true },
    ],
  });
  return typeof r === 'object' && r ? r : null;
}
async function confirm(title, message, label = 'Continue') {
  return (
    (await dialog({
      title,
      body: `<p style="white-space:pre-wrap">${esc(message)}</p>`,
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label, value: 'ok', primary: true },
      ],
    })) === 'ok'
  );
}
async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(errorText(e), 'error', 9000);
  }
}

function renderBottom() {
  const panel = $('#bottom-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.bottomOpen);
  panel.innerHTML = `<div class="bottom-head">${button('bottom:terminal', 'Terminal', { id: 'show-terminal', className: state.bottom === 'terminal' ? 'active' : '' })}${button('bottom:diagnostics', `Problems <span class="badge">${problems().length}</span>`, { className: state.bottom === 'diagnostics' ? 'active' : '' })}<span class="grow"></span>${
    state.bottom === 'terminal'
      ? `<select id="terminal-sessions" class="terminal-sessions" aria-label="Terminal run">${
          [...state.processes.values()]
            .reverse()
            .map(
              (p) =>
                `<option value="${attr(p.id)}" ${state.activeProcess === p.id ? 'selected' : ''}>${esc(p.command || 'Process')} ${p.done ? `· ${p.cancelled ? 'stopped' : p.code}` : '· running'}</option>`,
            )
            .join('') || '<option value="">No runs</option>'
        }</select>${button('process-stop', 'Stop', { id: 'terminal-stop', className: 'small', data: state.processes.get(state.activeProcess)?.done === false ? '' : 'disabled' })}`
      : ''
  }${button('close-bottom', '', { className: 'icon-button ghost', iconName: 'close', title: 'Close bottom panel' })}</div><div id="bottom-content" class="${state.bottom === 'terminal' ? 'terminal-body' : 'grow'}">${state.bottom === 'terminal' ? terminalOutput() : ''}</div>${state.bottom === 'terminal' ? `<form id="terminal-form" class="terminal-input"><span class="prompt">›</span><label class="sr-only" for="terminal-command">Terminal command</label><input id="terminal-command" autocomplete="off" spellcheck="false" placeholder="Run a command in this workspace…" ${state.workspace ? '' : 'disabled'}><button type="submit" class="primary" id="terminal-run">Run</button></form>` : ''}`;
  if (state.bottom === 'diagnostics') renderProblems();
}
function terminalOutput() {
  const p = state.processes.get(state.activeProcess);
  if (!p)
    return 'Commands run in your selected workspace after an explicit confirmation.\nEach run retains its output and can be cancelled independently.';
  return `<div class="muted">$ ${esc(p.command || 'Process')}</div>${p.output.map((o) => `<span class="${o.stream === 'stderr' ? 'stderr' : ''}">${esc(o.data)}</span>`).join('')}${p.done ? `\n<span class="${p.code ? 'stderr' : 'muted'}">[${p.cancelled ? 'Cancelled' : `Exited ${p.code ?? 'unknown'}`} ${p.signal ? `· ${esc(p.signal)}` : ''}]</span>` : ''}`;
}
async function runProcess(command) {
  if (!command?.trim()) throw new Error('Enter a command.');
  if (!state.workspace) throw new Error('Open a workspace first.');
  if (
    !(await confirm(
      'Run terminal command?',
      `${command}\n\nWorking directory: ${state.workspace}\nThis command can change files and access the network. Only run commands you understand.`,
      'Run command',
    ))
  )
    return;
  const result = await invoke('process:start', { command, confirmed: true });
  const p = state.processes.get(result.id) || { id: result.id, output: [], done: false };
  p.command = command;
  state.processes.set(result.id, p);
  state.activeProcess = result.id;
  state.bottom = 'terminal';
  state.bottomOpen = true;
  setView('editor');
  renderBottom();
}
async function refreshGit() {
  if (!state.workspace) {
    state.git = null;
    state.gitSelected.clear();
    renderSidebar();
    return;
  }
  try {
    state.git = await invoke('git:status');
    const logs = await invoke('git:log');
    state.git.log = array(logs?.commits || logs);
    const branches = await invoke('git:branches');
    state.git.branches = array(branches?.branches || branches);
    const changedPaths = new Set(gitEntries().map((file) => file.path));
    state.gitSelected = new Set([...state.gitSelected].filter((path) => changedPaths.has(path)));
    renderSidebar();
    $('#git-status-label').textContent = state.git.branch ? `⑂ ${state.git.branch}` : '';
  } catch (e) {
    state.git = { error: errorText(e) };
    renderSidebar();
  }
}
function gitEntries() {
  const g = state.git || {};
  if (Array.isArray(g.files)) return g.files;
  if (Array.isArray(g.entries)) return g.entries;
  return [
    ...(g.staged || []).map((e) =>
      typeof e === 'string' ? { path: e, staged: true } : { ...e, staged: true },
    ),
    ...(g.unstaged || g.changes || []).map((e) => (typeof e === 'string' ? { path: e } : { ...e })),
  ];
}
function renderGit() {
  const g = state.git;
  if (!state.workspace)
    return '<div class="tree-empty">Open a local Git workspace to inspect its changes.</div>';
  if (!g) return '<div class="loading-row"><span class="spinner"></span>Reading repository…</div>';
  if (g.error)
    return `<div class="tree-empty">${esc(g.error)}<div class="divider"></div>Initialize or select a Git repository using your terminal.</div>`;
  const entries = gitEntries();
  return `<div class="git-section"><div class="row"><strong class="grow">⑂ ${esc(g.branch || 'Repository')}</strong>${button('git-branches', 'Branches', { id: 'git-branches', className: 'small' })}</div><p class="small muted" style="margin-top:8px">${entries.length} changed ${entries.length === 1 ? 'file' : 'files'} • select what you commit</p></div><div class="git-section"><h3>CHANGES</h3>${entries.length ? entries.map((f) => `<div class="git-file"><input type="checkbox" class="git-select" ${state.gitSelected.has(f.path) ? 'checked' : ''} data-path="${attr(f.path)}" aria-label="Select ${attr(f.path)}"><span class="status">${esc(f.status || f.indexStatus || f.worktreeStatus || 'M')}</span><button class="ghost grow ellipsis" data-action="git-diff" data-path="${attr(f.path)}" data-staged="${!!(f.staged || (f.indexStatus && f.indexStatus !== ' ' && f.indexStatus !== '?'))}" title="Inspect ${attr(f.path)}">${esc(f.path)}</button>${button(f.staged ? 'git-unstage' : 'git-stage', f.staged ? '−' : '+', { data: `data-path="${attr(f.path)}"`, title: f.staged ? 'Unstage file' : 'Stage file' })}</div>`).join('') : '<p class="small muted">Working tree is clean.</p>'}<div class="row" style="margin-top:10px">${button('git-stage-selected', 'Stage selected', { id: 'git-stage-selected', className: 'small' })}${button('git-unstage-selected', 'Unstage', { className: 'small' })}</div></div><div class="git-section"><form id="git-commit-form" class="stack" style="gap:8px"><label for="git-commit-message" class="small">Commit message</label><textarea id="git-commit-message" placeholder="Describe your staged changes" style="min-height:70px;font-size:12px">${esc(state.commitMessage)}</textarea><button type="submit" class="primary" id="git-commit">Commit staged changes</button></form></div><div class="git-section"><h3>COMMIT HISTORY</h3>${(g.log || []).map((c) => `<article class="git-log"><button data-action="git-commit-diff" data-id="${attr(c.hash || c.id)}">${esc(c.subject || c.message)}<small><span class="hash">${esc((c.hash || c.id || '').slice(0, 7))}</span> · ${esc(c.author || '')} · ${esc(date(c.date || c.createdAt))}</small></button></article>`).join('') || '<p class="small muted">No commits yet.</p>'}</div>`;
}
async function showGitDiff(payload) {
  const r = await invoke('git:diff', payload);
  const diff = typeof r === 'string' ? r : r.diff || r.text || '';
  await dialog({
    title: payload.path ? `Diff · ${payload.path}` : 'Commit diff',
    body: `<pre class="diff-view">${diff
      .split('\n')
      .map(
        (line) =>
          `<div class="${line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : line.startsWith('@@') ? 'meta' : ''}">${esc(line) || ' '}</div>`,
      )
      .join('')}</pre>`,
    wide: true,
    buttons: [{ label: 'Done', value: 'done' }],
  });
}
async function branches() {
  const list = state.git?.branches || [];
  const current = state.git?.branch || '';
  const r = await formDialog(
    'Switch or create a branch',
    `<p>Save changed buffers before switching branches. Git will reject conflicting changes.</p><div class="field"><label for="field-name">Branch name</label><input id="field-name" name="name" list="branch-names" value="${attr(current)}" required><datalist id="branch-names">${list.map((b) => `<option value="${attr(typeof b === 'string' ? b : b.name)}">`).join('')}</datalist></div><label class="row"><input type="checkbox" name="create" value="true"> Create a new branch</label>`,
    'Switch branch',
  );
  if (!r) return;
  if ([...state.files.values()].some((f) => f.dirty))
    throw new Error('Save or close changed files before switching branches.');
  await invoke('git:branch', { name: r.name, create: r.create === 'true' });
  await refreshGit();
  await refreshTree();
  for (const p of [...state.tabs]) {
    const f = state.files.get(p);
    try {
      const disk = await invoke('file:read', { path: p });
      f.model.setValue(disk.content);
      f.revision = disk.revision;
      f.dirty = false;
    } catch {
      await closeFile(p);
    }
  }
  renderTabs();
  toast('Branch selected.');
}

function clearContext() {
  state.context = null;
  renderContext();
}
function renderContext() {
  const chip = $('#context-chip');
  if (!chip) return;
  chip.innerHTML = state.context
    ? `${icon('code')}<span class="ellipsis grow">${esc(state.context.path)} ${state.context.selection ? '· selected lines' : ''}</span>${button('clear-context', 'Remove')}`
    : `<span>${esc(state.settings.provider || 'ollama')} · ${esc(state.settings.model || 'choose a model in Preferences')}</span>`;
}
function attachContext(mode) {
  const f = state.files.get(state.activeFile);
  if (!f) throw new Error('Open a file to attach code.');
  const selection = editor.getSelection();
  const selected = selection && !selection.isEmpty() ? f.model.getValueInRange(selection) : '';
  state.context = {
    path: f.path,
    content: selected || f.model.getValue(),
    revision: f.revision,
    selection: !!selected,
  };
  renderContext();
  if (mode) {
    $('#assistant-mode').value = mode;
    $('#chat-input').value =
      mode === 'review'
        ? 'Review this code for correctness, risks, and useful improvements.'
        : 'Propose a focused patch for this code.';
  }
  document.body.classList.remove('assistant-hidden');
  if (innerWidth <= 1000) document.body.classList.add('assistant-mobile-open');
  $('#chat-input').focus();
}
function formatMessage(text) {
  return String(text || '')
    .split('```')
    .map((part, i) =>
      i % 2 ? `<pre><code>${esc(part.replace(/^[a-z0-9_+-]*\n/i, ''))}</code></pre>` : esc(part),
    )
    .join('');
}
function renderAssistant(scroll = true) {
  const content = $('#assistant-content');
  if (!content) return;
  if (!state.messages.length) {
    content.innerHTML = `<div class="chat-empty"><div class="eyebrow">Your coding companion</div><h2>Make room for your next good idea.</h2><p>Ask a question, review a selection, or reason through a change. Choose a local or cloud provider in Preferences. Attached context is always visible.</p>${button('suggest:review', 'Review the current file', { className: 'suggestion' })}${button('suggest:explain', 'Help me understand this code', { className: 'suggestion' })}${button('nav:settings', 'Set up my AI provider', { className: 'suggestion' })}<p class="small">AI proposals require your review. Commands run only with your approval.</p></div>`;
  } else
    content.innerHTML = state.messages
      .map(
        (m, i) =>
          `<article class="chat-message ${attr(m.role || 'assistant')} ${m.error ? 'error' : ''}" data-testid="chat-message"><div class="message-label">${m.role === 'user' ? 'You' : 'Aura'} ${m.streaming ? '<span class="spinner"></span>' : ''}<span class="message-time">${esc(date(m.createdAt || m.timestamp))}</span></div><div class="message-text">${formatMessage(m.content ?? m.text ?? '')}</div>${m.proposals?.map((p, j) => `<div class="proposal"><h3>${esc(p.path || p.title || 'Proposed change')}</h3><p>${esc(p.summary || 'Review the complete replacement before applying. This proposal is untrusted AI output.')}</p><div class="row">${button('proposal-review', 'Review patch', { data: `data-message="${i}" data-index="${j}"` })}<span class="badge">No automatic execution</span></div></div>`).join('') || ''}${m.role !== 'user' && !m.streaming && !m.error ? `<div class="row" style="margin-top:8px">${button('speak-message', 'Read aloud', { className: 'ghost small', data: `data-index="${i}"` })}${button('copy-message', 'Copy', { className: 'ghost small', data: `data-index="${i}"` })}</div>` : ''}</article>`,
      )
      .join('');
  if (scroll) content.scrollTop = state.messages.length ? content.scrollHeight : 0;
  const running = !!state.turnId;
  $('#send-message').classList.toggle('hidden', running);
  $('#stop-generation').classList.toggle('hidden', !running);
  renderContext();
}
async function sendAI(text, mode) {
  text = text ?? $('#chat-input').value.trim();
  if (!text) throw new Error('Enter a message.');
  if (state.turnId) throw new Error('Stop the current response before sending another message.');
  const context = state.context
    ? [{ path: state.context.path, content: state.context.content, revision: state.context.revision }]
    : [];
  state.messages.push({ role: 'user', content: text, createdAt: new Date().toISOString() });
  const message = {
    role: 'assistant',
    content: '',
    streaming: true,
    createdAt: new Date().toISOString(),
    workspace: state.workspace,
    context: context.map((c) => ({ ...c })),
  };
  state.messages.push(message);
  state.pendingAI = message;
  $('#chat-input').value = '';
  renderAssistant();
  try {
    const r = await invoke('ai:send', {
      text,
      conversationId: state.conversationId || undefined,
      context,
      mode: mode || $('#assistant-mode').value,
    });
    state.turnId = message.streaming ? r.turnId : null;
    state.conversationId = r.conversationId;
    message.turnId = r.turnId;
    renderAssistant();
  } catch (e) {
    message.streaming = false;
    message.error = true;
    message.content = errorText(e);
    state.pendingAI = null;
    state.turnId = null;
    renderAssistant();
    throw e;
  }
}
async function newConversation() {
  voice.stop();
  if (state.turnId) await invoke('ai:cancel', { turnId: state.turnId });
  state.turnId = null;
  state.pendingAI = null;
  state.conversationId = null;
  state.messages = [];
  clearContext();
  stopSpeech();
  renderAssistant();
  toast('New conversation started.');
}
async function readConversation(id) {
  voice.stop();
  if (state.turnId) await invoke('ai:cancel', { turnId: state.turnId });
  const result = await invoke('conversations:read', { id });
  state.conversationId = result.id || id;
  state.messages = result.messages || [];
  state.turnId = null;
  state.pendingAI = null;
  clearContext();
  renderAssistant();
  document.body.classList.remove('assistant-hidden');
  if (innerWidth <= 1000) document.body.classList.add('assistant-mobile-open');
}
async function reviewProposal(messageIndex, proposalIndex) {
  const message = state.messages[messageIndex],
    proposal = message?.proposals?.[proposalIndex];
  if (!proposal) throw new Error('Proposal is no longer available.');
  if (message.workspace && message.workspace !== state.workspace)
    throw new Error('Reopen the workspace where this patch was requested before applying it.');
  const f = state.files.get(proposal.path);
  if (f?.dirty) throw new Error(`Save or close changed ${base(proposal.path)} before reviewing a proposal.`);
  const original = message.context?.find((c) => c.path === proposal.path);
  if (original?.revision) {
    const disk = await invoke('file:read', { path: proposal.path });
    if (disk.revision !== original.revision)
      throw new Error('The selected source changed since this proposal. Request a fresh patch.');
  }
  const preview = await invoke('patch:preview', { proposal });
  const answer = await dialog({
    title: `Review proposed patch · ${preview.path}`,
    wide: true,
    body: `<p>${esc(preview.reason || 'AI-generated code is untrusted. Review the exact before and after content. Applying writes this file only and does not execute commands.')}</p><div class="form-grid"><div><h3>Current disk version</h3><pre class="mono-preview">${esc(preview.before)}</pre></div><div><h3>Proposed replacement</h3><pre class="mono-preview">${esc(preview.after)}</pre></div></div>`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply reviewed replacement', value: 'apply', primary: true },
    ],
  });
  if (answer !== 'apply') return;
  const saved = await invoke('patch:apply', { id: preview.id, confirmed: true });
  if (f) {
    f.model.setValue(saved.content);
    f.revision = saved.revision;
    f.dirty = false;
    f.external = false;
  } else addFile(saved);
  activateFile(saved.path);
  persistSession();
  toast('Reviewed patch saved. No commands were executed.');
}

function header(eyebrow, title, description, actions = '') {
  return `<div class="page-header"><div class="grow"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`;
}
function empty(title, description, action = '') {
  return `<div class="empty-card"><h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function renderPage() {
  const page = $('#page');
  if (!page) return;
  if (state.view === 'settings') {
    renderSettings();
    return;
  }
  if (state.view === 'history') {
    page.innerHTML =
      header(
        'Private conversations',
        'A thread worth keeping.',
        'Find past conversations and continue where you left off.',
        button('new-conversation', 'New conversation', { className: 'primary', iconName: 'plus' }),
      ) +
      `<form id="history-search-form" class="row" style="margin-bottom:20px"><input id="history-query" class="grow" placeholder="Search conversation titles and messages" aria-label="Search conversations"><button type="submit">Search</button>${button('refresh-history', 'All conversations')}</form><div class="card-grid" id="history-list">${renderConversations()}</div>`;
    guard(refreshHistory);
  }
  if (state.view === 'knowledge') {
    page.innerHTML =
      header(
        'Grounded answers',
        'Your reference shelf.',
        'Import text and Markdown. Search actual document excerpts with source references.',
        button('import-document', 'Import document', {
          id: 'import-document',
          className: 'primary',
          iconName: 'upload',
        }),
      ) +
      `<form id="documents-search-form" class="row" style="margin-bottom:20px"><input id="documents-query" class="grow" placeholder="Search your document collection" aria-label="Search documents"><button type="submit">Search sources</button></form><div id="document-results" class="result-list"></div><div class="section-heading"><h2>Documents</h2><span class="badge">Private local storage</span></div><div class="card-grid" id="document-list">${renderDocuments()}</div>`;
    guard(refreshDocuments);
  }
  if (state.view === 'memory') {
    page.innerHTML =
      header(
        'Keep the useful things',
        'Memory & reminders.',
        'Curate the context your assistant can use, and schedule reminders in an explicit timezone.',
        button('new-memory', 'Add memory', { id: 'new-memory', className: 'primary', iconName: 'plus' }),
      ) +
      `<div class="section-heading"><h2>Personal memory</h2>${button('export-memory', 'Export', { className: 'ghost small', iconName: 'download' })}</div><div class="card-grid" id="memory-list">${renderMemories()}</div><div class="section-heading"><h2>Reminders</h2><span class="grow"></span>${button('new-reminder', 'Create reminder', { id: 'new-reminder', iconName: 'clock' })}</div><div class="card-grid" id="reminder-list">${renderReminders()}</div>`;
    guard(refreshMemory);
  }
  if (state.view === 'workflows') {
    page.innerHTML =
      header(
        'Work with intention',
        'A repeatable rhythm.',
        'Reusable workflows collect explicit terminal steps. Review every command before each run.',
        button('new-workflow', 'New workflow', {
          id: 'new-workflow',
          className: 'primary',
          iconName: 'plus',
        }),
      ) +
      `<div class="card-grid" id="workflow-list">${renderWorkflows()}</div><div class="section-heading"><h2>Execution receipts</h2><span class="badge">Actual recorded operations</span></div><div id="receipt-list" class="result-list">${renderReceipts()}</div>`;
    guard(refreshWorkflows);
  }
}
function renderConversations() {
  return state.conversations.length
    ? state.conversations
        .map(
          (c) =>
            `<article class="card"><div class="card-icon">${icon('chat')}</div><h3>${esc(c.title || 'Conversation')}</h3><p>${esc((c.preview || c.messages?.find((m) => m.role === 'user')?.content || 'Saved conversation').slice(0, 160))}</p><small>${esc(date(c.updatedAt || c.createdAt))}</small><div class="card-actions">${button('read-conversation', 'Continue', { data: `data-id="${attr(c.id)}"` })}${button('rename-conversation', 'Rename', { className: 'ghost', data: `data-id="${attr(c.id)}"` })}${button('delete-conversation', 'Delete', { className: 'ghost danger', data: `data-id="${attr(c.id)}"` })}</div></article>`,
        )
        .join('')
    : empty(
        'No conversations yet.',
        'Your provider-backed conversations will appear here once you start chatting.',
      );
}
async function refreshHistory(query) {
  state.conversations = array(
    await invoke(query ? 'conversations:search' : 'conversations:list', query ? { query } : {}),
  );
  if ($('#history-list')) $('#history-list').innerHTML = renderConversations();
}
function renderDocuments() {
  return state.documents.length
    ? state.documents
        .map(
          (d) =>
            `<article class="card"><div class="card-icon">${icon('book')}</div><h3>${esc(d.name || d.title)}</h3><p>${esc((d.content || d.preview || '').slice(0, 145))}</p><small>${esc(d.content?.length || d.characters || 0)} characters · ${esc(date(d.createdAt))}</small><div class="card-actions">${button('view-document', 'Read source', { data: `data-id="${attr(d.id)}"` })}${button('delete-document', 'Delete', { className: 'ghost danger', data: `data-id="${attr(d.id)}"` })}</div></article>`,
        )
        .join('')
    : empty(
        'Build a small, useful library.',
        'Import .txt or .md files. Document retrieval is local lexical search, with real excerpts and source IDs.',
      );
}
async function refreshDocuments() {
  state.documents = array(await invoke('documents:list'));
  if ($('#document-list')) $('#document-list').innerHTML = renderDocuments();
}
async function importDocument() {
  const file = await chooseFile('.txt,.md,.markdown,text/plain,text/markdown');
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('Documents must be smaller than 2 MB.');
  const content = await file.text();
  await invoke('documents:import', { name: file.name, content });
  await refreshDocuments();
  toast('Document imported and indexed for source search.');
}
async function searchDocuments() {
  const query = $('#documents-query').value.trim();
  if (!query) throw new Error('Enter text to search.');
  const result = await invoke('documents:search', { query });
  const matches = array(result.matches || result.results || result);
  $('#document-results').innerHTML = matches.length
    ? matches
        .map(
          (m) =>
            `<article><h3>${esc(m.name || m.documentName || m.title || 'Source')}</h3><p>${esc(m.excerpt || m.text || m.content || '')}</p><span class="citation">Source ${esc(m.documentId || m.id)} ${m.line ? `· line ${m.line}` : ''}</span>${button('cite-document', 'Attach excerpt to assistant', { className: 'ghost small', data: `data-id="${attr(m.documentId || m.id)}" data-text="${attr(m.excerpt || m.text || m.content || '')}"` })}</article>`,
        )
        .join('')
    : '<article><p>No matching excerpts. Try a specific word that appears in your documents.</p></article>';
}
function renderMemories() {
  return state.memories.length
    ? state.memories
        .map(
          (m) =>
            `<article class="card"><div class="row"><h3 class="grow">${esc(m.title || 'Memory')}</h3><span class="badge">${m.enabled === false ? 'Excluded' : 'In context'}</span></div><p class="content-preview">${esc(m.content || m.text)}</p><small>Updated ${esc(date(m.updatedAt || m.createdAt))}</small><div class="card-actions">${button('edit-memory', 'Edit', { data: `data-id="${attr(m.id)}"` })}${button('delete-memory', 'Delete', { className: 'ghost danger', data: `data-id="${attr(m.id)}"` })}</div></article>`,
        )
        .join('')
    : empty(
        'Remember only what helps.',
        'Store preferences, project decisions, and context. You can inspect, edit, export, or delete every item.',
      );
}
function renderReminders() {
  return state.reminders.length
    ? state.reminders
        .map(
          (r) =>
            `<article class="card"><div class="row"><h3 class="grow">${esc(r.title || r.text)}</h3><span class="badge ${r.status === 'due' || r.status === 'delivered' ? 'good' : ''}">${esc(r.status || 'scheduled')}</span></div><p>${esc(r.notes || r.text || r.description || '')}</p><small>${esc(date(r.dueAt || r.at))} · ${esc(r.timezone || state.settings.timezone)}</small><div class="card-actions">${r.status === 'due' ? button('complete-reminder', 'Mark complete', { data: `data-id="${attr(r.id)}"` }) : ''}${!['cancelled', 'delivered', 'completed'].includes(r.status) ? button('cancel-reminder', 'Cancel', { data: `data-id="${attr(r.id)}"`, className: 'ghost danger' }) : ''}</div></article>`,
        )
        .join('')
    : empty(
        'A gentle nudge, at the right time.',
        'Reminders persist locally. The desktop app must be running for due notifications.',
      );
}
async function refreshMemory() {
  [state.memories, state.reminders] = await Promise.all([
    invoke('memory:list').then(array),
    invoke('reminders:list').then(array),
  ]);
  if ($('#memory-list')) $('#memory-list').innerHTML = renderMemories();
  if ($('#reminder-list')) $('#reminder-list').innerHTML = renderReminders();
}
async function editMemory(id) {
  const m = state.memories.find((m) => m.id === id) || {};
  const r = await formDialog(
    id ? 'Edit memory' : 'Create memory',
    field(
      'title',
      'Title',
      'text',
      m.title || '',
      'A clear label makes memory easier to review.',
      'required maxlength="120"',
    ) +
      field('content', 'Content', 'textarea', m.content || m.text || '', '', 'required maxlength="10000"') +
      `<label class="row"><input type="checkbox" name="enabled" value="true" ${m.enabled !== false ? 'checked' : ''}> Include this memory in future assistant context</label>`,
    'Save memory',
  );
  if (!r) return;
  await invoke('memory:save', {
    title: r.title,
    content: r.content,
    enabled: r.enabled === 'true',
    ...(id ? { id } : {}),
  });
  await refreshMemory();
  toast('Memory saved.');
}
function localTimeInZone(timezone, offsetMinutes = 60) {
  const future = new Date(Date.now() + offsetMinutes * 60000);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(future);
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
async function newReminder() {
  const zone = state.settings.timezone || 'UTC';
  const r = await formDialog(
    'Create a reminder',
    field('title', 'Title', 'text', '', '', 'required maxlength="120"') +
      field('text', 'Reminder details', 'textarea') +
      field(
        'localTime',
        'Date and time in selected timezone',
        'datetime-local',
        localTimeInZone(zone),
        'This wall-clock time will be resolved using the timezone below.',
        'required',
      ) +
      field(
        'timezone',
        'IANA timezone',
        'text',
        zone,
        'For example Asia/Calcutta, Europe/London, or America/New_York.',
        'required',
      ),
    'Schedule reminder',
  );
  if (!r) return;
  await invoke('reminders:save', { title: r.title, notes: r.text, dueAt: r.localTime, timezone: r.timezone });
  await refreshMemory();
  toast('Reminder scheduled.');
}
function renderWorkflows() {
  return state.workflows.length
    ? state.workflows
        .map(
          (w) =>
            `<article class="card"><div class="card-icon">${icon('bolt')}</div><h3>${esc(w.name || w.title)}</h3><p>${esc(w.description || 'Reusable command workflow')}</p><pre class="receipt">${esc(w.command || '')}</pre><div class="card-actions">${button('run-workflow', 'Review & run', { className: 'primary', data: `data-id="${attr(w.id)}"` })}${button('edit-workflow', 'Edit', { data: `data-id="${attr(w.id)}"` })}${button('delete-workflow', 'Delete', { className: 'ghost danger', data: `data-id="${attr(w.id)}"` })}</div></article>`,
        )
        .join('')
    : empty(
        'Keep your repeatable work close.',
        'Create a workflow for checks, builds, or other commands you understand. No workflow runs without confirmation.',
      );
}
function renderReceipts() {
  return state.receipts.length
    ? state.receipts
        .slice(0, 40)
        .map(
          (r) =>
            `<article><div class="row"><h3 class="grow">${esc(r.action || r.title || r.operation || r.type || 'Operation')}</h3><span class="badge ${r.status === 'completed' || r.success ? 'good' : r.status === 'failed' ? 'error' : ''}">${esc(r.status || 'recorded')}</span></div><small class="muted">${esc(date(r.createdAt || r.at))}</small><pre class="receipt">${esc(r.command || r.summary || JSON.stringify(r.result || r.details || {}, null, 2))}</pre></article>`,
        )
        .join('')
    : '<article><p class="muted">Execution receipts will appear after real tool and workflow operations.</p></article>';
}
async function refreshWorkflows() {
  state.workflows = array(await invoke('workflows:list'));
  const b = await invoke('bootstrap');
  state.receipts = b.receipts || [];
  if ($('#workflow-list')) $('#workflow-list').innerHTML = renderWorkflows();
  if ($('#receipt-list')) $('#receipt-list').innerHTML = renderReceipts();
}
async function editWorkflow(id) {
  const w = state.workflows.find((w) => w.id === id) || {};
  const r = await formDialog(
    id ? 'Edit workflow' : 'Create workflow',
    field('name', 'Workflow name', 'text', w.name || w.title || '', '', 'required maxlength="100"') +
      field('description', 'Description', 'text', w.description || '') +
      field(
        'commands',
        'Terminal commands, one per line',
        'textarea',
        w.command || '',
        'Each non-empty line is an explicit command. Review all commands before running.',
        'required',
      ),
    'Save workflow',
  );
  if (!r) return;
  await invoke('workflows:save', {
    ...(id ? { id } : {}),
    name: r.name,
    description: r.description,
    command: r.commands,
  });
  await refreshWorkflows();
  toast('Workflow saved.');
}
async function runWorkflow(id) {
  const w = state.workflows.find((w) => w.id === id);
  if (!w) throw new Error('Workflow no longer exists.');
  if (!state.workspace) throw new Error('Open a workspace before running a workflow.');
  const steps = [w.command || ''];
  if (
    !(await confirm(
      `Run ${w.name || w.title}?`,
      `${steps.join('\n')}\n\nWorking directory: ${state.workspace}\nCommands can change files and use the network. Run only commands you understand.`,
      'Run workflow',
    ))
  )
    return;
  const r = await invoke('workflows:run', { id, confirmed: true });
  toast('Workflow started. Track actual output and its execution receipt.');
  const ids = r.processIds || r.ids || [r.processId || r.id].filter(Boolean);
  if (ids.length) {
    const p = state.processes.get(ids[0]) || { id: ids[0], output: [], done: false };
    p.command = w.command;
    state.processes.set(ids[0], p);
    state.activeProcess = ids[0];
    state.bottom = 'terminal';
    state.bottomOpen = true;
    renderBottom();
  }
  await refreshWorkflows();
}

function checkSetting(name, title, hint) {
  return `<div class="setting-row"><label for="setting-${name}"><strong>${title}</strong><small>${hint}</small></label><input type="checkbox" id="setting-${name}" data-setting="${name}" ${state.settings[name] ? 'checked' : ''}></div>`;
}
function selectSetting(name, title, hint, options) {
  return `<div class="setting-row"><label for="setting-${name}"><strong>${title}</strong><small>${hint}</small></label><select id="setting-${name}" data-setting="${name}">${options.map(([value, label]) => `<option value="${attr(value)}" ${String(state.settings[name]) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}
function renderSettings() {
  const s = state.settings;
  $('#page').innerHTML =
    header(
      'Make it yours',
      'A considered workspace.',
      'Personalize your editor, configure real providers, and manage your private data.',
    ) +
    `<section class="settings-section"><h2>Appearance & access</h2><p>Quiet chrome, readable code, and preferences that stay with you.</p>${selectSetting(
      'theme',
      'Theme',
      'Choose light, dark, or follow your operating system.',
      [
        ['system', 'System'],
        ['dark', 'Graphite'],
        ['light', 'Pearl'],
      ],
    )}<div class="setting-row"><label for="setting-fontSize"><strong>Editor text size</strong><small>10–32 px. Ctrl + mouse wheel also adjusts the editor.</small></label><input id="setting-fontSize" data-setting="fontSize" type="number" min="10" max="32" value="${s.fontSize || 14}"></div>${selectSetting(
      'tabSize',
      'Indentation',
      'Spaces in one indentation level.',
      [
        [2, '2 spaces'],
        [4, '4 spaces'],
        [8, '8 spaces'],
      ],
    )}${checkSetting('minimap', 'Code minimap', 'Keep a navigable overview of long files.')}${checkSetting('wordWrap', 'Wrap long lines', 'Keep lines within the editor viewport.')}${checkSetting('autosave', 'Autosave changed files', 'Save after a pause. External revision conflicts remain blocked.')}${checkSetting('reducedMotion', 'Reduce motion', 'Use immediate state changes and static feedback.')}${checkSetting('reducedTransparency', 'Reduce transparency', 'Replace glass with opaque materials.')}${checkSetting('highContrast', 'High contrast', 'Strengthen borders, labels, and focus indicators.')}</section><section class="settings-section"><h2>AI connection</h2><p>Use an installed Ollama model for local inference, or an account-supported OpenAI / Groq model. Only attached code is sent.</p><form id="provider-form" class="form-grid settings-form"><div class="field"><label for="provider">Provider</label><select id="provider" name="provider">${['ollama', 'openai', 'groq'].map((p) => `<option value="${p}" ${s.provider === p ? 'selected' : ''}>${p === 'ollama' ? 'Ollama · local' : p === 'openai' ? 'OpenAI' : 'Groq'}</option>`).join('')}</select></div>${field('model', 'Model identifier', 'text', s.model || '', 'Choose an installed or accessible model.', 'required')}${field('endpoint', 'Ollama endpoint', 'url', s.endpoint || 'http://127.0.0.1:11434', 'Cloud providers use their fixed official API endpoints.', 'required')}${field('maxRequests', 'Request limit', 'number', s.maxRequests || 0, '0 removes the local request-count limit.', 'min="0" max="1000000"')}${field('maxOutputTokens', 'Response token limit', 'number', s.maxOutputTokens || 2048, 'Bound output length for actual provider calls.', 'min="16" max="8192"')}<label class="row"><input type="checkbox" name="think" value="true" ${s.think ? 'checked' : ''}> Enable model thinking (Ollama)</label><div class="field full"><div class="row"><button type="submit" class="primary" id="save-provider">Save connection</button>${button('provider-health', 'Check health', { id: 'provider-health' })}</div></div></form><div id="provider-health-result" style="margin-top:15px"></div><div class="divider"></div><form id="secret-form" class="row wrap"><select id="secret-provider" name="provider" aria-label="API key provider"><option value="openai">OpenAI key</option><option value="groq">Groq key</option></select><input id="provider-key" name="key" type="password" autocomplete="off" placeholder="New API key" aria-label="New provider API key" class="grow"><button type="submit" id="save-key">Store key securely</button>${button('clear-key', 'Remove key', { className: 'danger' })}</form><p class="small muted" style="margin-top:10px">Keys are encrypted with your operating system. Stored values are never shown or included in exports. If secure storage is unavailable, use environment configuration.</p></section><section class="settings-section"><h2>Voice & selected images</h2><p>Recording and transcription are explicit. Playback uses available operating-system voices. Image analysis reads only the image you select.</p><form id="voice-settings-form" class="form-grid"><div class="field"><label for="voice-provider">Transcription provider</label><select id="voice-provider" name="voiceProvider"><option value="openai" ${s.voiceProvider === 'openai' ? 'selected' : ''}>OpenAI</option><option value="groq" ${s.voiceProvider === 'groq' ? 'selected' : ''}>Groq</option></select></div>${field('voiceModel', 'Transcription model', 'text', s.voiceModel || '', 'Configure an actual speech-capable model.')}${field('visionModel', 'Vision model', 'text', s.visionModel || '', 'Leave blank to use the assistant model, if it supports images.')}<div class="field"><label>Available speech output</label><div class="info-box small" id="speech-status">${esc(voiceAvailability())}</div></div><div class="row"><button type="submit" class="primary">Save voice & image settings</button>${button('stop-speech', 'Stop speech')}</div></form></section><section class="settings-section"><h2>Timezone & local usage</h2><p>Reminders resolve the selected wall-clock time against an explicit timezone. Usage records actual requests and characters; no invented dollar estimate.</p><form id="timezone-form" class="row"><input id="timezone" class="grow" name="timezone" value="${attr(s.timezone || 'UTC')}" aria-label="IANA timezone" required><button type="submit">Save timezone</button></form><div class="card-grid" style="margin-top:18px"><article class="card"><h3>${Number(state.usage.requests) || 0}</h3><p>Provider requests</p></article><article class="card"><h3>${(Number(state.usage.inputCharacters) || 0).toLocaleString()}</h3><p>Input characters</p></article><article class="card"><h3>${(Number(state.usage.outputCharacters) || 0).toLocaleString()}</h3><p>Output characters</p></article>${Number.isFinite(state.usage.inputTokens) ? `<article class="card"><h3>${state.usage.inputTokens.toLocaleString()}</h3><p>Provider-reported input tokens</p></article>` : ''}${Number.isFinite(state.usage.outputTokens) ? `<article class="card"><h3>${state.usage.outputTokens.toLocaleString()}</h3><p>Provider-reported output tokens</p></article>` : ''}</div>${button('refresh-usage', 'Refresh usage', { className: 'ghost', data: 'style="margin-top:8px"' })}</section><section class="settings-section"><h2>Private data & portability</h2><p>Export a real JSON snapshot. Import shows counts and warnings before applying, preserving your existing data.</p><div class="row wrap">${button('export-data', 'Export private data', { id: 'export-data', iconName: 'download' })}${button('import-data', 'Review an import', { id: 'import-data', iconName: 'upload' })}</div><div class="info-box" style="margin-top:18px">Your local workspace files are managed separately. Exports include conversations, documents, memory, reminders, and workflows. API keys and absolute file paths are excluded.</div></section>`;
}
async function providerHealth() {
  const target = $('#provider-health-result');
  if (target)
    target.innerHTML =
      '<div class="info-box"><span class="spinner"></span>Checking the actual provider connection…</div>';
  try {
    const r = await invoke('provider:health');
    if (target)
      target.innerHTML = `<div class="info-box ${r.available === false || r.ok === false ? 'error' : 'good'}"><strong>${esc(r.provider || state.settings.provider)}</strong><pre class="receipt">${esc(JSON.stringify(r, null, 2))}</pre></div>`;
  } catch (e) {
    if (target) target.innerHTML = `<div class="info-box error">${esc(errorText(e))}</div>`;
    throw e;
  }
}
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'sr-only';
    document.body.append(input);
    input.onchange = () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    input.click();
  });
}
async function importData() {
  const file = await chooseFile('.json,application/json');
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) throw new Error('Imports must be under 8 MB.');
  const preview = await invoke('import:preview', { data: await file.text() });
  const ok = await dialog({
    title: 'Review private data import',
    body: `<p>File: ${esc(file.name)}</p><pre class="mono-preview">${esc(JSON.stringify(preview.counts, null, 2))}</pre><div class="info-box">${(preview.warnings || []).map((w) => esc(w)).join('<br>')}</div>`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply reviewed import', value: 'apply', primary: true },
    ],
  });
  if (ok !== 'apply') return;
  const r = await invoke('import:apply', { id: preview.id, confirmed: true });
  await loadBootstrap(false);
  renderPage();
  toast(`Import applied: ${Object.values(r.counts || {}).reduce((a, b) => a + Number(b), 0)} records.`);
}
async function analyzeImage() {
  const r = await invoke('vision:analyze', {
    prompt:
      $('#chat-input').value.trim() ||
      'Describe this selected image and explain any relevant code or interface details.',
  });
  if (r?.cancelled) return;
  state.messages.push(
    { role: 'user', content: `Selected image: ${r.name || 'image'}`, createdAt: new Date().toISOString() },
    {
      role: 'assistant',
      content: r.text || r.content || r.message?.content || JSON.stringify(r, null, 2),
      createdAt: new Date().toISOString(),
    },
  );
  renderAssistant();
}

function commands() {
  return [
    { label: 'Open workspace', key: 'Ctrl O', run: () => openWorkspace() },
    { label: 'Create file or folder', key: 'Ctrl N', run: () => newFile() },
    { label: 'Save current file', key: 'Ctrl S', run: () => saveActive() },
    { label: 'Save all changed files', key: 'Ctrl Shift S', run: () => saveAll() },
    { label: 'Close current file', key: 'Ctrl W', run: () => closeFile(state.activeFile) },
    { label: 'Find in workspace', key: 'Ctrl Shift F', run: () => nav('search') },
    { label: 'Show source control', run: () => nav('git') },
    { label: 'Toggle terminal', key: 'Ctrl `', run: () => toggleBottom('terminal') },
    { label: 'Check current file diagnostics', run: () => checkDiagnostics() },
    { label: 'Review selected code', key: 'Ctrl Shift R', run: () => attachContext('review') },
    { label: 'New conversation', run: () => newConversation() },
    { label: 'Search conversations', run: () => nav('history') },
    {
      label: 'Import a reference document',
      run: () => {
        nav('knowledge');
        return importDocument();
      },
    },
    {
      label: 'Create a private memory',
      run: () => {
        nav('memory');
        return editMemory();
      },
    },
    {
      label: 'Schedule a reminder',
      run: () => {
        nav('memory');
        return newReminder();
      },
    },
    {
      label: 'Create reusable workflow',
      run: () => {
        nav('workflows');
        return editWorkflow();
      },
    },
    { label: 'Restore deleted workspace files', run: () => trashList() },
    { label: 'Switch light / dark theme', run: () => toggleTheme() },
    { label: 'Preferences', key: 'Ctrl ,', run: () => nav('settings') },
    {
      label: 'Export private data',
      run: async () => downloadJSON(await invoke('export:get'), 'aurascript-export.json'),
    },
  ];
}
function openPalette() {
  paletteCommands = commands();
  paletteIndex = 0;
  const d = $('#palette');
  d.innerHTML = `<h2 id="palette-title" class="sr-only">Command palette</h2><div class="palette-input">${icon('search')}<input id="palette-query" placeholder="What would you like to do?" aria-label="Find command"><kbd>Esc</kbd></div><div id="palette-results" class="palette-results"></div>`;
  renderPalette();
  d.showModal();
  $('#palette-query').focus();
  $('#palette-query').oninput = () => {
    paletteIndex = 0;
    renderPalette();
  };
  d.onkeydown = (e) => {
    const filtered = paletteFiltered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteIndex = Math.min(filtered.length - 1, paletteIndex + 1);
      renderPalette();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteIndex = Math.max(0, paletteIndex - 1);
      renderPalette();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[paletteIndex];
      d.close();
      if (cmd) guard(cmd.run);
    }
  };
}
function paletteFiltered() {
  const query = $('#palette-query')?.value.toLowerCase() || '';
  return paletteCommands.filter((c) => c.label.toLowerCase().includes(query));
}
function renderPalette() {
  const filtered = paletteFiltered();
  $('#palette-results').innerHTML =
    filtered
      .map(
        (c, i) =>
          `<button class="palette-item ${i === paletteIndex ? 'selected' : ''}" data-action="run-palette" data-index="${i}">${icon('chevron')}<span>${esc(c.label)}</span>${c.key ? `<kbd>${c.key}</kbd>` : ''}</button>`,
      )
      .join('') || '<div class="loading-row">No matching commands.</div>';
}
async function saveAll() {
  for (const path of state.tabs) if (state.files.get(path)?.dirty) await saveFile(path);
}
async function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  await updateSettings({ theme: current === 'light' ? 'dark' : 'light' });
  if (state.view === 'settings') renderSettings();
}
function toggleBottom(tab) {
  state.bottom = tab || state.bottom;
  state.bottomOpen = !state.bottomOpen || state.bottom !== tab;
  setView('editor');
  renderBottom();
  persistSession();
}

const nativeCommands = {
  'workspace:open': () => openWorkspace(),
  'file:new': () => newFile(),
  'file:save': () => saveActive(),
  'file:saveAll': () => saveAll(),
  'file:close': () => closeFile(state.activeFile),
  'view:search': () => nav('search'),
  'view:terminal': () => toggleBottom('terminal'),
  'view:preferences': () => nav('settings'),
  'palette:open': () => openPalette(),
};
async function action(name, node) {
  const id = node?.dataset.id,
    path = node?.dataset.path;
  if (name.startsWith('nav:')) return nav(name.slice(4));
  if (name.startsWith('bottom:')) {
    state.bottom = name.slice(7);
    state.bottomOpen = true;
    setView('editor');
    renderBottom();
    return;
  }
  if (name.startsWith('suggest:')) {
    const mode = name.slice(8);
    attachContext(mode === 'review' ? 'review' : undefined);
    if (mode === 'explain')
      $('#chat-input').value =
        'Explain this code clearly, including its inputs, outputs, and important behavior.';
    return;
  }
  switch (name) {
    case 'open-workspace':
      return openWorkspace();
    case 'open-recent':
      return openWorkspace(path);
    case 'new-file':
      return newFile();
    case 'open-file':
      return openFile(path);
    case 'close-file':
      return closeFile(path);
    case 'save-file':
      return saveActive();
    case 'refresh-tree':
      return refreshTree();
    case 'tree-toggle':
      if (state.expanded.has(path)) state.expanded.delete(path);
      else {
        state.expanded.add(path);
        await refreshTree(path);
      }
      return renderSidebar();
    case 'file-menu':
      return fileMenu(path, node.dataset.kind);
    case 'recent-workspaces': {
      state.workspaces = array(await invoke('workspace:recent'));
      if (!state.workspaces.length) throw new Error('No recent workspaces yet. Choose a local folder first.');
      const r = await formDialog(
        'Reopen a recent workspace',
        `<div class="field"><label for="field-workspacePath">Workspace</label><select name="workspacePath" id="field-workspacePath">${state.workspaces.map((w) => `<option value="${attr(w.path)}">${esc(w.name || base(w.path))} · ${esc(w.path)}</option>`).join('')}</select><small>Existing files and locally retained editor buffers will be restored.</small></div>`,
        'Open workspace',
      );
      if (r) return openWorkspace(r.workspacePath);
      return;
    }
    case 'trash-list':
      return trashList();
    case 'restore-trash':
      await invoke('file:restore', { id });
      await refreshTree();
      $('#dialog').close();
      return toast('Deleted item restored.');
    case 'reload-file':
      return reloadFile();
    case 'compare-disk':
      return compareDisk();
    case 'refresh-search':
      return runSearch();
    case 'search-location': {
      const m = state.search.matches[Number(node.dataset.index)];
      return openFile(m.path, m.line, m.column);
    }
    case 'replace-search':
      return replaceSearch();
    case 'diagnostic-location': {
      const d = problems()[Number(node.dataset.index)];
      editor.setPosition({ lineNumber: d.startLineNumber, column: d.startColumn });
      editor.revealLineInCenter(d.startLineNumber);
      editor.focus();
      return;
    }
    case 'process-stop':
      if (state.activeProcess) return invoke('process:cancel', { id: state.activeProcess });
      return;
    case 'close-bottom':
      state.bottomOpen = false;
      renderBottom();
      return persistSession();
    case 'refresh-git':
      return refreshGit();
    case 'git-diff':
      return showGitDiff({ path, staged: node.dataset.staged === 'true' });
    case 'git-commit-diff':
      return showGitDiff({ commit: id });
    case 'git-stage':
      await invoke('git:stage', { paths: [path] });
      return refreshGit();
    case 'git-unstage':
      await invoke('git:unstage', { paths: [path] });
      return refreshGit();
    case 'git-stage-selected':
    case 'git-unstage-selected': {
      const selected = [...state.gitSelected].filter((path) =>
        gitEntries().some((file) => file.path === path),
      );
      if (!selected.length) throw new Error('Select files first.');
      await invoke(name === 'git-stage-selected' ? 'git:stage' : 'git:unstage', { paths: selected });
      return refreshGit();
    }
    case 'git-branches':
      return branches();
    case 'review-file':
      return attachContext('review');
    case 'attach-context':
      return attachContext();
    case 'clear-context':
      return clearContext();
    case 'new-conversation':
      return newConversation();
    case 'read-conversation':
      return readConversation(id);
    case 'rename-conversation': {
      const c = state.conversations.find((c) => c.id === id);
      const r = await formDialog(
        'Rename conversation',
        field('title', 'Conversation title', 'text', c?.title || '', '', 'required maxlength="150"'),
        'Rename',
      );
      if (r) {
        await invoke('conversations:rename', { id, title: r.title });
        await refreshHistory();
      }
      return;
    }
    case 'delete-conversation':
      if (
        await confirm(
          'Delete conversation?',
          'This removes the saved conversation from your private history.',
          'Delete',
        )
      ) {
        await invoke('conversations:delete', { id });
        if (state.conversationId === id) await newConversation();
        await refreshHistory();
      }
      return;
    case 'refresh-history':
      return refreshHistory();
    case 'cancel-ai':
      if (state.turnId) await invoke('ai:cancel', { turnId: state.turnId });
      stopSpeech();
      return;
    case 'proposal-review':
      return reviewProposal(Number(node.dataset.message), Number(node.dataset.index));
    case 'copy-message':
      await navigator.clipboard.writeText(state.messages[Number(node.dataset.index)]?.content || '');
      return toast('Message copied.');
    case 'speak-message':
      return speak(state.messages[Number(node.dataset.index)]?.content || '');
    case 'stop-speech':
      return stopSpeech();
    case 'voice':
      return voice.toggle();
    case 'vision':
      return analyzeImage();
    case 'import-document':
      return importDocument();
    case 'view-document': {
      const source = await invoke('documents:read', { id });
      return dialog({
        title: source.name,
        body: `<pre class="mono-preview">${esc(source.content || '')}</pre>`,
        wide: true,
        buttons: [{ label: 'Done', value: 'done' }],
      });
    }
    case 'delete-document':
      if (
        await confirm(
          'Delete document?',
          'This removes the source and its local retrieval content.',
          'Delete',
        )
      ) {
        await invoke('documents:delete', { id });
        await refreshDocuments();
      }
      return;
    case 'cite-document':
      $('#chat-input').value = `Use this reference excerpt (source ${id}):\n${node.dataset.text}\n\n`;
      document.body.classList.remove('assistant-hidden');
      if (innerWidth <= 1000) document.body.classList.add('assistant-mobile-open');
      $('#chat-input').focus();
      return;
    case 'new-memory':
      return editMemory();
    case 'edit-memory':
      return editMemory(id);
    case 'delete-memory':
      if (
        await confirm(
          'Delete memory?',
          'This context will no longer be supplied to future assistant requests.',
          'Delete',
        )
      ) {
        await invoke('memory:delete', { id });
        await refreshMemory();
      }
      return;
    case 'export-memory':
      return downloadJSON(
        { format: 'aurascript-memory', version: 1, memories: state.memories },
        'aurascript-memory.json',
      );
    case 'new-reminder':
      return newReminder();
    case 'complete-reminder':
      await invoke('reminders:complete', { id });
      return refreshMemory();
    case 'cancel-reminder':
      await invoke('reminders:cancel', { id });
      return refreshMemory();
    case 'new-workflow':
      return editWorkflow();
    case 'edit-workflow':
      return editWorkflow(id);
    case 'run-workflow':
      return runWorkflow(id);
    case 'delete-workflow':
      if (await confirm('Delete workflow?', 'Saved receipts remain in your activity history.', 'Delete')) {
        await invoke('workflows:delete', { id });
        await refreshWorkflows();
      }
      return;
    case 'provider-health':
      return providerHealth();
    case 'clear-key':
      if (
        await confirm(
          'Remove stored key?',
          'The selected provider key will be removed from local secure storage.',
          'Remove key',
        )
      ) {
        await invoke('secret:set', { provider: $('#secret-provider').value, key: '' });
        toast('Stored key removed.');
      }
      return;
    case 'refresh-usage':
      state.usage = await invoke('usage:get');
      return renderSettings();
    case 'export-data':
      return downloadJSON(await invoke('export:get'), 'aurascript-export.json');
    case 'import-data':
      return importData();
    case 'theme':
      return toggleTheme();
    case 'palette':
      return openPalette();
    case 'run-palette': {
      const c = paletteFiltered()[Number(node.dataset.index)];
      $('#palette').close();
      return c?.run();
    }
    case 'toggle-assistant':
      if (innerWidth <= 1000) document.body.classList.toggle('assistant-mobile-open');
      else document.body.classList.toggle('assistant-hidden');
      editor?.layout();
      return;
  }
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();
  guard(() => action(target.dataset.action, target));
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'dialog-form') return;
  e.preventDefault();
  guard(async () => {
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    switch (form.id) {
      case 'chat-form':
        return sendAI();
      case 'search-form':
        return runSearch();
      case 'terminal-form': {
        const command = $('#terminal-command').value;
        await runProcess(command);
        const input = $('#terminal-command');
        if (input) input.value = '';
        return;
      }
      case 'git-commit-form': {
        const message = $('#git-commit-message').value.trim();
        if (!message) throw new Error('Enter a commit message.');
        if (!(await confirm('Commit staged changes?', message, 'Create commit'))) return;
        await invoke('git:commit', { message });
        state.commitMessage = '';
        $('#git-commit-message').value = '';
        toast('Git commit created.');
        return refreshGit();
      }
      case 'history-search-form':
        return refreshHistory($('#history-query').value.trim());
      case 'documents-search-form':
        return searchDocuments();
      case 'provider-form':
        await updateSettings({
          provider: data.provider,
          model: data.model.trim(),
          endpoint: data.endpoint.trim(),
          maxRequests: Number(data.maxRequests),
          maxOutputTokens: Number(data.maxOutputTokens),
          think: data.think === 'true',
        });
        renderContext();
        return toast('Provider connection saved.');
      case 'secret-form':
        await invoke('secret:set', { provider: data.provider, key: data.key });
        $('#provider-key').value = '';
        return toast('API key stored securely.');
      case 'voice-settings-form':
        await updateSettings({
          voiceProvider: data.voiceProvider,
          voiceModel: data.voiceModel.trim(),
          visionModel: data.visionModel.trim(),
        });
        return toast('Voice and image settings saved.');
      case 'timezone-form':
        await updateSettings({ timezone: data.timezone.trim() });
        return toast('Reminder timezone saved.');
    }
  });
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search-query') {
    state.search.query = e.target.value;
    state.search.matches = [];
    state.search.selected.clear();
    if ($('#search-results')) $('#search-results').innerHTML = renderSearchMatches();
  }
  if (e.target.id === 'search-replacement') state.search.replacement = e.target.value;
  if (e.target.id === 'git-commit-message') state.commitMessage = e.target.value;
});
document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.id === 'search-case') {
    state.search.caseSensitive = input.checked;
    state.search.matches = [];
    state.search.selected.clear();
    if ($('#search-results')) $('#search-results').innerHTML = renderSearchMatches();
  }
  if (input.dataset.setting) {
    const name = input.dataset.setting,
      value =
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'number'
            ? Number(input.value)
            : name === 'tabSize'
              ? Number(input.value)
              : input.value;
    guard(() => updateSettings({ [name]: value }));
  }
  if (input.classList.contains('git-select')) {
    if (input.checked) state.gitSelected.add(input.dataset.path);
    else state.gitSelected.delete(input.dataset.path);
  }
  if (input.classList.contains('match-select')) {
    const index = Number(input.dataset.index);
    if (input.checked) state.search.selected.add(index);
    else state.search.selected.delete(index);
  }
  if (input.id === 'search-select-all') {
    state.search.selected = input.checked ? new Set(state.search.matches.map((_, i) => i)) : new Set();
    $('#search-results').innerHTML = renderSearchMatches();
  }
  if (input.id === 'terminal-sessions') {
    state.activeProcess = input.value;
    $('#bottom-content').innerHTML = terminalOutput();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.action === 'close-file') {
    e.preventDefault();
    guard(() => closeFile(e.target.dataset.path));
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    let run;
    if (e.key.toLowerCase() === 'k') run = openPalette;
    else if (e.key.toLowerCase() === 's') run = e.shiftKey ? saveAll : saveActive;
    else if (e.key.toLowerCase() === 'o') run = () => openWorkspace();
    else if (e.key.toLowerCase() === 'n') run = () => newFile();
    else if (e.key.toLowerCase() === 'w') run = () => closeFile(state.activeFile);
    else if (e.key.toLowerCase() === 'f' && e.shiftKey) run = () => nav('search');
    else if (e.key === '`') run = () => toggleBottom('terminal');
    else if (e.key === ',') run = () => nav('settings');
    if (run) {
      e.preventDefault();
      guard(run);
    }
  }
  if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    guard(() => sendAI());
  }
});
window.addEventListener('beforeunload', (e) => {
  flushSession();
  voice?.stop();
  stopSpeech();
  if ([...state.files.values()].some((f) => f.dirty)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('resize', () => editor?.layout());
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', applySettings);

function onEvent(event) {
  const e = event.payload ? { ...event, ...event.payload } : event;
  switch (e.type) {
    case 'ui:command':
      if (nativeCommands[e.command]) guard(nativeCommands[e.command]);
      return;
    case 'process:data': {
      const p = state.processes.get(e.id) || { id: e.id, output: [], done: false };
      p.output.push({ stream: e.stream, data: e.data || '' });
      if (p.output.length > 8000) p.output.splice(0, p.output.length - 8000);
      state.processes.set(e.id, p);
      if (!state.activeProcess) state.activeProcess = e.id;
      if (state.activeProcess === e.id && state.bottom === 'terminal' && $('#bottom-content')) {
        const content = $('#bottom-content');
        const follow = content.scrollTop + content.clientHeight >= content.scrollHeight - 50;
        content.innerHTML = terminalOutput();
        if (follow) content.scrollTop = content.scrollHeight;
      }
      return;
    }
    case 'process:exit': {
      const p = state.processes.get(e.id) || { id: e.id, output: [] };
      Object.assign(p, { done: true, code: e.code, signal: e.signal, cancelled: e.cancelled });
      state.processes.set(e.id, p);
      renderBottom();
      if (state.view === 'workflows') guard(refreshWorkflows);
      if (state.sidebar === 'git') guard(refreshGit);
      return;
    }
    case 'ai:delta': {
      if (e.conversationId !== state.conversationId && state.conversationId) return;
      const message = state.pendingAI;
      if (!message) return;
      state.turnId = e.turnId;
      state.conversationId = e.conversationId;
      message.turnId = e.turnId;
      message.content += e.text || '';
      renderAssistant();
      return;
    }
    case 'ai:done': {
      if (e.conversationId && state.conversationId && e.conversationId !== state.conversationId) return;
      if (e.turnId !== state.turnId && state.turnId) return;
      const message = state.pendingAI;
      if (message) {
        message.content = typeof e.message === 'string' ? e.message : e.message?.content || message.content;
        message.proposals = e.proposals || e.message?.proposals;
        message.streaming = false;
        message.context = message.context || [];
      }
      state.pendingAI = null;
      state.turnId = null;
      renderAssistant();
      if (state.view === 'history') guard(refreshHistory);
      return;
    }
    case 'ai:error': {
      if (e.conversationId && state.conversationId && e.conversationId !== state.conversationId) return;
      if (e.turnId !== state.turnId && state.turnId) return;
      if (state.pendingAI) {
        state.pendingAI.streaming = false;
        state.pendingAI.error = !e.cancelled;
        state.pendingAI.content +=
          (state.pendingAI.content ? '\n\n' : '') +
          (e.cancelled
            ? '[Response interrupted]'
            : e.error?.message || e.error || 'Provider generation failed.');
      }
      state.pendingAI = null;
      state.turnId = null;
      stopSpeech();
      renderAssistant();
      return;
    }
    case 'workspace:changed':
      if (e.root && state.workspace && e.root !== state.workspace) return;
      guard(async () => {
        await refreshTree();
        const f = state.files.get(state.activeFile);
        if (f) {
          try {
            const disk = await invoke('file:read', { path: f.path });
            if (disk.revision !== f.revision) {
              if (f.dirty) {
                f.external = true;
                renderToolbar();
              } else {
                f.model.setValue(disk.content);
                f.revision = disk.revision;
                f.dirty = false;
                renderTabs();
              }
            }
          } catch {
            f.external = true;
            renderToolbar();
          }
        }
      });
      return;
    case 'reminder:due':
      toast(e.reminder?.title || 'Your reminder is due.', 'warning', 0);
      if (state.view === 'memory') guard(refreshMemory);
      return;
  }
}
async function loadBootstrap(initial = true) {
  const b = await invoke('bootstrap');
  state.settings = { ...state.settings, ...b.settings };
  state.workspaces = b.workspaces || [];
  state.memories = b.memories || [];
  state.reminders = b.reminders || [];
  state.workflows = b.workflows || [];
  state.receipts = b.receipts || [];
  state.usage = b.usage || {};
  state.capabilities = b.capabilities || {};
  state.conversations = b.sessions || [];
  if (initial)
    state.workspace =
      typeof b.currentWorkspace === 'string' ? b.currentWorkspace : b.currentWorkspace?.path || null;
  applySettings();
  return b;
}
const voice = new VoiceInput({
  invoke,
  onState: (label, recording) => {
    const node = $('#voice-state');
    if (node) node.textContent = label;
    $('#voice-input')?.classList.toggle('listening', recording);
    $('#voice-meter')?.classList.toggle('hidden', !recording);
  },
  onLevel: (level) => {
    const fill = $('#voice-meter span');
    if (fill) fill.style.width = `${Math.min(100, level * 100)}%`;
  },
  onText: (text) => {
    const input = $('#chat-input');
    if (input) {
      input.value = (input.value ? `${input.value}\n` : '') + text;
      input.focus();
    }
    toast('Transcription added. Review it before sending.');
  },
  onError: (error) => toast(errorText(error), 'error', 9000),
});
async function boot() {
  try {
    if (!window.aura?.invoke) throw new Error('AuraScript must be opened in its desktop application.');
    await loadBootstrap();
    shell();
    await (window.monacoReady || Promise.resolve());
    monaco = window.monaco;
    if (!monaco)
      throw new Error('The offline editor could not load. Run the editor preparation command and relaunch.');
    defineEditor();
    unsubscribe = window.aura.onEvent(onEvent);
    const processes = array(await invoke('process:list'));
    for (const p of processes) {
      state.processes.set(p.id, {
        ...p,
        output: typeof p.output === 'string' ? [{ stream: 'stdout', data: p.output }] : p.output || [],
        done: p.status ? ['completed', 'failed', 'cancelled'].includes(p.status) : p.code !== undefined,
      });
    }
    if (processes.length) state.activeProcess = processes[0].id;
    renderBottom();
    if (state.workspace) {
      try {
        await refreshTree();
        await restoreSession();
      } catch (e) {
        toast(`Workspace unavailable: ${errorText(e)}`, 'warning');
        state.workspace = null;
        renderTabs();
        renderSidebar();
      }
    } else renderTabs();
    renderAssistant();
  } catch (e) {
    $('#app').className = 'app';
    $('#app').setAttribute('aria-busy', 'false');
    $('#app').innerHTML =
      `<div class="startup"><img src="assets/aura.svg" alt="AuraScript"><div class="error-page"><h1>AuraScript could not start.</h1><p>${esc(errorText(e))}</p><p>Open the desktop application after installing its locked dependencies and preparing the offline editor.</p></div></div>`;
  }
}
boot();

// Pointer highlights update only the floating interaction material, at most once per frame.
(() => {
  let frame = 0,
    point;
  const enabled = () =>
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.reduceMotion !== 'true';
  document.addEventListener(
    'pointermove',
    (event) => {
      if (!enabled()) return;
      const surface = event.target.closest('.glass,.topbar,.rail,.chat-composer,dialog,.header-actions');
      if (!surface) return;
      point = { surface, x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { surface, x, y } = point;
        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        surface.style.setProperty('--glass-x', `${Math.round(((x - rect.left) / rect.width) * 100)}%`);
        surface.style.setProperty('--glass-y', `${Math.round(((y - rect.top) / rect.height) * 100)}%`);
      });
    },
    { passive: true },
  );
})();
