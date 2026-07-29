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

  // Desktop Google OAuth: open the cloud web login in the system browser, and
  // receive the signed assertion that comes back via the valoryx:// deep link.
  loginWithGoogle: () => ipcRenderer.invoke('oauth-google-open'),
  onDesktopOAuth: (callback) =>
    ipcRenderer.on('desktop-oauth', (_event, handoff) => callback(handoff)),
  removeDesktopOAuth: () =>
    ipcRenderer.removeAllListeners('desktop-oauth'),
  getPendingOAuth: () => ipcRenderer.invoke('oauth-get-pending'),
  // Manual fallback when the deep link never arrives: exchange a code the user
  // pasted from the browser for the same {assertion, verifier} handoff.
  redeemOAuthCode: (code) => ipcRenderer.invoke('oauth-redeem-code', code),
});

console.log('[Preload] Context bridge initialized');
