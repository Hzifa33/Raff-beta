'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raff', {
  getAll: () => ipcRenderer.invoke('lib:getAll'),
  addBook: (book) => ipcRenderer.invoke('lib:add', book),
  updateBook: (id, patch) => ipcRenderer.invoke('lib:update', id, patch),
  removeBook: (id) => ipcRenderer.invoke('lib:remove', id),
  restoreBook: (book) => ipcRenderer.invoke('lib:restore', book),
  borrowCopy: (bookId, payload) => ipcRenderer.invoke('lib:borrow', bookId, payload),
  returnLoan: (bookId, loanId, returnedAt) => ipcRenderer.invoke('lib:return', bookId, loanId, returnedAt),
  returnLoanParts: (bookId, loanId, volumes, returnedAt) => ipcRenderer.invoke('lib:returnParts', bookId, loanId, volumes, returnedAt),
  setReferenceNumber: (id, ref) => ipcRenderer.invoke('lib:setRef', id, ref),
  getStats: () => ipcRenderer.invoke('lib:stats'),
  getMeta: () => ipcRenderer.invoke('lib:meta'),
  getSettings: () => ipcRenderer.invoke('lib:getSettings'),
  updateSettings: (patch) => ipcRenderer.invoke('lib:updateSettings', patch),
  getActiveLoans: (opts) => ipcRenderer.invoke('lib:getActiveLoans', opts),
  applyLoanDuration: (days) => ipcRenderer.invoke('lib:applyLoanDuration', days),
  saveTablePdf: (html, fileHint) => ipcRenderer.invoke('lib:saveTablePdf', html, fileHint),
  peekNextRef: () => ipcRenderer.invoke('lib:peekNextRef'),

  exportJson: () => ipcRenderer.invoke('lib:exportJson'),
  exportCsv: () => ipcRenderer.invoke('lib:exportCsv'),
  exportTxt: () => ipcRenderer.invoke('lib:exportTxt'),
  exportPdf: () => ipcRenderer.invoke('lib:exportPdf'),
  saveLabelsPdf: (html, titleLabel) => ipcRenderer.invoke('lib:saveLabelsPdf', html, titleLabel),
  importJson: () => ipcRenderer.invoke('lib:importJson'),
  resetAll: () => ipcRenderer.invoke('lib:resetAll'),
  backup: () => ipcRenderer.invoke('lib:backup'),
  integrityCheck: () => ipcRenderer.invoke('lib:integrity'),
  openDataFolder: () => ipcRenderer.invoke('lib:openDataFolder'),
  exportOverdueCsv: () => ipcRenderer.invoke('lib:exportOverdueCsv'),

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Window controls for the custom, in-app title bar.
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('win:state', (_e, state) => callback(state));
  },
});
