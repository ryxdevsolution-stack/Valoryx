/**
 * IPC Communication Handlers
 * Handles communication between main and renderer processes
 */

const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { APP_CONFIG, ConfigUtils } = require('../utils/config');

// Track if handlers are already registered and store mainWindow reference
let handlersRegistered = false;
let currentMainWindow = null;

/**
 * Setup all IPC handlers
 * Can be called multiple times - first call registers handlers, subsequent calls update mainWindow
 */
function setupIPC(mainWindow, serviceManager) {
    // Always update the mainWindow reference
    currentMainWindow = mainWindow;

    // Only register handlers once to avoid "already registered" errors
    if (handlersRegistered) {
        console.log('IPC handlers already registered, updated mainWindow reference');
        return;
    }

    // System information handlers
    setupSystemHandlers();

    // File operation handlers (use getter for mainWindow)
    setupFileHandlers();

    // Service management handlers
    setupServiceHandlers(serviceManager);

    // Printer handlers (use getter for mainWindow)
    setupPrinterHandlers();

    // Application handlers (use getter for mainWindow)
    setupAppHandlers();

    // Database handlers
    setupDatabaseHandlers();

    // Navigation handlers
    setupNavigationHandlers();

    handlersRegistered = true;
    console.log('IPC handlers initialized');
}

/**
 * Get current main window (may be null during startup)
 */
function getMainWindow() {
    return currentMainWindow;
}

/**
 * Validate file path to prevent unauthorized file access
 * Only allows access to user data directory and user-selected files via dialog
 */
function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return false;
    }

    const normalizedPath = path.normalize(path.resolve(filePath));

    // Get allowed directories
    const allowedDirs = [
        app.getPath('userData'),      // App data directory
        app.getPath('documents'),     // User documents
        app.getPath('downloads'),     // Downloads folder
        app.getPath('desktop'),       // Desktop
        app.getPath('temp'),          // Temp files
    ];

    // Check if path is within allowed directories
    // Use path separator to prevent prefix bypass (e.g., /documents_malicious)
    return allowedDirs.some(dir => {
        const normalizedDir = path.normalize(dir);
        const dirWithSep = normalizedDir.endsWith(path.sep) ? normalizedDir : normalizedDir + path.sep;
        return normalizedPath === normalizedDir || normalizedPath.startsWith(dirWithSep);
    });
}

/**
 * System information handlers
 */
function setupSystemHandlers() {
    // Get application version
    ipcMain.handle('get-app-version', () => {
        return APP_CONFIG.app.version;
    });

    // Get environment info
    ipcMain.handle('get-environment-info', () => {
        return ConfigUtils.getEnvironmentInfo();
    });

    // Get API URL
    ipcMain.handle('get-api-url', () => {
        return ConfigUtils.getApiUrl();
    });

    // Get app configuration
    ipcMain.handle('get-app-config', () => {
        return {
            app: APP_CONFIG.app,
            isDevelopment: APP_CONFIG.isDevelopment,
            backend: {
                url: APP_CONFIG.backend.url
            },
            frontend: {
                url: APP_CONFIG.frontend.url
            },
            printing: APP_CONFIG.printing,
            database: APP_CONFIG.database
        };
    });

    // Get platform info
    ipcMain.handle('get-platform', () => {
        return process.platform;
    });
}

/**
 * File operation handlers
 */
function setupFileHandlers() {
    // Open file dialog
    ipcMain.handle('select-file', async (event, options = {}) => {
        const mainWindow = getMainWindow();
        const defaultOptions = {
            properties: ['openFile'],
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        };

        const dialogOptions = { ...defaultOptions, ...options };
        const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Open multiple files dialog
    ipcMain.handle('select-files', async (event, options = {}) => {
        const mainWindow = getMainWindow();
        const defaultOptions = {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        };

        const dialogOptions = { ...defaultOptions, ...options };
        const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

        if (result.canceled) {
            return [];
        }

        return result.filePaths;
    });

    // Save file dialog
    ipcMain.handle('save-file', async (event, options = {}) => {
        const mainWindow = getMainWindow();
        const defaultOptions = {
            defaultPath: options.defaultName || 'untitled',
            filters: options.filters || [
                { name: 'All Files', extensions: ['*'] }
            ]
        };

        const result = await dialog.showSaveDialog(mainWindow, defaultOptions);

        if (result.canceled) {
            return null;
        }

        // If content is provided, write it to the file
        if (options.content !== undefined) {
            try {
                await fs.writeFile(result.filePath, options.content, 'utf-8');
                return result.filePath;
            } catch (error) {
                console.error('Error writing file:', error);
                throw error;
            }
        }

        return result.filePath;
    });

    // Read file content (with path validation)
    ipcMain.handle('read-file', async (event, filePath) => {
        // Validate path to prevent unauthorized access
        if (!isPathAllowed(filePath)) {
            console.warn('[IPC] Blocked unauthorized file read:', filePath);
            throw new Error('Access denied: File path not in allowed directories');
        }
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });

    // Write file content (with path validation)
    ipcMain.handle('write-file', async (event, filePath, content) => {
        // Validate path to prevent unauthorized access
        if (!isPathAllowed(filePath)) {
            console.warn('[IPC] Blocked unauthorized file write:', filePath);
            throw new Error('Access denied: File path not in allowed directories');
        }
        try {
            await fs.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('Error writing file:', error);
            throw error;
        }
    });

    // Open folder dialog
    ipcMain.handle('select-folder', async () => {
        const mainWindow = getMainWindow();
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Open path in file explorer
    ipcMain.handle('show-in-folder', (event, filePath) => {
        shell.showItemInFolder(filePath);
        return true;
    });

    // Open external URL
    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url);
        return true;
    });
}

/**
 * Service management handlers
 */
function setupServiceHandlers(serviceManager) {
    // Get service status
    ipcMain.handle('get-service-status', (event, serviceName) => {
        if (serviceName) {
            return serviceManager.getServiceStatus(serviceName);
        }
        return serviceManager.getAllStatuses();
    });

    // Restart service
    ipcMain.handle('restart-service', async (event, serviceName) => {
        try {
            await serviceManager.restartService(serviceName);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Stop service
    ipcMain.handle('stop-service', async (event, serviceName) => {
        try {
            await serviceManager.stopService(serviceName);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Start service
    ipcMain.handle('start-service', async (event, serviceName) => {
        try {
            await serviceManager.startService(serviceName);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

/**
 * Printer handlers
 */
function setupPrinterHandlers() {
    // Get available printers
    ipcMain.handle('get-printers', async () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return [];
        try {
            const printers = await mainWindow.webContents.getPrintersAsync();
            return printers.map(printer => ({
                name: printer.name,
                displayName: printer.displayName || printer.name,
                description: printer.description,
                status: printer.status,
                isDefault: printer.isDefault,
                options: printer.options
            }));
        } catch (error) {
            console.error('Error getting printers:', error);
            return [];
        }
    });

    // Print document
    ipcMain.handle('print', async (event, options = {}) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return { success: false, error: 'Window not ready' };
        try {
            const printOptions = {
                silent: options.silent || APP_CONFIG.printing.silentPrint,
                printBackground: options.printBackground !== false,
                deviceName: options.printerName || APP_CONFIG.printing.defaultPrinter
            };

            const result = await mainWindow.webContents.print(printOptions);
            return { success: result };
        } catch (error) {
            console.error('Error printing:', error);
            return { success: false, error: error.message };
        }
    });

    // Print to PDF
    ipcMain.handle('print-to-pdf', async (event, options = {}) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return { success: false, error: 'Window not ready' };
        try {
            // Validate savePath if provided
            if (options.savePath && !isPathAllowed(options.savePath)) {
                console.warn('[IPC] Blocked unauthorized PDF save path:', options.savePath);
                return { success: false, error: 'Access denied: Save path not in allowed directories' };
            }

            const pdfOptions = {
                marginsType: options.marginsType || 0,
                pageSize: options.pageSize || 'A4',
                printBackground: options.printBackground !== false,
                printSelectionOnly: options.printSelectionOnly || false,
                landscape: options.landscape || false
            };

            const data = await mainWindow.webContents.printToPDF(pdfOptions);

            if (options.savePath) {
                await fs.writeFile(options.savePath, data);
                return { success: true, path: options.savePath };
            }

            return { success: true, data: data.toString('base64') };
        } catch (error) {
            console.error('Error printing to PDF:', error);
            return { success: false, error: error.message };
        }
    });
}

/**
 * Application handlers
 */
function setupAppHandlers() {
    // Show message box
    ipcMain.handle('show-message', async (event, options) => {
        const mainWindow = getMainWindow();
        // dialog.showMessageBox works without parent window, but we prefer attaching to mainWindow if available
        const result = mainWindow
            ? await dialog.showMessageBox(mainWindow, options)
            : await dialog.showMessageBox(options);
        return result;
    });

    // Show error box
    ipcMain.handle('show-error', (event, title, content) => {
        dialog.showErrorBox(title, content);
        return true;
    });

    // Quit application
    ipcMain.handle('quit-app', () => {
        app.quit();
        return true;
    });

    // Restart application
    ipcMain.handle('restart-app', () => {
        app.relaunch();
        app.quit();
        return true;
    });

    // Minimize window
    ipcMain.handle('minimize-window', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.minimize();
        return true;
    });

    // Maximize window
    ipcMain.handle('maximize-window', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return true;
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
        return true;
    });

    // Close window
    ipcMain.handle('close-window', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.close();
        return true;
    });

    // Toggle fullscreen
    ipcMain.handle('toggle-fullscreen', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        return mainWindow.isFullScreen();
    });

    // Toggle DevTools
    ipcMain.handle('toggle-devtools', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.webContents.toggleDevTools();
        return true;
    });

    // Clear cache
    ipcMain.handle('clear-cache', async () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return { success: false, error: 'Window not ready' };
        try {
            await mainWindow.webContents.session.clearCache();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get app path
    ipcMain.handle('get-app-path', (event, pathName) => {
        return app.getPath(pathName);
    });
}

/**
 * Database handlers
 */
function setupDatabaseHandlers() {
    // Check database connection - actually verify by calling backend health endpoint
    ipcMain.handle('check-database', async () => {
        const http = require('http');

        return new Promise((resolve) => {
            const options = {
                hostname: 'localhost',
                port: APP_CONFIG.backend.port,
                path: '/api/health',
                method: 'GET',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const health = JSON.parse(data);
                        resolve({
                            connected: res.statusCode === 200 && health.status === 'healthy',
                            type: APP_CONFIG.database.useLocal ? 'local' : 'cloud',
                            status: health.database?.connected ? 'healthy' : 'degraded',
                            details: health
                        });
                    } catch (e) {
                        resolve({
                            connected: res.statusCode === 200,
                            type: APP_CONFIG.database.useLocal ? 'local' : 'cloud',
                            status: 'unknown',
                            error: 'Failed to parse health response'
                        });
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[DATABASE] Health check failed:', error.message);
                resolve({
                    connected: false,
                    type: APP_CONFIG.database.useLocal ? 'local' : 'cloud',
                    status: 'error',
                    error: error.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    connected: false,
                    type: APP_CONFIG.database.useLocal ? 'local' : 'cloud',
                    status: 'timeout',
                    error: 'Backend health check timed out'
                });
            });

            req.end();
        });
    });

    // Switch database mode
    ipcMain.handle('switch-database-mode', async (event, useLocal) => {
        APP_CONFIG.database.useLocal = useLocal;
        // Here you would implement actual database switching logic
        return { success: true, mode: useLocal ? 'local' : 'cloud' };
    });

    // Sync database
    ipcMain.handle('sync-database', async () => {
        // Implement database sync logic here
        return { success: true, syncedAt: new Date().toISOString() };
    });
}

/**
 * Navigation handlers
 */
function setupNavigationHandlers() {
    // Navigate to a specific path
    ipcMain.handle('navigate', (event, urlPath) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;
        const url = `${APP_CONFIG.frontend.url}${urlPath}`;
        mainWindow.loadURL(url);
        return true;
    });

    // Go back in history
    ipcMain.handle('go-back', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;
        if (mainWindow.webContents.canGoBack()) {
            mainWindow.webContents.goBack();
            return true;
        }
        return false;
    });

    // Go forward in history
    ipcMain.handle('go-forward', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;
        if (mainWindow.webContents.canGoForward()) {
            mainWindow.webContents.goForward();
            return true;
        }
        return false;
    });

    // Refresh the page
    ipcMain.handle('refresh', () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;
        mainWindow.webContents.reload();
        return true;
    });
}

module.exports = {
    setupIPC
};