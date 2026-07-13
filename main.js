'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./src/js/store');

let mainWindow = null;
let store = null;

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
      sandbox: false,
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
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));

  // ---- IPC: Library data ----
  ipcMain.handle('lib:getAll', () => store.getAll());
  ipcMain.handle('lib:add', (_e, book) => store.addBook(book));
  ipcMain.handle('lib:update', (_e, id, patch) => store.updateBook(id, patch));
  ipcMain.handle('lib:remove', (_e, id) => store.removeBook(id));
  ipcMain.handle('lib:restore', (_e, book) => store.restoreBook(book));
  ipcMain.handle('lib:borrow', (_e, bookId, payload) => store.borrowCopy(bookId, payload));
  ipcMain.handle('lib:return', (_e, bookId, loanId, returnedAt) => store.returnLoan(bookId, loanId, returnedAt));
  ipcMain.handle('lib:returnParts', (_e, bookId, loanId, volumes, returnedAt) => store.returnLoanParts(bookId, loanId, volumes, returnedAt));
  ipcMain.handle('lib:setRef', (_e, id, ref) => store.setReferenceNumber(id, ref));
  ipcMain.handle('lib:stats', () => store.getStats());
  ipcMain.handle('lib:meta', () => store.getMeta());
  ipcMain.handle('lib:getSettings', () => store.getSettings());
  ipcMain.handle('lib:updateSettings', (_e, patch) => store.updateSettings(patch));
  ipcMain.handle('lib:getActiveLoans', (_e, opts) => store.getActiveLoans(opts || {}));
  ipcMain.handle('lib:applyLoanDuration', (_e, days) => store.applyLoanDurationToOpenLoans(days));
  ipcMain.handle('lib:peekNextRef', () => store.peekNextReferenceNumber());

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

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
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

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
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

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
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
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
