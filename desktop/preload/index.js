/**
 * Preload Script
 * Provides secure bridge between renderer and main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Define the API to expose to the renderer
const electronAPI = {
    // System Information
    system: {
        getVersion: () => ipcRenderer.invoke('get-app-version'),
        getEnvironmentInfo: () => ipcRenderer.invoke('get-environment-info'),
        getApiUrl: () => ipcRenderer.invoke('get-api-url'),
        getAppConfig: () => ipcRenderer.invoke('get-app-config'),
        getPlatform: () => ipcRenderer.invoke('get-platform'),
        getAppPath: (pathName) => ipcRenderer.invoke('get-app-path', pathName)
    },

    // File Operations
    file: {
        selectFile: (options) => ipcRenderer.invoke('select-file', options),
        selectFiles: (options) => ipcRenderer.invoke('select-files', options),
        saveFile: (options) => ipcRenderer.invoke('save-file', options),
        readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
        writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
        selectFolder: () => ipcRenderer.invoke('select-folder'),
        showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
        openExternal: (url) => ipcRenderer.invoke('open-external', url)
    },

    // Service Management
    service: {
        getStatus: (serviceName) => ipcRenderer.invoke('get-service-status', serviceName),
        restart: (serviceName) => ipcRenderer.invoke('restart-service', serviceName),
        stop: (serviceName) => ipcRenderer.invoke('stop-service', serviceName),
        start: (serviceName) => ipcRenderer.invoke('start-service', serviceName)
    },

    // Printing
    printer: {
        getPrinters: () => ipcRenderer.invoke('get-printers'),
        print: (options) => ipcRenderer.invoke('print', options),
        printToPDF: (options) => ipcRenderer.invoke('print-to-pdf', options)
    },

    // Application Control
    app: {
        quit: () => ipcRenderer.invoke('quit-app'),
        restart: () => ipcRenderer.invoke('restart-app'),
        clearCache: () => ipcRenderer.invoke('clear-cache')
    },

    // Window Control
    window: {
        minimize: () => ipcRenderer.invoke('minimize-window'),
        maximize: () => ipcRenderer.invoke('maximize-window'),
        close: () => ipcRenderer.invoke('close-window'),
        toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
        toggleDevTools: () => ipcRenderer.invoke('toggle-devtools')
    },

    // Dialog
    dialog: {
        showMessage: (options) => ipcRenderer.invoke('show-message', options),
        showError: (title, content) => ipcRenderer.invoke('show-error', title, content)
    },

    // Navigation
    navigation: {
        navigate: (path) => ipcRenderer.invoke('navigate', path),
        goBack: () => ipcRenderer.invoke('go-back'),
        goForward: () => ipcRenderer.invoke('go-forward'),
        refresh: () => ipcRenderer.invoke('refresh')
    },

    // Database
    database: {
        check: () => ipcRenderer.invoke('check-database'),
        switchMode: (useLocal) => ipcRenderer.invoke('switch-database-mode', useLocal),
        sync: () => ipcRenderer.invoke('sync-database')
    },

    // Event listeners (from main to renderer)
    on: (channel, callback) => {
        const validChannels = [
            'navigate',
            'fullscreen-change',
            'window-focus',
            'show-about',
            'service-status-update',
            'database-sync-complete',
            'update-available',
            'update-downloaded'
        ];

        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender`
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);

            // Return unsubscribe function
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }

        console.warn(`Invalid channel: ${channel}`);
        return () => {};
    },

    // One-time event listeners
    once: (channel, callback) => {
        const validChannels = [
            'app-ready',
            'services-ready'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, (event, ...args) => callback(...args));
        } else {
            console.warn(`Invalid channel for once: ${channel}`);
        }
    },

    // Remove all listeners for a channel
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Also expose a flag to indicate Electron environment
contextBridge.exposeInMainWorld('isElectron', true);

// Log that preload script has loaded
console.log('Preload script loaded successfully');

// Notify when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    // Send ready signal to main process
    ipcRenderer.send('renderer-ready');

    // Add platform class to body for platform-specific styling
    ipcRenderer.invoke('get-platform').then(platform => {
        document.body.classList.add(`platform-${platform}`);
    });
});