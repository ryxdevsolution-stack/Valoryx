const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configuration
const isDev = process.argv.includes('--dev');
const BACKEND_PORT = 5000;
const FRONTEND_PORT = 3000; // Only used in dev mode (Vite dev server)

let mainWindow = null;
let backendProcess = null;
let tray = null;

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
// Frontend Loading (Static Files - No Server Needed!)
// =======================
// In production, frontend is built as static files by Vite.
// Electron loads them directly from disk - no localhost:3000 needed.
// In dev mode, connects to Vite dev server at localhost:3000.

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
    show: true,
    backgroundColor: '#0f172a'
  });

  // Show loading splash screen immediately while app loads
  const loadingHTML = `
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        display: flex; align-items: center; justify-content: center;
        height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: white; overflow: hidden;
      }
      .container { text-align: center; }
      .logo { font-size: 48px; font-weight: 800; letter-spacing: 2px; margin-bottom: 20px;
        background: linear-gradient(135deg, #60a5fa, #a78bfa, #60a5fa);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        animation: shimmer 2s ease-in-out infinite; }
      @keyframes shimmer {
        0%, 100% { opacity: 1; } 50% { opacity: 0.7; }
      }
      .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1);
        border-top-color: #60a5fa; border-radius: 50%;
        animation: spin 0.8s linear infinite; margin: 20px auto; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .text { color: #94a3b8; font-size: 14px; }
    </style></head>
    <body><div class="container">
      <div class="logo">RYX Billing</div>
      <div class="spinner"></div>
      <div class="text">Starting application...</div>
    </div></body></html>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);

  // Load the actual frontend once backend is ready
  const loadFrontend = () => {
    if (isDev) {
      // Dev mode: connect to Vite dev server
      const devURL = `http://localhost:${FRONTEND_PORT}/#/auth/login`;
      console.log('[App] Loading frontend from dev server:', devURL);
      mainWindow.loadURL(devURL);
    } else {
      // Production: load static files directly from disk (NO server needed!)
      const frontendPath = path.join(process.resourcesPath, 'frontend-react', 'dist', 'index.html');
      console.log('[App] Loading frontend from static file:', frontendPath);
      mainWindow.loadFile(frontendPath, { hash: '/auth/login' });
    }
  };

  // Wait a moment for the splash to render, then load the app
  setTimeout(loadFrontend, 1500);

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

    // Frontend: In production, static files are loaded directly (no server needed)
    // In dev mode, user should run `npm run dev` in frontend-react/ separately
    if (isDev) {
      console.log('[App] Frontend: Connect to Vite dev server at http://localhost:3000');
      // Small delay for backend to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Create window and load login page
    createWindow();

    // Create system tray
    createTray();

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
  stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[App] Unhandled rejection:', error);
});
