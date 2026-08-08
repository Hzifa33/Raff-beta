'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./src/js/store');
const AuthStore = require('./src/js/auth-store');

let mainWindow = null;
let store = null;
let auth = null;

const ADMIN_REQUIRED = Object.freeze({ ok: false, code: 'ADMIN_REQUIRED', error: 'هذه العملية تتطلب وضع الإدارة' });

function cloneAdminRequired() { return { ...ADMIN_REQUIRED }; }
function safeText(value, max = 240) { return (value ?? '').toString().slice(0, max); }
function isSafeHttps(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch (_) { return false; }
}

function sendAuthState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('auth:state', auth.getState());
}

function adminOnly(handler) {
  return async (event, ...args) => {
    if (!auth || !auth.isAdmin()) return cloneAdminRequired();
    try { return await handler(event, ...args); }
    catch (err) { return { ok: false, error: err?.message || 'حدث خطأ غير متوقع' }; }
  };
}

function preparePrintHtml(html) {
  const source = safeText(html, 5 * 1024 * 1024);
  if (!source.trim()) throw new Error('محتوى الطباعة فارغ');
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; font-src data: file:;">`;
  if (/content-security-policy/i.test(source)) return source;
  return source.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
}

const LABEL_FIT_SCRIPT = `(() => {
  const labels = [...document.querySelectorAll('.label')];
  const fits = (label) => label.scrollHeight <= label.clientHeight + 0.5 && label.scrollWidth <= label.clientWidth + 0.5;

  for (const label of labels) {
    const textNodes = [...label.querySelectorAll('.l-inst,.l-title,.l-ref,.l-meta span,.l-micro')];
    const barcodeBox = label.querySelector('.l-barcode');
    const barcodeSvg = label.querySelector('.l-barcode svg');
    const labelStyle = getComputedStyle(label);
    const base = {
      fontSizes: textNodes.map((node) => parseFloat(getComputedStyle(node).fontSize) || 6),
      gap: parseFloat(labelStyle.rowGap || labelStyle.gap) || 2.5,
      paddingTop: parseFloat(labelStyle.paddingTop) || 5,
      paddingRight: parseFloat(labelStyle.paddingRight) || 5,
      paddingBottom: parseFloat(labelStyle.paddingBottom) || 5,
      paddingLeft: parseFloat(labelStyle.paddingLeft) || 5,
      barcodeHeight: barcodeSvg ? (barcodeSvg.getBoundingClientRect().height || parseFloat(getComputedStyle(barcodeSvg).maxHeight) || 38) : 0,
      barcodeMinHeight: barcodeBox ? (parseFloat(getComputedStyle(barcodeBox).minHeight) || 12) : 0,
    };

    const applyScale = (scale) => {
      textNodes.forEach((node, index) => {
        node.style.fontSize = Math.max(0.02, base.fontSizes[index] * scale).toFixed(3) + 'px';
      });
      label.style.gap = Math.max(0.05, base.gap * scale).toFixed(3) + 'px';
      label.style.paddingTop = Math.max(0.12, base.paddingTop * scale).toFixed(3) + 'px';
      label.style.paddingRight = Math.max(0.12, base.paddingRight * scale).toFixed(3) + 'px';
      label.style.paddingBottom = Math.max(0.12, base.paddingBottom * scale).toFixed(3) + 'px';
      label.style.paddingLeft = Math.max(0.12, base.paddingLeft * scale).toFixed(3) + 'px';
      if (barcodeSvg) barcodeSvg.style.maxHeight = Math.max(1.2, base.barcodeHeight * scale).toFixed(3) + 'px';
      if (barcodeBox) barcodeBox.style.minHeight = Math.max(0.8, base.barcodeMinHeight * scale).toFixed(3) + 'px';
    };

    if (fits(label)) continue;

    // Find the largest scale that keeps every character inside its label.
    // The very small lower bound is intentional: full data is preferred over
    // ellipsis, clipping, or silently removing metadata.
    let low = 0.003;
    let high = 1;
    let best = low;
    applyScale(low);
    for (let i = 0; i < 22; i += 1) {
      const middle = (low + high) / 2;
      applyScale(middle);
      if (fits(label)) {
        best = middle;
        low = middle;
      } else {
        high = middle;
      }
    }
    applyScale(best);
    label.dataset.fitScale = best.toFixed(4);
  }
  return labels.length;
})()`;

async function loadPrintableWindow(html, { fitLabels = false } = {}) {
  const tmpHtmlPath = path.join(app.getPath('temp'), `raff-print-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpHtmlPath, preparePrintHtml(html), 'utf8');
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: !!fitLabels,
      webSecurity: true,
    },
  });
  await printWin.loadFile(tmpHtmlPath);
  if (fitLabels) await printWin.webContents.executeJavaScript(LABEL_FIT_SCRIPT, true);
  return { printWin, tmpHtmlPath };
}

async function renderHtmlToPdf({ html, filePath, landscape, delay = 0, fitLabels = false }) {
  const { printWin, tmpHtmlPath } = await loadPrintableWindow(html, { fitLabels });
  try {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const pdfBuffer = await printWin.webContents.printToPDF({
      landscape: !!landscape,
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok: true, filePath };
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
    fs.unlink(tmpHtmlPath, () => {});
  }
}

async function printHtmlSilently({ html, deviceName, copies = 1, landscape = false, fitLabels = false }) {
  const { printWin, tmpHtmlPath } = await loadPrintableWindow(html, { fitLabels });
  try {
    return await new Promise((resolve) => {
      printWin.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: safeText(deviceName, 512) || undefined,
        copies: Math.min(99, Math.max(1, Number(copies) || 1)),
        landscape: !!landscape,
        pageSize: 'A4',
        margins: { marginType: 'none' },
      }, (success, failureReason) => {
        resolve(success ? { ok: true } : { ok: false, error: failureReason || 'تعذرت الطباعة' });
      });
    });
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
    fs.unlink(tmpHtmlPath, () => {});
  }
}

function ensureExtension(filePath, extension) {
  const ext = `.${String(extension || '').replace(/^\./, '').toLowerCase()}`;
  const resolved = path.resolve(safeText(filePath, 4096));
  if (!resolved || resolved === path.parse(resolved).root) throw new Error('اختر اسم ملف صالحًا');
  return resolved.toLowerCase().endsWith(ext) ? resolved : `${resolved}${ext}`;
}

function assertReadableFile(filePath, extension) {
  const resolved = path.resolve(safeText(filePath, 4096));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error('الملف المحدد غير موجود');
  if (extension && path.extname(resolved).toLowerCase() !== `.${extension.replace(/^\./, '').toLowerCase()}`) {
    throw new Error(`اختر ملفًا بصيغة ${extension.toUpperCase()}`);
  }
  return resolved;
}

function listDriveRoots() {
  if (process.platform !== 'win32') return [{ label: '/', path: '/', kind: 'drive' }];
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try { if (fs.existsSync(root)) roots.push({ label: root, path: root, kind: 'drive' }); } catch (_) {}
  }
  return roots;
}

function fileLocations() {
  const candidates = [
    { label: 'سطح المكتب', path: app.getPath('desktop'), kind: 'desktop' },
    { label: 'المستندات', path: app.getPath('documents'), kind: 'documents' },
    { label: 'التنزيلات', path: app.getPath('downloads'), kind: 'downloads' },
    { label: 'المجلد الشخصي', path: app.getPath('home'), kind: 'home' },
    { label: 'بيانات رَفّ', path: store?.dataDir?.() || app.getPath('userData'), kind: 'raff' },
    ...listDriveRoots(),
  ];
  const seen = new Set();
  return candidates.filter((item) => {
    const key = path.resolve(item.path).toLowerCase();
    if (seen.has(key) || !fs.existsSync(item.path)) return false;
    seen.add(key);
    return true;
  });
}

function listDirectory(dirPath, extensions = []) {
  const resolved = path.resolve(safeText(dirPath, 4096) || app.getPath('documents'));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error('المجلد غير موجود أو لا يمكن الوصول إليه');
  const allowed = new Set((extensions || []).map((x) => `.${String(x).replace(/^\./, '').toLowerCase()}`));
  const items = fs.readdirSync(resolved, { withFileTypes: true }).map((entry) => {
    const fullPath = path.join(resolved, entry.name);
    let stat = null;
    try { stat = fs.statSync(fullPath); } catch (_) {}
    return {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      size: stat?.size || 0,
      modifiedAt: stat?.mtime?.toISOString?.() || '',
    };
  }).filter((item) => item.isDirectory || !allowed.size || allowed.has(path.extname(item.name).toLowerCase()))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, 'ar'));
  const parsed = path.parse(resolved);
  return {
    ok: true,
    currentPath: resolved,
    parentPath: resolved === parsed.root ? null : path.dirname(resolved),
    separator: path.sep,
    items,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#2B1B12',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  Menu.setApplicationMenu(null);
  const appFile = path.join(__dirname, 'src', 'index.html');
  mainWindow.loadFile(appFile);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    sendAuthState();
  });

  const sendState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('win:state', { maximized: mainWindow.isMaximized() });
    }
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttps(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function registerIpc() {
  // Public-safe reads. In search mode the renderer never receives borrower
  // names, contacts, notes, data paths, or archived records.
  ipcMain.handle('lib:getAll', () => auth.isAdmin() ? store.getAll() : store.getPublicBooks());
  ipcMain.handle('lib:stats', () => store.getStats());
  ipcMain.handle('lib:meta', () => auth.isAdmin() ? store.getMeta() : store.getPublicMeta());
  ipcMain.handle('lib:getSettings', () => auth.isAdmin() ? store.getSettings() : store.getPublicSettings());

  // Catalogue and circulation mutations are enforced here, not merely hidden
  // in the interface, so public mode cannot write through devtools or IPC.
  ipcMain.handle('lib:add', adminOnly((_e, book) => store.addBook(book || {})));
  ipcMain.handle('lib:update', adminOnly((_e, id, patch) => store.updateBook(safeText(id, 100), patch || {})));
  ipcMain.handle('lib:remove', adminOnly((_e, id) => store.removeBook(safeText(id, 100))));
  ipcMain.handle('lib:restore', adminOnly((_e, bookOrTrashId) => store.restoreBook(bookOrTrashId)));
  ipcMain.handle('lib:archive', adminOnly((_e, id, archived) => store.archiveBook(safeText(id, 100), archived !== false)));
  ipcMain.handle('lib:getTrash', adminOnly(() => ({ ok: true, items: store.getTrash() })));
  ipcMain.handle('lib:purgeTrash', adminOnly(() => ({ ok: true, ...store.purgeTrash() })));
  ipcMain.handle('lib:borrow', adminOnly((_e, bookId, payload) => store.borrowCopy(safeText(bookId, 100), payload || {})));
  ipcMain.handle('lib:return', adminOnly((_e, bookId, loanId, returnedAt) => store.returnLoan(safeText(bookId, 100), safeText(loanId, 100), returnedAt)));
  ipcMain.handle('lib:returnParts', adminOnly((_e, bookId, loanId, volumes, returnedAt) => store.returnLoanParts(safeText(bookId, 100), safeText(loanId, 100), volumes, returnedAt)));
  ipcMain.handle('lib:setRef', adminOnly((_e, id, ref) => store.setReferenceNumber(safeText(id, 100), safeText(ref, 120))));
  ipcMain.handle('lib:updateSettings', adminOnly((_e, patch) => store.updateSettings(patch || {})));
  ipcMain.handle('lib:getActiveLoans', adminOnly((_e, opts) => store.getActiveLoans(opts || {})));
  ipcMain.handle('lib:getLoanCenter', adminOnly(() => ({ ok: true, loans: store.getLoanCenter() })));
  ipcMain.handle('lib:getBorrowers', adminOnly(() => ({ ok: true, borrowers: store.getBorrowersDirectory() })));
  ipcMain.handle('lib:getActivity', adminOnly((_e, limit) => ({ ok: true, activity: store.getActivity(limit) })));
  ipcMain.handle('lib:findDuplicates', adminOnly((_e, book, excludeId) => ({ ok: true, matches: store.findPossibleDuplicates(book || {}, excludeId || null) })));
  ipcMain.handle('lib:bulkUpdate', adminOnly((_e, ids, patch) => ({ ok: true, ...store.bulkUpdate(ids, patch || {}) })));
  ipcMain.handle('lib:applyLoanDuration', adminOnly((_e, days) => store.applyLoanDurationToOpenLoans(days)));
  ipcMain.handle('lib:peekNextRef', adminOnly(() => store.peekNextReferenceNumber()));

  // Custom in-app file browser. No native Windows open/save dialog is used.
  ipcMain.handle('fs:getLocations', adminOnly(() => ({ ok: true, locations: fileLocations(), separator: path.sep })));
  ipcMain.handle('fs:listDirectory', adminOnly((_e, dirPath, extensions) => listDirectory(dirPath, extensions)));
  ipcMain.handle('fs:pathInfo', adminOnly((_e, targetPath) => {
    const resolved = path.resolve(safeText(targetPath, 4096));
    if (!fs.existsSync(resolved)) return { ok: true, exists: false, path: resolved };
    const stat = fs.statSync(resolved);
    return { ok: true, exists: true, path: resolved, isDirectory: stat.isDirectory(), size: stat.size, modifiedAt: stat.mtime.toISOString() };
  }));
  ipcMain.handle('fs:joinPath', adminOnly((_e, basePath, name) => ({ ok: true, path: path.join(path.resolve(safeText(basePath, 4096)), safeText(name, 260)) })));
  ipcMain.handle('fs:createDirectory', adminOnly((_e, parentPath, folderName) => {
    const cleanName = safeText(folderName, 120).trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!cleanName || cleanName === '.' || cleanName === '..') return { ok: false, error: 'اكتب اسم مجلد صالحًا' };
    const target = path.join(path.resolve(safeText(parentPath, 4096)), cleanName);
    fs.mkdirSync(target, { recursive: false });
    return { ok: true, path: target };
  }));
  ipcMain.handle('fs:readImageDataUrl', adminOnly((_e, targetPath) => {
    const filePath = assertReadableFile(targetPath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext];
    if (!mime) return { ok: false, error: 'اختر صورة PNG أو JPG أو WebP أو SVG' };
    const stat = fs.statSync(filePath);
    if (stat.size > 500 * 1024) return { ok: false, error: 'حجم الشعار أكبر من 500 كيلوبايت' };
    let buffer = fs.readFileSync(filePath);
    if (ext === '.svg') {
      const sanitized = buffer.toString('utf8')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
        .replace(/(?:href|xlink:href)\s*=\s*("|')(?!data:|#)[\s\S]*?\1/gi, '');
      buffer = Buffer.from(sanitized, 'utf8');
    }
    return { ok: true, dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, name: path.basename(filePath) };
  }));

  // Backups and exports receive paths chosen in the custom in-app browser.
  ipcMain.handle('lib:exportJson', adminOnly((_e, targetPath) => {
    const filePath = ensureExtension(targetPath, 'json');
    store.exportJson(filePath);
    return { ok: true, filePath };
  }));

  ipcMain.handle('lib:exportCsv', adminOnly((_e, targetPath) => {
    const filePath = ensureExtension(targetPath, 'csv');
    store.exportCsv(filePath);
    return { ok: true, filePath };
  }));

  ipcMain.handle('lib:exportSelectedCsv', adminOnly((_e, ids, targetPath) => {
    const filePath = ensureExtension(targetPath, 'csv');
    return { ok: true, filePath, ...store.exportSelectedCsv(filePath, ids) };
  }));

  ipcMain.handle('lib:exportTxt', adminOnly((_e, targetPath) => {
    const filePath = ensureExtension(targetPath, 'txt');
    store.exportTxt(filePath);
    return { ok: true, filePath };
  }));

  ipcMain.handle('lib:exportPdf', adminOnly(async (_e, targetPath) => {
    const filePath = ensureExtension(targetPath, 'pdf');
    return renderHtmlToPdf({ html: store.buildPrintableHtml(), filePath, landscape: true });
  }));

  ipcMain.handle('lib:saveLabelsPdf', adminOnly(async (_e, html, _titleLabel, targetPath) => {
    const filePath = ensureExtension(targetPath, 'pdf');
    return renderHtmlToPdf({ html, filePath, landscape: false, delay: 100, fitLabels: true });
  }));

  ipcMain.handle('lib:saveTablePdf', adminOnly(async (_e, html, _fileHint, targetPath) => {
    const filePath = ensureExtension(targetPath, 'pdf');
    return renderHtmlToPdf({ html, filePath, landscape: true, delay: 80 });
  }));

  ipcMain.handle('lib:mergeJson', adminOnly((_e, targetPath) => {
    const filePath = assertReadableFile(targetPath, 'json');
    return { ok: true, ...store.mergeJson(filePath) };
  }));

  ipcMain.handle('lib:importJson', adminOnly((_e, targetPath) => {
    const filePath = assertReadableFile(targetPath, 'json');
    return { ok: true, ...store.mergeJson(filePath) };
  }));

  ipcMain.handle('lib:restoreJson', adminOnly((_e, targetPath) => {
    const filePath = assertReadableFile(targetPath, 'json');
    return { ok: true, ...store.restoreJson(filePath) };
  }));

  ipcMain.handle('lib:getPrinters', adminOnly(async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return { ok: true, printers: printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: !!p.isDefault,
      status: p.status,
    })) };
  }));

  ipcMain.handle('lib:printHtml', adminOnly(async (_e, html, options) => printHtmlSilently({
    html,
    deviceName: options?.deviceName,
    copies: options?.copies,
    landscape: options?.landscape,
    fitLabels: options?.fitLabels,
  })));

  ipcMain.handle('lib:getRecoveryState', adminOnly(() => ({ ok: true, ...store.getRecoveryState() })));
  ipcMain.handle('lib:restoreListedBackup', adminOnly((_e, filePath) => {
    const backupsDir = path.resolve(store.dataDir(), 'backups') + path.sep;
    const resolved = path.resolve(safeText(filePath, 2048));
    if (!resolved.startsWith(backupsDir)) return { ok: false, error: 'مسار النسخة الاحتياطية غير صالح' };
    return { ok: true, ...store.restoreBackupFile(resolved) };
  }));

  ipcMain.handle('lib:resetAll', adminOnly(() => ({ ok: true, ...store.resetAll() })));
  ipcMain.handle('lib:backup', adminOnly(() => ({ ok: true, filePath: store.createBackup('manual') })));
  ipcMain.handle('lib:integrity', adminOnly(() => ({ ok: true, report: store.integrityCheck() })));
  ipcMain.handle('lib:repairIntegrity', adminOnly(() => ({ ok: true, result: store.repairIntegrity() })));
  ipcMain.handle('lib:exportOverdueCsv', adminOnly((_e, targetPath) => {
    const filePath = ensureExtension(targetPath, 'csv');
    return { ok: true, filePath, ...store.exportOverdueCsv(filePath) };
  }));

  // Authentication and mode management.
  ipcMain.handle('auth:getState', () => auth.getState());
  ipcMain.handle('auth:configure', (_e, payload) => {
    if (auth.getState().configured && !auth.isAdmin()) return cloneAdminRequired();
    try {
      const state = auth.configure(payload || {});
      sendAuthState();
      return { ok: true, state };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('auth:login', (_e, password) => {
    const result = auth.login(safeText(password, 256));
    if (result.ok) sendAuthState();
    return result;
  });
  ipcMain.handle('auth:logout', () => {
    const state = auth.logout();
    sendAuthState();
    return { ok: true, state };
  });
  ipcMain.handle('auth:enterAdmin', () => {
    const result = auth.enterAdminWithoutPassword();
    if (result.ok) sendAuthState();
    return result;
  });
  ipcMain.handle('auth:changeCredentials', adminOnly((_e, payload) => ({ ok: true, state: auth.changeCredentials(payload || {}) })));
  ipcMain.handle('auth:updatePreferences', adminOnly((_e, payload) => ({ ok: true, state: auth.updatePreferences(payload || {}) })));
  ipcMain.handle('auth:resetPassword', (_e, payload) => {
    const result = auth.resetPassword(payload || {});
    if (result.ok) sendAuthState();
    return result;
  });
  ipcMain.handle('auth:removeProtection', adminOnly(() => ({ ok: true, state: auth.removeProtection() })));

  ipcMain.handle('app:openExternal', (_e, url) => {
    if (isSafeHttps(url)) void shell.openExternal(url);
    return { ok: isSafeHttps(url) };
  });
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('win:close', () => mainWindow && mainWindow.close());
  ipcMain.handle('win:isMaximized', () => !!mainWindow && mainWindow.isMaximized());
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  auth = new AuthStore(app.getPath('userData'));
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
