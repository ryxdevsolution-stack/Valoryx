/**
 * RYX Billing Desktop Application
 * Main Process Entry Point
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const ServiceManager = require('./services');
const WindowManager = require('./window');
const { setupIPC } = require('./ipc');
const { APP_CONFIG } = require('../utils/config');
const AppUpdater = require('./updater');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    let mainWindow = null;
    const serviceManager = new ServiceManager();
    const windowManager = new WindowManager();

    // Handle second instance attempt
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // Initialize application
    async function initializeApp() {
        try {
            console.log('Starting RYX Billing Desktop Application...');

            // Initialize service manager (finds/setups Python)
            console.log('Setting up Python environment...');
            await serviceManager.initialize();

            // Start backend and frontend services
            await serviceManager.startAll();

            // Create main window
            mainWindow = await windowManager.createMainWindow();

            // Setup IPC handlers
            setupIPC(mainWindow, serviceManager);

            // Setup application menu
            setupApplicationMenu();

            // Handle window closed
            mainWindow.on('closed', () => {
                mainWindow = null;
            });

            // Initialize auto-updater (check for updates after app starts)
            if (APP_CONFIG.isProduction) {
                const updater = new AppUpdater();
                // Check for updates after 5 seconds (let app fully load first)
                setTimeout(() => {
                    updater.checkForUpdates();
                }, 5000);
            }

            console.log('Application initialized successfully');

        } catch (error) {
            console.error('Failed to initialize application:', error);
            app.quit();
        }
    }

    // Setup application menu
    function setupApplicationMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Bill',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => {
                            mainWindow.webContents.send('navigate', '/billing/create');
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => {
                            mainWindow.webContents.send('navigate', '/settings');
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Exit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'selectAll' }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'close' }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About',
                        click: () => {
                            mainWindow.webContents.send('show-about');
                        }
                    },
                    {
                        label: 'Documentation',
                        click: () => {
                            require('electron').shell.openExternal('https://ryx-billing.com/docs');
                        }
                    }
                ]
            }
        ];

        // macOS specific menu adjustments
        if (process.platform === 'darwin') {
            template.unshift({
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services', submenu: [] },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    // App event handlers
    app.whenReady().then(initializeApp);

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            initializeApp();
        }
    });

    app.on('before-quit', async (event) => {
        event.preventDefault();
        console.log('Shutting down services...');
        await serviceManager.stopAll();
        app.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
}