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
            show: true, // Show immediately
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

        // Load the application with retry logic
        const startUrl = APP_CONFIG.frontend.url;
        console.log(`[WINDOW] Loading application from: ${startUrl}`);

        const MAX_RETRIES = 3;
        const RETRY_DELAY = 2000;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[WINDOW] Load attempt ${attempt}/${MAX_RETRIES}...`);
                await window.loadURL(startUrl);
                console.log(`[WINDOW] Successfully loaded on attempt ${attempt}`);
                break;
            } catch (error) {
                console.error(`[WINDOW] Failed to load (attempt ${attempt}):`, error.message);

                if (attempt === MAX_RETRIES) {
                    console.error('[WINDOW] All load attempts failed');
                    throw new Error(`Failed to load application after ${MAX_RETRIES} attempts. Frontend may not be running. URL: ${startUrl}`);
                }

                console.log(`[WINDOW] Retrying in ${RETRY_DELAY}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
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
        const resourcesDir = path.join(__dirname, '../resources');
        const fs = require('fs');

        // Check for platform-specific icon in resources directory
        if (process.platform === 'win32') {
            const iconPath = path.join(resourcesDir, 'icon.ico');
            if (fs.existsSync(iconPath)) {
                return iconPath;
            }
        } else if (process.platform === 'darwin') {
            const iconPath = path.join(resourcesDir, 'icon.icns');
            if (fs.existsSync(iconPath)) {
                return iconPath;
            }
        }

        // Default to PNG icon (works on Linux and as fallback)
        const pngIconPath = path.join(resourcesDir, 'icon.png');
        if (fs.existsSync(pngIconPath)) {
            return pngIconPath;
        }

        // Fallback to frontend public directory
        const publicIconPath = path.join(APP_CONFIG.paths.frontend, 'public', 'icon.png');
        if (fs.existsSync(publicIconPath)) {
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