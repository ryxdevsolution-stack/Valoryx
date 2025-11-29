/**
 * RYX Billing Desktop Application
 * Main Process Entry Point
 */

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const ServiceManager = require('./services');
const WindowManager = require('./window');
const { setupIPC } = require('./ipc');
const { APP_CONFIG } = require('../utils/config');
// AppUpdater is loaded lazily to avoid electron-updater initialization errors

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

    // Create splash screen
    function createSplashScreen() {
        const splash = new BrowserWindow({
            width: 400,
            height: 300,
            frame: false,
            transparent: false,
            alwaysOnTop: true,
            resizable: false,
            center: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        const splashHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    h1 { margin: 0 0 10px 0; font-size: 28px; }
                    .subtitle { opacity: 0.9; margin-bottom: 30px; }
                    .loader {
                        width: 50px;
                        height: 50px;
                        border: 4px solid rgba(255,255,255,0.3);
                        border-top-color: white;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .status {
                        margin-top: 20px;
                        font-size: 14px;
                        opacity: 0.8;
                    }
                </style>
            </head>
            <body>
                <h1>RYX Billing</h1>
                <div class="subtitle">Professional Billing System</div>
                <div class="loader"></div>
                <div class="status" id="status">Starting services...</div>
                <script>
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.on('splash-status', (event, message) => {
                        document.getElementById('status').textContent = message;
                    });
                </script>
            </body>
            </html>
        `;

        splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHTML));
        return splash;
    }

    // Initialize application with timeout protection
    async function initializeApp() {
        let splash = null;
        let startupTimeoutId = null;
        const STARTUP_TIMEOUT = 60000; // 60 seconds max for entire startup

        // Helper to update splash status
        const updateSplashStatus = (message) => {
            console.log(`[STARTUP] ${message}`);
            if (splash && !splash.isDestroyed()) {
                splash.webContents.send('splash-status', message);
            }
        };

        try {
            console.log('═══════════════════════════════════════════════════════');
            console.log('Starting RYX Billing Desktop Application...');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`[STARTUP] Platform: ${process.platform}`);
            console.log(`[STARTUP] Node version: ${process.version}`);
            console.log(`[STARTUP] Electron version: ${process.versions.electron}`);
            console.log(`[STARTUP] App path: ${app.getAppPath()}`);

            // Set up startup timeout
            const startupTimeout = new Promise((_, reject) => {
                startupTimeoutId = setTimeout(() => {
                    reject(new Error('Application startup timed out after 60 seconds. Services may be unresponsive.'));
                }, STARTUP_TIMEOUT);
            });

            // Show splash screen
            splash = createSplashScreen();
            updateSplashStatus('Initializing...');

            // Wrap the actual startup in a race with timeout
            const startupProcess = async () => {
                // Step 1: Initialize service manager (finds/setups Python)
                updateSplashStatus('Setting up Python environment...');
                await serviceManager.initialize();

                // Step 2: Start backend and frontend services
                updateSplashStatus('Starting backend server (port 5000)...');
                await serviceManager.startAll();

                // Step 3: Setup IPC handlers BEFORE creating window (so renderer can use them immediately)
                setupIPC(null, serviceManager);

                // Step 4: Create main window
                updateSplashStatus('Loading application interface...');
                mainWindow = await windowManager.createMainWindow();

                return true;
            };

            // Race between startup and timeout
            await Promise.race([startupProcess(), startupTimeout]);

            // Clear the timeout since we succeeded
            if (startupTimeoutId) {
                clearTimeout(startupTimeoutId);
            }

            // Close splash when main window is ready
            if (splash && !splash.isDestroyed()) {
                splash.close();
            }

            // Update IPC handlers with mainWindow reference (for handlers that need window)
            setupIPC(mainWindow, serviceManager);

            // Setup application menu
            setupApplicationMenu();

            // Handle window closed
            mainWindow.on('closed', () => {
                mainWindow = null;
            });

            // Initialize auto-updater (check for updates after app starts)
            if (APP_CONFIG.isProduction) {
                // Lazy load AppUpdater to avoid electron-updater initialization errors
                const AppUpdater = require('./updater');
                const updater = new AppUpdater();
                // Check for updates after 5 seconds (let app fully load first)
                setTimeout(() => {
                    updater.checkForUpdates();
                }, 5000);
            }

            console.log('═══════════════════════════════════════════════════════');
            console.log('[STARTUP] Application initialized successfully!');
            console.log('═══════════════════════════════════════════════════════');

        } catch (error) {
            console.error('═══════════════════════════════════════════════════════');
            console.error('[STARTUP ERROR] Failed to initialize application:');
            console.error(error);
            console.error('═══════════════════════════════════════════════════════');

            // Clear the timeout
            if (startupTimeoutId) {
                clearTimeout(startupTimeoutId);
            }

            // Close splash if open
            if (splash && !splash.isDestroyed()) {
                splash.close();
            }

            // Provide detailed error message based on error type
            let userMessage = `Failed to start RYX Billing:\n\n${error.message}\n\n`;

            if (error.message.includes('Python')) {
                userMessage += 'Possible solutions:\n';
                userMessage += '1. Install Python 3.10+ from python.org\n';
                userMessage += '2. Make sure Python is in your PATH\n';
                userMessage += '3. Check the backend/venv folder exists';
            } else if (error.message.includes('port')) {
                userMessage += 'Possible solutions:\n';
                userMessage += '1. Check if another application is using port 5000 or 3001\n';
                userMessage += '2. Close any running instances of RYX Billing\n';
                userMessage += '3. Restart your computer to free up ports';
            } else if (error.message.includes('timeout')) {
                userMessage += 'Possible solutions:\n';
                userMessage += '1. Check your system resources (memory/CPU)\n';
                userMessage += '2. Make sure antivirus is not blocking the app\n';
                userMessage += '3. Try restarting the application';
            } else {
                userMessage += 'Please check the application logs for more details.';
            }

            dialog.showErrorBox('Application Error', userMessage);
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