'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('raff', {
  getAll: () => invoke('lib:getAll'),
  addBook: (book) => invoke('lib:add', book),
  updateBook: (id, patch) => invoke('lib:update', id, patch),
  removeBook: (id) => invoke('lib:remove', id),
  restoreBook: (bookOrTrashId) => invoke('lib:restore', bookOrTrashId),
  archiveBook: (id, archived = true) => invoke('lib:archive', id, archived),
  getTrash: () => invoke('lib:getTrash'),
  purgeTrash: () => invoke('lib:purgeTrash'),
  borrowCopy: (bookId, payload) => invoke('lib:borrow', bookId, payload),
  returnLoan: (bookId, loanId, returnedAt) => invoke('lib:return', bookId, loanId, returnedAt),
  returnLoanParts: (bookId, loanId, volumes, returnedAt) => invoke('lib:returnParts', bookId, loanId, volumes, returnedAt),
  setReferenceNumber: (id, ref) => invoke('lib:setRef', id, ref),
  getStats: () => invoke('lib:stats'),
  getMeta: () => invoke('lib:meta'),
  getSettings: () => invoke('lib:getSettings'),
  updateSettings: (patch) => invoke('lib:updateSettings', patch),
  getActiveLoans: (opts) => invoke('lib:getActiveLoans', opts),
  getLoanCenter: () => invoke('lib:getLoanCenter'),
  getBorrowers: () => invoke('lib:getBorrowers'),
  getActivity: (limit) => invoke('lib:getActivity', limit),
  findDuplicates: (book, excludeId) => invoke('lib:findDuplicates', book, excludeId),
  bulkUpdate: (ids, patch) => invoke('lib:bulkUpdate', ids, patch),
  applyLoanDuration: (days) => invoke('lib:applyLoanDuration', days),
  saveTablePdf: (html, fileHint, filePath) => invoke('lib:saveTablePdf', html, fileHint, filePath),
  peekNextRef: () => invoke('lib:peekNextRef'),

  exportJson: (filePath) => invoke('lib:exportJson', filePath),
  exportCsv: (filePath) => invoke('lib:exportCsv', filePath),
  exportSelectedCsv: (ids, filePath) => invoke('lib:exportSelectedCsv', ids, filePath),
  exportTxt: (filePath) => invoke('lib:exportTxt', filePath),
  exportPdf: (filePath) => invoke('lib:exportPdf', filePath),
  saveLabelsPdf: (html, titleLabel, filePath) => invoke('lib:saveLabelsPdf', html, titleLabel, filePath),
  mergeJson: (filePath) => invoke('lib:mergeJson', filePath),
  importJson: (filePath) => invoke('lib:importJson', filePath),
  restoreJson: (filePath) => invoke('lib:restoreJson', filePath),
  getRecoveryState: () => invoke('lib:getRecoveryState'),
  restoreListedBackup: (filePath) => invoke('lib:restoreListedBackup', filePath),
  resetAll: () => invoke('lib:resetAll'),
  backup: () => invoke('lib:backup'),
  integrityCheck: () => invoke('lib:integrity'),
  repairIntegrity: () => invoke('lib:repairIntegrity'),
  exportOverdueCsv: (filePath) => invoke('lib:exportOverdueCsv', filePath),

  authGetState: () => invoke('auth:getState'),
  authConfigure: (payload) => invoke('auth:configure', payload),
  authLogin: (password) => invoke('auth:login', password),
  authLogout: () => invoke('auth:logout'),
  authEnterAdmin: () => invoke('auth:enterAdmin'),
  authChangeCredentials: (payload) => invoke('auth:changeCredentials', payload),
  authUpdatePreferences: (payload) => invoke('auth:updatePreferences', payload),
  authResetPassword: (payload) => invoke('auth:resetPassword', payload),
  authRemoveProtection: () => invoke('auth:removeProtection'),
  onAuthStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auth:state', listener);
    return () => ipcRenderer.removeListener('auth:state', listener);
  },


  getFileLocations: () => invoke('fs:getLocations'),
  listDirectory: (dirPath, extensions) => invoke('fs:listDirectory', dirPath, extensions),
  pathInfo: (targetPath) => invoke('fs:pathInfo', targetPath),
  joinPath: (basePath, name) => invoke('fs:joinPath', basePath, name),
  createDirectory: (parentPath, folderName) => invoke('fs:createDirectory', parentPath, folderName),
  readImageDataUrl: (targetPath) => invoke('fs:readImageDataUrl', targetPath),
  getPrinters: () => invoke('lib:getPrinters'),
  printHtml: (html, options) => invoke('lib:printHtml', html, options),

  openExternal: (url) => invoke('app:openExternal', url),
  getVersion: () => invoke('app:getVersion'),

  minimize: () => invoke('win:minimize'),
  toggleMaximize: () => invoke('win:toggleMaximize'),
  close: () => invoke('win:close'),
  isMaximized: () => invoke('win:isMaximized'),
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('win:state', listener);
    return () => ipcRenderer.removeListener('win:state', listener);
  },
});
