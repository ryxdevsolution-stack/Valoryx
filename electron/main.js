const { app, BrowserWindow, ipcMain, Tray, Menu, session } = require('electron');

// Disable HTTP cache so API responses are always fresh
app.commandLine.appendSwitch('disable-http-cache');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// Configuration
const isDev = process.argv.includes('--dev');
const BACKEND_PORT = 5017;   // was 5000
const FRONTEND_PORT = 3002;  // was 3000 — Vite dev server port
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BACKOFF_MS = [1000, 2000, 4000];
const HEALTH_POLL_INTERVAL_MS = 300;
const HEALTH_TIMEOUT_MS = 5000;

let mainWindow = null;
let backendProcess = null;
let tray = null;
let backendRestartCount = 0;
let backendReady = false;
let lastStartupStatus = { message: 'Initializing…', progress: 5 };

// =======================
// Backend Supervisor
// =======================

function sendSplashStatus(message, progress) {
  lastStartupStatus = { message, progress };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-status', { message, progress });
  }
}

// Renderer can pull current status on mount (avoids missing the push event)
ipcMain.handle('get-startup-status', () => lastStartupStatus);

function spawnFlask() {
  let pythonPath, backendPath;
  if (isDev) {
    pythonPath = 'python';
    backendPath = path.join(__dirname, '..', 'backend');
  } else {
    // Use bundled embedded Python in production — no system Python required
    const bundledPython = path.join(process.resourcesPath, 'python', 'python.exe');
    pythonPath = fs.existsSync(bundledPython) ? bundledPython : 'python';
    backendPath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend')
      : path.join(__dirname, '..', 'backend');
  }

  console.log(`[Backend] Python: ${pythonPath}`);
  console.log(`[Backend] Backend: ${backendPath}`);

  // Read DB_URL from backend/.env so sync can connect to Supabase
  let dbUrl = '';
  try {
    const envPath = path.join(backendPath, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const match = envContent.match(/^DB_URL=(.+)$/m);
      if (match) dbUrl = match[1].trim();
    }
  } catch (e) {
    console.warn('[Backend] Could not read .env for DB_URL:', e.message);
  }

  const proc = spawn(pythonPath, ['app.py'], {
    cwd: backendPath,
    env: {
      ...process.env,
      DB_MODE: 'offline',
      DB_URL: dbUrl,
      PYTHONUNBUFFERED: '1',
      TELEGRAM_BOT_TOKEN: '',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONPATH: backendPath,
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.on('data', (data) => console.log(`[Backend] ${data.toString().trim()}`));
  proc.stderr.on('data', (data) => console.error(`[Backend ERR] ${data.toString().trim()}`));
  proc.on('error', (err) => console.error('[Backend] Spawn error:', err));

  return proc;
}

function pollHealth(timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) { resolve(true); return; }
        setTimeout(check, HEALTH_POLL_INTERVAL_MS);
      });
      req.setTimeout(HEALTH_TIMEOUT_MS);
      req.on('error', () => setTimeout(check, HEALTH_POLL_INTERVAL_MS));
      req.on('timeout', () => { req.destroy(); setTimeout(check, HEALTH_POLL_INTERVAL_MS); });
    };
    check();
  });
}

async function startBackendWithSupervision() {
  let attempt = 0;
  while (attempt <= MAX_RESTART_ATTEMPTS) {
    if (attempt > 0) {
      const delay = RESTART_BACKOFF_MS[attempt - 1] || 4000;
      sendSplashStatus(`Reconnecting… (attempt ${attempt + 1}/${MAX_RESTART_ATTEMPTS + 1})`, 30);
      await new Promise(r => setTimeout(r, delay));
    } else {
      sendSplashStatus('Starting backend…', 20);
    }

    backendProcess = spawnFlask();

    // Watch for unexpected crash AFTER successful start
    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Exited with code ${code}`);
      backendProcess = null;
      if (!app.isQuitting && backendReady) {
        // Crash after successful start — restart from scratch
        console.log('[Backend] Unexpected crash — restarting supervisor');
        backendReady = false;
        backendRestartCount = 0;
        // Non-awaited intentionally: crash recovery runs independently
        startBackendWithSupervision().then((ok) => {
          if (ok) loadFrontend();
        });
      }
    });

    sendSplashStatus('Waiting for backend to be ready…', 40 + attempt * 10);
    const healthy = await pollHealth(30000);

    if (healthy) {
      backendReady = true;
      backendRestartCount = 0;
      sendSplashStatus('Loading application…', 80);
      return true;
    }

    // Health check timed out — kill process and retry
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGTERM');
      backendProcess = null;
    }
    attempt++;
  }

  // All attempts exhausted
  sendSplashStatus('Could not start backend after 3 attempts. Please restart the app.', -1);
  return false;
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[Backend] Stopping Flask…');
    // SIGTERM doesn't work on Windows — use taskkill to force-kill the process tree
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(`taskkill /PID ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (e) { /* already dead */ }
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

// =======================
// Frontend Loading
// =======================

function loadFrontend() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}/#/auth/login`);
  } else {
    const frontendPath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', 'static', 'frontend', 'index.html')
      : path.join(__dirname, '..', 'backend', 'static', 'frontend', 'index.html');
    mainWindow.loadFile(frontendPath, { hash: '/auth/login' });
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
    backgroundColor: '#0f172a'
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Valoryx');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

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
// Auto-Update
// =======================

function setupAutoUpdater() {
  // Don't check for updates in dev mode
  if (isDev) return;

  // Configure: don't auto-download, let user decide when to restart
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log all events for debugging
  autoUpdater.logger = {
    info: (msg) => console.log('[Updater]', msg),
    warn: (msg) => console.warn('[Updater]', msg),
    error: (msg) => console.error('[Updater]', msg),
    debug: (msg) => console.log('[Updater DEBUG]', msg),
  };

  // Forward update events to renderer via IPC
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates…');
    sendUpdateStatus('checking', null);
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    sendUpdateStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] App is up to date');
    sendUpdateStatus('not-available', null);
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    sendUpdateStatus('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    sendUpdateStatus('error', { message: err.message });
  });

  // Check for updates 5 seconds after app is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Check failed:', err.message);
    });
  }, 5000);

  // Then check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Periodic check failed:', err.message);
    });
  }, 4 * 60 * 60 * 1000);
}

function sendUpdateStatus(status, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, data });
  }
}

// IPC: User clicked "Restart & Update"
ipcMain.handle('install-update', () => {
  console.log('[Updater] User requested install — quitting and installing…');
  app.isQuitting = true;
  stopBackend();
  autoUpdater.quitAndInstall(false, true);
});

// IPC: Manual check for updates
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get current app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// =======================
// App Lifecycle
// =======================

app.on('ready', async () => {
  console.log('[App] Starting Valoryx Desktop…');

  // Clear HTTP cache on every startup so API responses are always fresh
  session.defaultSession.clearCache();

  // Step 1: Create window and tray immediately
  createWindow();
  createTray();

  // Step 2: Load the React bundle from disk NOW — ElectronSplash renders immediately
  //         This is the key fix: frontend loads BEFORE Flask, not after.
  loadFrontend();

  // Step 3: Start Flask in background while user sees the splash
  const started = await startBackendWithSupervision();

  if (!started) {
    // Error state is shown by ElectronSplash via the -1 progress IPC event.
    // Do NOT reload frontend — keep splash on screen showing the error.
    return;
  }

  // Step 4: Backend ready. IPC event with progress:80 already triggered
  //         App.tsx to set backendReady=true and unmount ElectronSplash.
  console.log('[App] Valoryx Desktop ready!');

  // Step 5: Start auto-updater (checks GitHub Releases for new version)
  setupAutoUpdater();
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
  stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[App] Unhandled rejection:', error);
});
