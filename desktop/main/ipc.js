/**
 * IPC Communication Handlers
 * Handles communication between main and renderer processes
 */

const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { APP_CONFIG, ConfigUtils } = require('../utils/config');

/**
 * Setup all IPC handlers
 */
function setupIPC(mainWindow, serviceManager) {
    // System information handlers
    setupSystemHandlers();

    // File operation handlers
    setupFileHandlers(mainWindow);

    // Service management handlers
    setupServiceHandlers(serviceManager);

    // Printer handlers
    setupPrinterHandlers(mainWindow);

    // Application handlers
    setupAppHandlers(mainWindow);

    // Database handlers
    setupDatabaseHandlers();

    console.log('IPC handlers initialized');
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
function setupFileHandlers(mainWindow) {
    // Open file dialog
    ipcMain.handle('select-file', async (event, options = {}) => {
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

    // Read file content
    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });

    // Write file content
    ipcMain.handle('write-file', async (event, filePath, content) => {
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
function setupPrinterHandlers(mainWindow) {
    // Get available printers
    ipcMain.handle('get-printers', async () => {
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
        try {
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
function setupAppHandlers(mainWindow) {
    // Show message box
    ipcMain.handle('show-message', async (event, options) => {
        const result = await dialog.showMessageBox(mainWindow, options);
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
        mainWindow.minimize();
        return true;
    });

    // Maximize window
    ipcMain.handle('maximize-window', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
        return true;
    });

    // Close window
    ipcMain.handle('close-window', () => {
        mainWindow.close();
        return true;
    });

    // Toggle fullscreen
    ipcMain.handle('toggle-fullscreen', () => {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        return mainWindow.isFullScreen();
    });

    // Toggle DevTools
    ipcMain.handle('toggle-devtools', () => {
        mainWindow.webContents.toggleDevTools();
        return true;
    });

    // Clear cache
    ipcMain.handle('clear-cache', async () => {
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
    // Check database connection
    ipcMain.handle('check-database', async () => {
        // This would connect to your actual database
        // For now, returning mock status
        return {
            connected: true,
            type: APP_CONFIG.database.useLocal ? 'local' : 'cloud',
            status: 'healthy'
        };
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

module.exports = {
    setupIPC
};