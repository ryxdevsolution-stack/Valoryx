/**
 * Auto-Updater Module
 * Handles automatic updates from GitHub Releases
 */

const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');

class AppUpdater {
    constructor() {
        // Configure auto-updater
        autoUpdater.autoDownload = false; // Don't download automatically, ask user first
        autoUpdater.autoInstallOnAppQuit = true;

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Check for update errors
        autoUpdater.on('error', (error) => {
            console.error('[UPDATER] Error:', error);
        });

        // Update available
        autoUpdater.on('update-available', (info) => {
            console.log('[UPDATER] Update available:', info.version);

            dialog.showMessageBox({
                type: 'info',
                title: 'Update Available',
                message: `A new version (${info.version}) is available!`,
                detail: 'Would you like to download it now?',
                buttons: ['Download', 'Later'],
                defaultId: 0
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.downloadUpdate();
                    this.showDownloadProgress();
                }
            });
        });

        // No update available
        autoUpdater.on('update-not-available', (info) => {
            console.log('[UPDATER] No update available. Current version:', info.version);
        });

        // Download progress
        autoUpdater.on('download-progress', (progress) => {
            console.log(`[UPDATER] Download progress: ${progress.percent.toFixed(1)}%`);

            // Update progress window if exists
            if (this.progressWindow && !this.progressWindow.isDestroyed()) {
                this.progressWindow.webContents.send('download-progress', progress.percent);
            }
        });

        // Update downloaded
        autoUpdater.on('update-downloaded', (info) => {
            console.log('[UPDATER] Update downloaded:', info.version);

            // Close progress window
            if (this.progressWindow && !this.progressWindow.isDestroyed()) {
                this.progressWindow.close();
            }

            dialog.showMessageBox({
                type: 'info',
                title: 'Update Ready',
                message: 'Update downloaded successfully!',
                detail: 'The application will restart to install the update.',
                buttons: ['Restart Now', 'Later'],
                defaultId: 0
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });
    }

    /**
     * Check for updates
     * Call this on app startup
     */
    checkForUpdates() {
        console.log('[UPDATER] Checking for updates...');
        autoUpdater.checkForUpdates().catch((error) => {
            console.error('[UPDATER] Check failed:', error);
        });
    }

    /**
     * Show download progress window
     */
    showDownloadProgress() {
        this.progressWindow = new BrowserWindow({
            width: 400,
            height: 150,
            frame: false,
            resizable: false,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        const html = `
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
                        background: #f5f5f5;
                    }
                    h3 { margin: 0 0 20px 0; color: #333; }
                    .progress-bar {
                        width: 300px;
                        height: 20px;
                        background: #ddd;
                        border-radius: 10px;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: #4CAF50;
                        width: 0%;
                        transition: width 0.3s;
                    }
                    .progress-text {
                        margin-top: 10px;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <h3>Downloading Update...</h3>
                <div class="progress-bar">
                    <div class="progress-fill" id="fill"></div>
                </div>
                <div class="progress-text" id="text">0%</div>
                <script>
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.on('download-progress', (event, percent) => {
                        document.getElementById('fill').style.width = percent + '%';
                        document.getElementById('text').textContent = Math.round(percent) + '%';
                    });
                </script>
            </body>
            </html>
        `;

        this.progressWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    }
}

module.exports = AppUpdater;
