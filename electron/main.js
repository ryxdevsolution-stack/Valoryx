const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configuration
const isDev = process.argv.includes('--dev');
const BACKEND_PORT = 5000;
const FRONTEND_PORT = 3000;
const LOGIN_PATH = '/auth/login'; // Direct to login page

let mainWindow = null;
let backendProcess = null;
let frontendProcess = null;
let tray = null;

// Auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Configure update server - GitHub Releases
if (!isDev) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'ryxdevsolution-stack',
    repo: 'Valoryx'
  });
}

// =======================
// Backend Management
// =======================

function startBackend() {
  return new Promise((resolve, reject) => {
    console.log('[Backend] Starting Flask server...');

    let pythonPath;
    let backendPath;

    if (isDev) {
      // Development: use local Python
      pythonPath = 'python';
      backendPath = path.join(__dirname, '..', 'backend');
    } else {
      // Production: use system Python (requires Python installed on client machine)
      const resourcesPath = process.resourcesPath;
      pythonPath = 'python'; // Use system Python from PATH
      backendPath = path.join(resourcesPath, 'backend');
    }

    // Set environment variables
    const env = { ...process.env };
    env.DB_MODE = 'offline'; // Always use offline mode for desktop
    env.PYTHONUNBUFFERED = '1';

    // Start Flask
    backendProcess = spawn(pythonPath, ['app.py'], {
      cwd: backendPath,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
      if (data.toString().includes('Running on')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (error) => {
      console.error('[Backend] Failed to start:', error);
      reject(error);
    });

    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Process exited with code ${code}`);
      backendProcess = null;
    });

    // Timeout if backend doesn't start in 30 seconds
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        resolve(); // Assume it started
      }
    }, 30000);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[Backend] Stopping Flask server...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// =======================
// Frontend Management
// =======================

function startFrontend() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      console.log('[Frontend] Using development server at http://localhost:3000');
      resolve();
      return;
    }

    console.log('[Frontend] Starting Next.js standalone server...');

    const resourcesPath = process.resourcesPath;
    const frontendPath = path.join(resourcesPath, 'frontend');
    const serverPath = path.join(frontendPath, 'server.js');

    // Set environment variables for Next.js
    const env = { ...process.env };
    env.NODE_ENV = 'production';
    env.PORT = FRONTEND_PORT.toString();
    env.HOSTNAME = '0.0.0.0';

    frontendProcess = spawn('node', [serverPath], {
      cwd: frontendPath,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let resolved = false;

    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Frontend] ${output}`);

      // Resolve when server is ready
      if (!resolved && (output.includes('ready') || output.includes('started') || output.includes('Listening'))) {
        resolved = true;
        resolve();
      }
    });

    frontendProcess.stderr.on('data', (data) => {
      console.error(`[Frontend] ${data.toString().trim()}`);
    });

    frontendProcess.on('error', (error) => {
      console.error('[Frontend] Failed to start:', error);
      if (!resolved) {
        reject(error);
      }
    });

    frontendProcess.on('exit', (code) => {
      console.log(`[Frontend] Process exited with code ${code}`);
      frontendProcess = null;
    });

    // Timeout - resolve after 15 seconds anyway (Next.js might take time)
    setTimeout(() => {
      if (!resolved) {
        console.log('[Frontend] Timeout - assuming server started');
        resolved = true;
        resolve();
      }
    }, 15000);
  });
}

function stopFrontend() {
  if (frontendProcess && !frontendProcess.killed) {
    console.log('[Frontend] Stopping Next.js server...');
    frontendProcess.kill('SIGTERM');
    frontendProcess = null;
  }
}

// =======================
// Window Management
// =======================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#ffffff'
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load frontend - connect to Next.js server and go to login page
  const frontendURL = `http://localhost:${FRONTEND_PORT}${LOGIN_PATH}`;

  console.log('[App] Loading frontend from:', frontendURL);
  mainWindow.loadURL(frontendURL);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =======================
// System Tray
// =======================

function createTray() {
  const iconPath = path.join(__dirname, 'resources', 'icon.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Check for Updates',
      click: () => {
        checkForUpdates();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('RYX Billing');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

// =======================
// Auto-Update Functions
// =======================

function checkForUpdates() {
  if (isDev) {
    console.log('[Update] Skipping update check in development mode');
    return;
  }

  console.log('[Update] Checking for updates...');
  autoUpdater.checkForUpdates();
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('[Update] Checking for update...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('[Update] Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      version: info.version
    });
  }
  // Auto-download the update
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-not-available', () => {
  console.log('[Update] No updates available');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'not-available' });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`[Update] Download progress: ${progressObj.percent}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: progressObj.percent
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Update] Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version
    });
  }
  // Install update on quit
  autoUpdater.quitAndInstall(false, true);
});

autoUpdater.on('error', (error) => {
  console.error('[Update] Error:', error);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'error',
      error: error.message
    });
  }
});

// =======================
// IPC Handlers
// =======================

ipcMain.handle('check-for-updates', async () => {
  checkForUpdates();
  return { success: true };
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

// =======================
// Printing Handlers
// =======================

ipcMain.handle('silent-print', async (event, html, printerName) => {
  try {
    console.log('[Print] Starting silent print...');

    // Create a hidden window for printing
    const printWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Load the HTML content
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Print silently to default printer
    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: printerName || '', // Empty string uses default printer
      margins: {
        marginType: 'none'
      },
      pageSize: {
        width: 80000, // 80mm in microns
        height: 297000 // Auto height
      }
    };

    // Use promise to handle print callback
    return new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        if (!success) {
          console.error('[Print] Print failed:', failureReason);
          printWindow.close();
          resolve({ success: false, error: failureReason });
        } else {
          console.log('[Print] Print successful');
          printWindow.close();
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Print] Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    if (mainWindow && mainWindow.webContents) {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers;
    }
    return [];
  } catch (error) {
    console.error('[Print] Error getting printers:', error);
    return [];
  }
});

ipcMain.handle('set-default-printer', async (event, printerName) => {
  try {
    // Note: Electron doesn't support setting default printer
    // This would need to be done at OS level
    console.log('[Print] Setting default printer not supported in Electron');
    return { success: false, message: 'Setting default printer not supported' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// =======================
// App Lifecycle
// =======================

app.on('ready', async () => {
  console.log('[App] Starting RYX Billing Desktop...');

  try {
    // Start backend (Python Flask on port 5000)
    await startBackend();
    console.log('[App] Backend started successfully on http://localhost:5000');

    // Start frontend (Next.js standalone server in production, dev server in development)
    if (!isDev) {
      await startFrontend();
      console.log('[App] Frontend started successfully on http://localhost:3000');
    } else {
      console.log('[App] Frontend: Using dev server at http://localhost:3000');
    }

    // Wait a bit for servers to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create window and load login page
    createWindow();

    // Create system tray
    createTray();

    // Check for updates on startup (after 5 seconds)
    if (!isDev) {
      setTimeout(() => {
        checkForUpdates();
      }, 5000);
    }

    console.log('[App] RYX Billing Desktop ready!');

  } catch (error) {
    console.error('[App] Failed to start:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, don't quit when all windows are closed
  if (process.platform !== 'darwin') {
    // Don't quit, just hide to tray
    console.log('[App] All windows closed, minimized to tray');
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  console.log('[App] Shutting down...');
  stopFrontend();
  stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[App] Unhandled rejection:', error);
});
