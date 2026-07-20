'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./src/js/store');
const RaffV4Store = require('./src/js/raff-v4-store');
const LocalOpacServer = require('./src/js/local-opac-server');

let mainWindow = null;
let store = null;
let v4Store = null;
let localOpac = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#2B1B12',
    show: false,
    frame: false,              // native chrome replaced by the in-app title bar
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Keep the in-app maximize/restore icon in sync with the real window state,
  // including changes the user makes by dragging or double-clicking.
  const sendState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('win:state', { maximized: mainWindow.isMaximized() });
    }
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);

  // Any external link (like the developer credit) opens in the OS browser,
  // never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(parsed.toString());
    } catch (_) {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  v4Store = new RaffV4Store(store);
  localOpac = new LocalOpacServer(() => v4Store.snapshot());

  // ---- IPC: Library data ----
  ipcMain.handle('lib:getAll', () => store.getAll());
  const syncAfter = (permission, fn) => (...args) => {
    v4Store._assertPermission(permission);
    const result = fn(...args);
    v4Store.syncLegacy({ audit: false });
    store._save();
    return result;
  };
  ipcMain.handle('lib:add', (_e, book) => syncAfter('records:*', (x) => store.addBook(x))(book));
  ipcMain.handle('lib:update', (_e, id, patch) => syncAfter('records:*', (a, b) => store.updateBook(a, b))(id, patch));
  ipcMain.handle('lib:remove', (_e, id) => syncAfter('records:*', (x) => store.removeBook(x))(id));
  ipcMain.handle('lib:restore', (_e, book) => syncAfter('records:*', (x) => store.restoreBook(x))(book));
  ipcMain.handle('lib:borrow', (_e, bookId, payload) => syncAfter('circulation:*', (a, b) => store.borrowCopy(a, b))(bookId, payload));
  ipcMain.handle('lib:return', (_e, bookId, loanId, returnedAt) => syncAfter('circulation:*', (a, b, c) => store.returnLoan(a, b, c))(bookId, loanId, returnedAt));
  ipcMain.handle('lib:returnParts', (_e, bookId, loanId, volumes, returnedAt) => syncAfter('circulation:*', (a, b, c, d) => store.returnLoanParts(a, b, c, d))(bookId, loanId, volumes, returnedAt));
  ipcMain.handle('lib:setRef', (_e, id, ref) => syncAfter('records:*', (a, b) => store.setReferenceNumber(a, b))(id, ref));
  ipcMain.handle('lib:stats', () => store.getStats());
  ipcMain.handle('lib:meta', () => store.getMeta());
  ipcMain.handle('lib:getSettings', () => store.getSettings());
  ipcMain.handle('lib:updateSettings', (_e, patch) => store.updateSettings(patch));
  ipcMain.handle('lib:getActiveLoans', (_e, opts) => store.getActiveLoans(opts || {}));
  ipcMain.handle('lib:applyLoanDuration', (_e, days) => store.applyLoanDurationToOpenLoans(days));
  ipcMain.handle('lib:peekNextRef', () => store.peekNextReferenceNumber());


  // ---- IPC: Raff 4 offline domain ----
  const v4Call = (method, ...args) => {
    if (!v4Store || typeof v4Store[method] !== 'function') throw new Error('عملية رَفّ 4 غير متاحة');
    return v4Store[method](...args);
  };
  ipcMain.handle('v4:snapshot', () => v4Call('snapshot'));
  ipcMain.handle('v4:getEntity', (_e, entity) => v4Call('getEntity', entity));
  ipcMain.handle('v4:createEntity', (_e, entity, payload) => v4Call('createEntity', entity, payload));
  ipcMain.handle('v4:updateEntity', (_e, entity, id, patch) => v4Call('updateEntity', entity, id, patch));
  ipcMain.handle('v4:deleteEntity', (_e, entity, id, reason) => v4Call('deleteEntity', entity, id, reason));
  ipcMain.handle('v4:restoreTrash', (_e, id) => v4Call('restoreTrash', id));
  ipcMain.handle('v4:purgeTrash', (_e, id) => v4Call('purgeTrash', id));
  ipcMain.handle('v4:createRecord', (_e, payload) => v4Call('createRecord', payload));
  ipcMain.handle('v4:updateRecord', (_e, id, patch) => v4Call('updateRecord', id, patch));
  ipcMain.handle('v4:addItems', (_e, id, payload) => v4Call('addItems', id, payload));
  ipcMain.handle('v4:updateItem', (_e, id, patch) => v4Call('updateItem', id, patch));
  ipcMain.handle('v4:checkout', (_e, payload) => v4Call('checkout', payload));
  ipcMain.handle('v4:returnItems', (_e, payload) => v4Call('returnItems', payload));
  ipcMain.handle('v4:renewLoan', (_e, id, payload) => v4Call('renewLoan', id, payload));
  ipcMain.handle('v4:placeHold', (_e, payload) => v4Call('placeHold', payload));
  ipcMain.handle('v4:updateHoldStatus', (_e, id, status) => v4Call('updateHoldStatus', id, status));
  ipcMain.handle('v4:startInventory', (_e, payload) => v4Call('startInventory', payload));
  ipcMain.handle('v4:scanInventory', (_e, id, code) => v4Call('scanInventory', id, code));
  ipcMain.handle('v4:closeInventory', (_e, id) => v4Call('closeInventory', id));
  ipcMain.handle('v4:createTransfer', (_e, payload) => v4Call('createTransfer', payload));
  ipcMain.handle('v4:receiveTransfer', (_e, id, payload) => v4Call('receiveTransfer', id, payload || {}));
  ipcMain.handle('v4:cancelTransfer', (_e, id, reason) => v4Call('cancelTransfer', id, reason || ''));
  ipcMain.handle('v4:refreshNotifications', () => v4Call('refreshNotifications'));
  ipcMain.handle('v4:markNotification', (_e, id, read) => v4Call('markNotification', id, read));
  ipcMain.handle('v4:markAllNotifications', (_e, read) => v4Call('markAllNotifications', read));
  ipcMain.handle('v4:bulkUpdateRecords', (_e, ids, patch) => v4Call('bulkUpdateRecords', ids, patch));
  ipcMain.handle('v4:mergeAuthorities', (_e, keeper, duplicates) => v4Call('mergeAuthorities', keeper, duplicates));
  ipcMain.handle('v4:validateIsbn', (_e, value) => v4Call('validateIsbn', value));
  ipcMain.handle('v4:search', (_e, query, filters) => v4Call('search', query, filters || {}));
  ipcMain.handle('v4:setSettings', (_e, patch) => v4Call('setSettings', patch));
  ipcMain.handle('v4:authenticateUser', (_e, id, pin) => v4Call('authenticateUser', id, pin));
  ipcMain.handle('v4:auditLog', (_e, filters) => v4Call('auditLog', filters || {}));
  ipcMain.handle('v4:createSnapshot', (_e, reason) => v4Call('createSnapshot', reason));
  ipcMain.handle('v4:listBackups', () => v4Call('listBackups'));
  ipcMain.handle('v4:restoreBackup', (_e, name) => v4Call('restoreBackup', name));
  ipcMain.handle('v4:integrity', () => v4Call('integrityReport'));
  ipcMain.handle('v4:repairSafe', () => v4Call('repairSafe'));
  ipcMain.handle('v4:opacStart', (_e, options) => localOpac.start(options || {}));
  ipcMain.handle('v4:opacStop', () => localOpac.stop());
  ipcMain.handle('v4:opacStatus', () => localOpac.status());

  ipcMain.handle('v4:exportMarc', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير MARCXML', defaultPath: `raff-marc-${new Date().toISOString().slice(0, 10)}.xml`,
      filters: [{ name: 'MARCXML', extensions: ['xml'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportMarcXml'), 'utf8');
    return { ok: true, filePath };
  });
  ipcMain.handle('v4:importMarc', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد MARCXML', filters: [{ name: 'MARCXML', extensions: ['xml', 'marcxml'] }], properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    const xml = fs.readFileSync(filePaths[0], 'utf8');
    return { ok: true, ...v4Call('importMarcXml', xml) };
  });
  ipcMain.handle('v4:exportMarcIso', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير MARC 21 ISO 2709', defaultPath: `raff-marc-${new Date().toISOString().slice(0, 10)}.mrc`,
      filters: [{ name: 'MARC ISO 2709', extensions: ['mrc', 'marc'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportMarcIso2709')); return { ok: true, filePath };
  });
  ipcMain.handle('v4:importMarcIso', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد MARC 21 ISO 2709', filters: [{ name: 'MARC ISO 2709', extensions: ['mrc', 'marc'] }], properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    return { ok: true, ...v4Call('importMarcIso2709', fs.readFileSync(filePaths[0])) };
  });
  ipcMain.handle('v4:exportDublinCore', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير Dublin Core XML', defaultPath: `raff-dublin-core-${new Date().toISOString().slice(0, 10)}.xml`,
      filters: [{ name: 'Dublin Core XML', extensions: ['xml'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportDublinCore'), 'utf8'); return { ok: true, filePath };
  });
  ipcMain.handle('v4:exportJsonLd', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير JSON-LD', defaultPath: `raff-jsonld-${new Date().toISOString().slice(0, 10)}.jsonld`,
      filters: [{ name: 'JSON-LD', extensions: ['jsonld', 'json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportJsonLd'), 'utf8'); return { ok: true, filePath };
  });
  ipcMain.handle('v4:importBibTex', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد BibTeX', filters: [{ name: 'BibTeX', extensions: ['bib'] }], properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    return { ok: true, ...v4Call('importBibTex', fs.readFileSync(filePaths[0], 'utf8')) };
  });
  ipcMain.handle('v4:importRis', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد RIS', filters: [{ name: 'RIS', extensions: ['ris'] }], properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    return { ok: true, ...v4Call('importRis', fs.readFileSync(filePaths[0], 'utf8')) };
  });

  ipcMain.handle('v4:exportBibTex', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير BibTeX', defaultPath: `raff-library-${new Date().toISOString().slice(0, 10)}.bib`,
      filters: [{ name: 'BibTeX', extensions: ['bib'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportBibTex'), 'utf8'); return { ok: true, filePath };
  });
  ipcMain.handle('v4:exportRis', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير RIS', defaultPath: `raff-library-${new Date().toISOString().slice(0, 10)}.ris`,
      filters: [{ name: 'RIS', extensions: ['ris'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, v4Call('exportRis'), 'utf8'); return { ok: true, filePath };
  });
  ipcMain.handle('v4:exportTransfer', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير حزمة نقل محلية', defaultPath: `raff-transfer-${new Date().toISOString().slice(0, 10)}.raff4.json`,
      filters: [{ name: 'Raff Offline Transfer', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, JSON.stringify(v4Call('exportTransferPackage'), null, 2), 'utf8'); return { ok: true, filePath };
  });
  ipcMain.handle('v4:importTransfer', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد حزمة نقل محلية', filters: [{ name: 'Raff Offline Transfer', extensions: ['json'] }], properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    const payload = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    return { ok: true, result: v4Call('importTransferPackage', payload) };
  });

  // ---- IPC: Backup / restore ----
  ipcMain.handle('lib:exportJson', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ نسخة احتياطية',
      defaultPath: `raff-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    store.exportJson(filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle('lib:exportCsv', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير كملف CSV',
      defaultPath: `raff-library-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false };
    store.exportCsv(filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle('lib:exportTxt', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير كملف نصي',
      defaultPath: `raff-library-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (canceled || !filePath) return { ok: false };
    store.exportTxt(filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle('lib:exportPdf', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير كملف PDF',
      defaultPath: `raff-library-${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false };

    const html = store.buildPrintableHtml();
    const tmpHtmlPath = path.join(app.getPath('temp'), `raff-print-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html, 'utf-8');

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await printWin.loadFile(tmpHtmlPath);
      const pdfBuffer = await printWin.webContents.printToPDF({
        landscape: true,
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      printWin.destroy();
      fs.unlink(tmpHtmlPath, () => {});
    }
  });

  ipcMain.handle('lib:saveLabelsPdf', async (_e, html, titleLabel) => {
    const safeName = (titleLabel || 'ملصقات').toString().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ الملصقات كملف PDF',
      defaultPath: `raff-labels-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const tmpHtmlPath = path.join(app.getPath('temp'), `raff-labels-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html, 'utf-8');

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await printWin.loadFile(tmpHtmlPath);
      // Give inline SVG barcodes and the logo a moment to lay out.
      await new Promise((r) => setTimeout(r, 250));
      const pdfBuffer = await printWin.webContents.printToPDF({
        landscape: false,
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' },
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      printWin.destroy();
      fs.unlink(tmpHtmlPath, () => {});
    }
  });

  // Generic "save a prepared HTML table as PDF" — used for borrowers, overdue
  // borrowers, and each report category. The renderer builds branded HTML; we
  // just render it to a landscape A4 PDF and save it.
  ipcMain.handle('lib:saveTablePdf', async (_e, html, fileHint) => {
    const safeName = (fileHint || 'تقرير').toString().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ كملف PDF',
      defaultPath: `raff-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const tmpHtmlPath = path.join(app.getPath('temp'), `raff-table-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html, 'utf-8');

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await printWin.loadFile(tmpHtmlPath);
      await new Promise((r) => setTimeout(r, 200));
      const pdfBuffer = await printWin.webContents.printToPDF({
        landscape: true,
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' },
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      printWin.destroy();
      fs.unlink(tmpHtmlPath, () => {});
    }
  });

  ipcMain.handle('lib:importJson', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'استيراد نسخة احتياطية',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false };
    try {
      const result = store.importJson(filePaths[0]);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lib:resetAll', () => {
    const result = store.resetAll();
    return { ok: true, ...result };
  });

  ipcMain.handle('lib:backup', () => {
    try {
      const file = store.createBackup('manual');
      return { ok: true, filePath: file };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lib:integrity', () => {
    try {
      return { ok: true, report: store.integrityCheck() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lib:repairIntegrity', () => {
    try {
      return { ok: true, result: store.repairIntegrity() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lib:openDataFolder', async () => {
    try {
      await shell.openPath(store.dataDir());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lib:exportOverdueCsv', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير الإعارات المتأخرة',
      defaultPath: `raff-overdue-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false };
    const result = store.exportOverdueCsv(filePath);
    return { ok: true, filePath, ...result };
  });

  ipcMain.handle('app:openExternal', (_e, url) => {
    try {
      const parsed = new URL(String(url));
      if (['https:', 'http:'].includes(parsed.protocol)) shell.openExternal(parsed.toString());
    } catch (_) {}
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  // ---- IPC: custom window controls ----
  ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('win:close', () => mainWindow && mainWindow.close());
  ipcMain.handle('win:isMaximized', () => !!mainWindow && mainWindow.isMaximized());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    if (v4Store?.a?.settings?.backupOnClose) store.createBackup('on-close-v4');
  } catch (_) {}
  try { if (localOpac?.server) localOpac.server.close(); } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
