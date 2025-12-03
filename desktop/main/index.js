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

    // Create splash screen with logo and progress
    function createSplashScreen() {
        const splash = new BrowserWindow({
            width: 450,
            height: 350,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            center: true,
            skipTaskbar: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload/index.js')
            }
        });

        // Professional splash screen with logo, progress bar, and friendly messages
        const splashHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                        color: #ffffff;
                        border-radius: 16px;
                        overflow: hidden;
                        user-select: none;
                    }
                    .container {
                        text-align: center;
                        padding: 40px;
                    }
                    .logo-container {
                        margin-bottom: 24px;
                    }
                    .logo {
                        width: 80px;
                        height: 80px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-radius: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto;
                        box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
                        animation: pulse 2s ease-in-out infinite;
                    }
                    .logo-text {
                        font-size: 32px;
                        font-weight: 700;
                        color: white;
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4); }
                        50% { transform: scale(1.05); box-shadow: 0 15px 50px rgba(102, 126, 234, 0.6); }
                    }
                    .app-name {
                        font-size: 28px;
                        font-weight: 600;
                        margin-bottom: 6px;
                        background: linear-gradient(90deg, #667eea, #764ba2);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    }
                    .tagline {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                        margin-bottom: 32px;
                    }
                    .progress-container {
                        width: 280px;
                        margin: 0 auto 16px;
                    }
                    .progress-bar {
                        height: 4px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #667eea, #764ba2);
                        border-radius: 4px;
                        width: 0%;
                        transition: width 0.3s ease;
                    }
                    .status {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.8);
                        min-height: 20px;
                    }
                    .step-indicator {
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                        margin-top: 8px;
                    }
                    .version {
                        position: absolute;
                        bottom: 16px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.3);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo-container">
                        <div class="logo">
                            <span class="logo-text">R</span>
                        </div>
                    </div>
                    <div class="app-name">RYX Billing</div>
                    <div class="tagline">Professional Billing System</div>
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progress"></div>
                        </div>
                    </div>
                    <div class="status" id="status">Initializing...</div>
                    <div class="step-indicator" id="step"></div>
                </div>
                <div class="version" id="version"></div>
                <script>
                    window.addEventListener('DOMContentLoaded', () => {
                        if (window.splashAPI) {
                            window.splashAPI.onProgress((data) => {
                                document.getElementById('status').textContent = data.message || '';
                                document.getElementById('progress').style.width = (data.percent || 0) + '%';
                                document.getElementById('step').textContent = data.step || '';
                            });
                            window.splashAPI.onVersion((version) => {
                                document.getElementById('version').textContent = 'v' + version;
                            });
                        }
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
        const STARTUP_TIMEOUT = 90000; // 90 seconds max for entire startup
        const TOTAL_STEPS = 4;
        let currentStep = 0;

        // Helper to update splash progress with friendly messages
        const updateProgress = (step, message, percent) => {
            currentStep = step;
            const stepText = `Step ${step} of ${TOTAL_STEPS}`;
            console.log(`[STARTUP] [${stepText}] ${message} (${percent}%)`);
            if (splash && !splash.isDestroyed()) {
                splash.webContents.send('splash-progress', { message, percent, step: stepText });
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
                    reject(new Error(APP_CONFIG.messages.errors.serviceTimeout));
                }, STARTUP_TIMEOUT);
            });

            // Show splash screen
            splash = createSplashScreen();

            // Send version to splash
            splash.webContents.once('did-finish-load', () => {
                splash.webContents.send('splash-version', APP_CONFIG.app.version);
                updateProgress(1, APP_CONFIG.messages.steps.initializing, 5);
            });

            // Wrap the actual startup in a race with timeout
            const startupProcess = async () => {
                // Step 1: Initialize service manager (finds/setups Python)
                updateProgress(1, APP_CONFIG.messages.steps.pythonSetup, 15);
                await serviceManager.initialize();
                updateProgress(1, APP_CONFIG.messages.steps.pythonSetup, 25);

                // Step 2: Start backend and frontend services
                updateProgress(2, APP_CONFIG.messages.steps.backendStarting, 35);
                await serviceManager.startAll();
                updateProgress(2, APP_CONFIG.messages.steps.servicesReady, 60);

                // Step 3: Setup IPC handlers BEFORE creating window
                updateProgress(3, APP_CONFIG.messages.steps.frontendStarting, 70);
                setupIPC(null, serviceManager);

                // Step 4: Create main window
                updateProgress(4, APP_CONFIG.messages.steps.loadingApp, 85);
                mainWindow = await windowManager.createMainWindow();
                updateProgress(4, APP_CONFIG.messages.steps.loadingApp, 100);

                return true;
            };

            // Race between startup and timeout
            await Promise.race([startupProcess(), startupTimeout]);

            // Clear the timeout since we succeeded
            if (startupTimeoutId) {
                clearTimeout(startupTimeoutId);
            }

            // Small delay for smooth transition
            await new Promise(resolve => setTimeout(resolve, 300));

            // Close splash when main window is ready
            if (splash && !splash.isDestroyed()) {
                splash.close();
            }

            // Update IPC handlers with mainWindow reference
            setupIPC(mainWindow, serviceManager);

            // Setup application menu
            setupApplicationMenu();

            // Handle window closed
            mainWindow.on('closed', () => {
                mainWindow = null;
            });

            // Initialize auto-updater (check for updates after app starts)
            if (APP_CONFIG.isProduction) {
                const AppUpdater = require('./updater');
                const updater = new AppUpdater();
                setTimeout(() => updater.checkForUpdates(), 5000);
            }

            console.log('═══════════════════════════════════════════════════════');
            console.log('[STARTUP] Application initialized successfully!');
            console.log('═══════════════════════════════════════════════════════');

        } catch (error) {
            console.error('═══════════════════════════════════════════════════════');
            console.error('[STARTUP ERROR] Failed to initialize application:');
            console.error(error);
            console.error('═══════════════════════════════════════════════════════');

            if (startupTimeoutId) clearTimeout(startupTimeoutId);
            if (splash && !splash.isDestroyed()) splash.close();

            // Provide user-friendly error message
            let userMessage = `Failed to start RYX Billing:\n\n${error.message}\n\n`;

            if (error.message.toLowerCase().includes('python')) {
                userMessage += 'Solutions:\n';
                userMessage += '1. Install Python 3.10+ from python.org\n';
                userMessage += '2. Ensure "Add Python to PATH" is checked during installation\n';
                userMessage += '3. Restart this application';
            } else if (error.message.toLowerCase().includes('port')) {
                userMessage += 'Solutions:\n';
                userMessage += '1. Close any other instances of RYX Billing\n';
                userMessage += '2. Check if another app is using the same port\n';
                userMessage += '3. Restart your computer';
            } else if (error.message.toLowerCase().includes('timeout') || error.message.toLowerCase().includes('long')) {
                userMessage += 'Solutions:\n';
                userMessage += '1. Check your system resources\n';
                userMessage += '2. Temporarily disable antivirus\n';
                userMessage += '3. Restart the application';
            } else {
                userMessage += 'Please restart the application or contact support.';
            }

            dialog.showErrorBox('Startup Error', userMessage);
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