const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isDev = process.argv.includes('--dev');
const DEV_URL = 'http://127.0.0.1:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'Budget Tracker',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1422' : '#F6F0E4',
    autoHideMenuBar: true,
    // No native title bar: the page draws a macOS-style one with its own window buttons.
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Tell the page when the window is focused or maximized, for the title bar buttons.
  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send('win:state', { maximized: win.isMaximized(), focused: win.isFocused() });
  };
  for (const ev of ['maximize', 'unmaximize', 'focus', 'blur', 'enter-full-screen', 'leave-full-screen']) win.on(ev, sendState);
  win.webContents.on('did-finish-load', sendState);

  // Links to websites open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!isDev) {
    win.webContents.on('will-navigate', (event) => event.preventDefault());
  }

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.on('win:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === 'close') win.close();
});

ipcMain.handle('save-file', async (event, args) => {
  const name = typeof args?.name === 'string' ? path.basename(args.name) : 'export.txt';
  const content = typeof args?.content === 'string' ? args.content : '';
  const ext = path.extname(name).slice(1) || 'txt';
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, 'utf8');
  return result.filePath;
});

ipcMain.handle('open-file', async (event, args) => {
  const exts = Array.isArray(args?.exts)
    ? args.exts.filter((e) => typeof e === 'string' && /^[a-z0-9]+$/i.test(e))
    : [];
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: exts.length ? [{ name: exts.join(', ').toUpperCase(), extensions: exts }] : [],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  const stat = await fs.stat(file);
  if (stat.size > 50 * 1024 * 1024) throw new Error('File is larger than 50 MB.');
  const content = await fs.readFile(file, 'utf8');
  return { name: path.basename(file), content };
});

// Live prices. Only these public, key-free price services may be contacted, and only
// coin ids / ticker symbols are sent — never amounts or anything else from your data.
const PRICE_HOSTS = new Set([
  'api.coingecko.com', // crypto prices and search
  'query1.finance.yahoo.com', // stock / ETF prices and search
  'query2.finance.yahoo.com',
  'open.er-api.com', // currency exchange rates
]);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BudgetTracker/1.0';

ipcMain.handle('fetch-json', async (_event, rawUrl) => {
  const url = new URL(String(rawUrl));
  if (url.protocol !== 'https:' || !PRICE_HOSTS.has(url.hostname)) throw new Error(`Blocked request to ${url.hostname}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
    if (res.status === 429) throw new Error('The price service is busy (rate limit). Try again in a minute.');
    if (!res.ok) throw new Error(`Price service answered ${res.status}.`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The price service did not answer in time.');
    if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') throw new Error('No internet connection.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
});

// ---------- Auto-update ----------
// Installed copies check GitHub Releases (see "publish" in package.json), download a newer
// version in the background and install it on restart. Dev runs never check.
let updateState = { status: 'idle', version: app.getVersion() };

function sendUpdate(patch) {
  updateState = { ...updateState, ...patch };
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update:state', updateState);
}

function setupUpdater() {
  if (!app.isPackaged) {
    updateState = { status: 'dev', version: app.getVersion() };
    return null;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking', error: undefined }));
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => sendUpdate({ status: 'downloading', next: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ status: 'ready', next: info.version }));
  autoUpdater.on('error', (err) => sendUpdate({ status: 'error', error: friendlyUpdateError(err) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000);
  return { check, install: () => autoUpdater.quitAndInstall() };
}

function friendlyUpdateError(err) {
  const msg = String(err?.message || err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/.test(msg)) return 'No internet connection.';
  if (/404/.test(msg)) return 'No published release found yet.';
  return msg.split('\n')[0].slice(0, 200);
}

let updater = null;
ipcMain.handle('update:get', () => updateState);
ipcMain.handle('update:check', () => {
  if (updater) updater.check();
  return updateState;
});
ipcMain.on('update:install', () => updater?.install());

app.whenReady().then(() => {
  createWindow();
  updater = setupUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
