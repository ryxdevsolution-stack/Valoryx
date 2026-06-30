const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Printing (unchanged)
  silentPrint: (html, printerName) => ipcRenderer.invoke('silent-print', html, printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setDefaultPrinter: (printerName) => ipcRenderer.invoke('set-default-printer', printerName),

  // App info
  isElectron: true,

  // Startup progress IPC
  // App.tsx is the single source of truth for these events.
  // ElectronSplash receives status as a prop — it does NOT register its own listener.
  onStartupStatus: (callback) =>
    ipcRenderer.on('startup-status', (_event, data) => callback(data)),
  removeStartupStatus: () =>
    ipcRenderer.removeAllListeners('startup-status'),
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),

  // Auto-update IPC
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, data) => callback(data)),
  removeUpdateStatus: () =>
    ipcRenderer.removeAllListeners('update-status'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Forced logout: quit the app when the account is taken over on another till.
  quitApp: () => ipcRenderer.invoke('quit-app'),
});

console.log('[Preload] Context bridge initialized');
