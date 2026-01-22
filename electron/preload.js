const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Listen for update status
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, status) => callback(status));
  },

  // Remove listener
  removeUpdateListener: () => {
    ipcRenderer.removeAllListeners('update-status');
  },

  // Printing functions
  silentPrint: (html, printerName) => ipcRenderer.invoke('silent-print', html, printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setDefaultPrinter: (printerName) => ipcRenderer.invoke('set-default-printer', printerName),

  // App info
  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  isElectron: true
});

console.log('[Preload] Context bridge initialized');
