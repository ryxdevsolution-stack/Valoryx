const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Printing (unchanged)
  silentPrint: (html, printerName) => ipcRenderer.invoke('silent-print', html, printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setDefaultPrinter: (printerName) => ipcRenderer.invoke('set-default-printer', printerName),

  // App info (unchanged)
  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  isElectron: true,

  // Startup progress IPC
  // App.tsx is the single source of truth for these events.
  // ElectronSplash receives status as a prop — it does NOT register its own listener.
  onStartupStatus: (callback) =>
    ipcRenderer.on('startup-status', (_event, data) => callback(data)),
  removeStartupStatus: () =>
    ipcRenderer.removeAllListeners('startup-status'),
});

console.log('[Preload] Context bridge initialized');
