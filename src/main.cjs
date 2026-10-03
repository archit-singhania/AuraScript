'use strict';
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Menu,
  safeStorage,
  session,
  Notification,
  nativeTheme,
  shell,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { trustedFrame, validateInvocation, publicAsset, publicError } = require('./security.cjs');
const { AppService } = require('./services/app-service.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aura',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);
if (process.platform === 'win32') app.setAppUserModelId('com.architsinghania.aurascript.studio');
app.setPath(
  'userData',
  process.env.AURA_TEST_DATA
    ? path.resolve(process.env.AURA_TEST_DATA)
    : path.join(app.getPath('appData'), 'AuraScriptStudio'),
);
let window,
  service,
  shuttingDown = false,
  microphoneGranted = false;
const headless = process.env.AURA_HEADLESS === '1';
if (!headless && !app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
const appRoot = __dirname;
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; media-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-src 'none'";

function send(event) {
  if (shuttingDown) return;
  if (window && !window.isDestroyed()) window.webContents.send('aura:event', event);
  if (event.type === 'reminder:due' && !headless && Notification.isSupported()) {
    new Notification({
      title: 'AuraScript reminder',
      body: String(event.text || event.reminder?.title || 'A reminder is due.').slice(0, 240),
      silent: false,
    }).show();
  }
}

function encryptedStorageAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  );
}

function applyNativeTheme(settings) {
  if (!['light', 'dark', 'system'].includes(settings?.theme)) return;
  nativeTheme.themeSource = settings.theme;
  window?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#11131d' : '#eeedf4');
}

function menu() {
  const command = (name) => () => send({ type: 'ui:command', command: name });
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open workspace…', accelerator: 'CmdOrCtrl+Shift+O', click: command('workspace:open') },
        { label: 'New file…', accelerator: 'CmdOrCtrl+N', click: command('file:new') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: command('file:save') },
        { label: 'Save all', accelerator: 'CmdOrCtrl+Shift+S', click: command('file:saveAll') },
        { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: command('file:close') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: command('view:preferences') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command palette', accelerator: 'CmdOrCtrl+Shift+P', click: command('palette:open') },
        { label: 'Search workspace', accelerator: 'CmdOrCtrl+Shift+F', click: command('view:search') },
        { label: 'Terminal', accelerator: 'CmdOrCtrl+`', click: command('view:terminal') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Manual testing guide',
          click: async () => {
            const guide = app.isPackaged
              ? path.join(process.resourcesPath, 'guides/docs/MANUAL-TESTING.md')
              : path.join(__dirname, '../docs/MANUAL-TESTING.md');
            const error = await shell.openPath(guide);
            if (error)
              await dialog.showMessageBox(window, {
                type: 'info',
                title: 'Manual guide',
                message: 'Open this guide in your preferred text editor.',
                detail: guide,
              });
          },
        },
        {
          label: 'About AuraScript',
          click: () =>
            dialog.showMessageBox(window, {
              type: 'info',
              title: 'AuraScript',
              message: 'AuraScript ' + app.getVersion(),
              detail:
                'A private coding workspace. Local file, terminal and Git operations run only from your selected project. AI providers and voice require explicit setup.',
            }),
        },
      ],
    },
  ]);
}

app
  .whenReady()
  .then(async () => {
    protocol.handle('aura', async (request) => {
      try {
        const file = publicAsset(appRoot, request.url);
        const response = await net.fetch(pathToFileURL(file).toString());
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CSP);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, headers });
      } catch {
        return new Response('Application asset unavailable.', {
          status: 404,
          headers: { 'Content-Type': 'text/plain', 'Content-Security-Policy': CSP },
        });
      }
    });
    window = new BrowserWindow({
      width: 1500,
      height: 960,
      minWidth: 860,
      minHeight: 620,
      title: 'AuraScript',
      icon: path.join(__dirname, '../assets/icon.png'),
      show: !headless,
      backgroundColor: '#11131d',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        offscreen: headless,
        backgroundThrottling: !headless,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('aura://app/renderer/')) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const trusted =
        contents === window?.webContents && details.requestingUrl?.startsWith('aura://app/renderer/');
      if (!trusted || permission !== 'media') return callback(false);
      if (details.mediaTypes?.some((type) => type !== 'audio')) return callback(false);
      if (headless) return callback(false);
      dialog
        .showMessageBox(window, {
          type: 'question',
          title: 'Allow microphone',
          message: 'Use your microphone for this voice request?',
          detail: 'Audio is transcribed only by the provider you configured.',
          buttons: ['Cancel', 'Allow'],
          defaultId: 0,
          cancelId: 0,
        })
        .then((result) => {
          microphoneGranted = result.response === 1;
          callback(microphoneGranted);
        })
        .catch(() => callback(false));
    });
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, requestingOrigin, details) =>
        !headless &&
        microphoneGranted &&
        contents === window?.webContents &&
        permission === 'media' &&
        requestingOrigin === 'aura://app' &&
        details?.mediaType !== 'video',
    );
    window.webContents.on('will-prevent-unload', (event) => {
      const answer = dialog.showMessageBoxSync(window, {
        type: 'question',
        title: 'Unsaved changes',
        message: 'Some files have unsaved edits.',
        detail: 'Keep editing to save them before closing.',
        buttons: ['Keep editing', 'Close anyway'],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer === 1) event.preventDefault();
    });
    service = new AppService({
      userDataDir: app.getPath('userData'),
      emit: send,
      chooseFolder: async () => {
        const result = await dialog.showOpenDialog(window, {
          title: 'Open a workspace',
          properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0];
      },
      chooseImage: async () => {
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        return result.canceled ? null : result.filePaths[0];
      },
      chooseSaveFile: async () => {
        const result = await dialog.showSaveDialog(window, {
          defaultPath: 'aurascript-workspace.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        return result.canceled ? null : result.filePath;
      },
      sealSecret: (text) => {
        if (!encryptedStorageAvailable())
          throw new Error(
            'Secure operating-system key storage is unavailable. Configure a provider through its environment variable instead.',
          );
        return safeStorage.encryptString(text).toString('base64');
      },
      openSecret: (text) => {
        if (!encryptedStorageAvailable())
          throw new Error('Secure operating-system key storage is unavailable.');
        return safeStorage.decryptString(Buffer.from(text, 'base64'));
      },
    });
    applyNativeTheme(await service.invoke('settings:get', {}));
    ipcMain.handle('aura:invoke', async (event, method, payload) => {
      try {
        if (!trustedFrame(event, window.webContents))
          throw Object.assign(new Error('This request is outside the application boundary.'), {
            code: 'FORBIDDEN',
          });
        validateInvocation(method, payload);
        if (method === 'workspace:open' && payload?.path) {
          const recent = await service.invoke('workspace:recent', {});
          const items = Array.isArray(recent) ? recent : recent.workspaces || recent.items || [];
          const normalize = (value) => {
            const resolved = path.resolve(value);
            return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
          };
          const allowed = items.some(
            (item) =>
              normalize(typeof item === 'string' ? item : item.path || item.root || '') ===
              normalize(payload.path),
          );
          if (!allowed)
            throw Object.assign(new Error('Choose a new workspace through the folder picker.'), {
              code: 'FORBIDDEN',
            });
        }
        const data = await service.invoke(method, payload || {});
        if (method === 'settings:update') applyNativeTheme(data.settings || data);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    });
    Menu.setApplicationMenu(menu());
    await window.loadURL('aura://app/renderer/index.html');
    if (process.argv.includes('--dev') && !headless) window.webContents.openDevTools({ mode: 'detach' });
    if (process.env.AURA_READY_FILE)
      await fs.writeFile(
        process.env.AURA_READY_FILE,
        JSON.stringify({ ready: true, version: app.getVersion() }),
      );
  })
  .catch((error) => {
    console.error('AuraScript startup failed:', error.message);
    app.exit(1);
  });
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  Promise.resolve()
    .then(() => service?.dispose?.())
    .catch(() => {})
    .finally(() => app.exit(0));
}
app.on('window-all-closed', shutdown);
app.on('before-quit', (event) => {
  if (shuttingDown) return;
  if (window && !window.isDestroyed()) {
    // Close first so cancelling the unsaved-changes dialog keeps services alive.
    event.preventDefault();
    window.close();
  } else {
    event.preventDefault();
    shutdown();
  }
});
