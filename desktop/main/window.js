/**
 * Window Manager
 * Handles creation and management of application windows
 */

const { BrowserWindow } = require('electron');
const path = require('path');
const { APP_CONFIG } = require('../utils/config');

class WindowManager {
    constructor() {
        this.windows = new Map();
        this.mainWindowId = null;
    }

    /**
     * Create the main application window
     */
    async createMainWindow() {
        // Window configuration
        const windowConfig = {
            width: APP_CONFIG.window.width,
            height: APP_CONFIG.window.height,
            minWidth: APP_CONFIG.window.minWidth,
            minHeight: APP_CONFIG.window.minHeight,
            title: APP_CONFIG.app.name,
            webPreferences: {
                nodeIntegration: APP_CONFIG.security.nodeIntegration,
                contextIsolation: APP_CONFIG.security.contextIsolation,
                webSecurity: APP_CONFIG.security.webSecurity,
                preload: path.join(__dirname, '../preload/index.js')
            },
            show: false, // Don't show until ready
            center: true,
            backgroundColor: '#ffffff',
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            autoHideMenuBar: false
        };

        // Set icon based on platform
        const iconPath = this.getIconPath();
        if (iconPath) {
            windowConfig.icon = iconPath;
        }

        // Create window
        const window = new BrowserWindow(windowConfig);

        // Store window reference
        this.mainWindowId = window.id;
        this.windows.set(window.id, window);

        // Load the application
        const startUrl = APP_CONFIG.frontend.url;
        console.log(`Loading application from: ${startUrl}`);

        try {
            await window.loadURL(startUrl);
        } catch (error) {
            console.error('Failed to load application:', error);
            // Try again after a delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            await window.loadURL(startUrl);
        }

        // Window event handlers
        this.setupWindowEvents(window);

        // Show window when ready
        window.once('ready-to-show', () => {
            if (APP_CONFIG.window.startMaximized) {
                window.maximize();
            }
            window.show();

            // Open DevTools in development
            if (APP_CONFIG.window.showDevTools) {
                window.webContents.openDevTools();
            }
        });

        // Handle window navigation
        this.setupNavigationHandlers(window);

        return window;
    }

    /**
     * Set up window event handlers
     */
    setupWindowEvents(window) {
        // Handle window closed
        window.on('closed', () => {
            this.windows.delete(window.id);
            if (window.id === this.mainWindowId) {
                this.mainWindowId = null;
            }
        });

        // Prevent external navigation
        window.webContents.on('will-navigate', (event, url) => {
            const appUrl = APP_CONFIG.frontend.url;
            if (!url.startsWith(appUrl) && !url.startsWith('http://localhost')) {
                event.preventDefault();
                require('electron').shell.openExternal(url);
            }
        });

        // Handle new window requests
        window.webContents.setWindowOpenHandler((details) => {
            require('electron').shell.openExternal(details.url);
            return { action: 'deny' };
        });

        // Handle page title updates
        window.on('page-title-updated', (event, title) => {
            event.preventDefault();
            window.setTitle(`${title} - ${APP_CONFIG.app.name}`);
        });

        // Handle fullscreen changes
        window.on('enter-full-screen', () => {
            window.webContents.send('fullscreen-change', true);
        });

        window.on('leave-full-screen', () => {
            window.webContents.send('fullscreen-change', false);
        });

        // Handle focus events
        window.on('focus', () => {
            window.webContents.send('window-focus', true);
        });

        window.on('blur', () => {
            window.webContents.send('window-focus', false);
        });
    }

    /**
     * Set up navigation handlers
     */
    setupNavigationHandlers(window) {
        // Handle navigation requests from renderer
        const { ipcMain } = require('electron');

        ipcMain.handle('navigate', (event, path) => {
            const url = `${APP_CONFIG.frontend.url}${path}`;
            window.loadURL(url);
            return true;
        });

        // Handle back/forward navigation
        ipcMain.handle('go-back', () => {
            if (window.webContents.canGoBack()) {
                window.webContents.goBack();
                return true;
            }
            return false;
        });

        ipcMain.handle('go-forward', () => {
            if (window.webContents.canGoForward()) {
                window.webContents.goForward();
                return true;
            }
            return false;
        });

        // Handle refresh
        ipcMain.handle('refresh', () => {
            window.webContents.reload();
            return true;
        });
    }

    /**
     * Get the appropriate icon path for the platform
     */
    getIconPath() {
        const iconDir = path.join(__dirname, '../resources/icons');

        if (process.platform === 'win32') {
            const iconPath = path.join(iconDir, 'icon.ico');
            if (require('fs').existsSync(iconPath)) {
                return iconPath;
            }
        } else if (process.platform === 'darwin') {
            const iconPath = path.join(iconDir, 'icon.icns');
            if (require('fs').existsSync(iconPath)) {
                return iconPath;
            }
        } else {
            // Linux and others
            const iconPath = path.join(iconDir, 'icon.png');
            if (require('fs').existsSync(iconPath)) {
                return iconPath;
            }
        }

        // Fallback to frontend public directory
        const publicIconPath = path.join(APP_CONFIG.paths.frontend, 'public', 'icon.png');
        if (require('fs').existsSync(publicIconPath)) {
            return publicIconPath;
        }

        return null;
    }

    /**
     * Get the main window
     */
    getMainWindow() {
        if (this.mainWindowId) {
            return this.windows.get(this.mainWindowId);
        }
        return null;
    }

    /**
     * Create a secondary window
     */
    createSecondaryWindow(options = {}) {
        const defaultOptions = {
            width: 800,
            height: 600,
            parent: this.getMainWindow(),
            modal: false,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload/index.js')
            }
        };

        const windowConfig = { ...defaultOptions, ...options };
        const window = new BrowserWindow(windowConfig);

        this.windows.set(window.id, window);

        window.on('closed', () => {
            this.windows.delete(window.id);
        });

        return window;
    }

    /**
     * Get all windows
     */
    getAllWindows() {
        return Array.from(this.windows.values());
    }

    /**
     * Close all windows
     */
    closeAllWindows() {
        this.windows.forEach(window => {
            if (!window.isDestroyed()) {
                window.close();
            }
        });
        this.windows.clear();
    }

    /**
     * Focus the main window
     */
    focusMainWindow() {
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    }
}

module.exports = WindowManager;