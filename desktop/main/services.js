/**
 * Service Manager
 * Handles starting, stopping, and monitoring of backend and frontend services
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkPort, waitForService } = require('../utils/health-check');
const { APP_CONFIG } = require('../utils/config');

class ServiceManager {
    constructor() {
        this.services = {
            backend: null,
            frontend: null
        };
        this.isWindows = process.platform === 'win32';
        this.pythonPath = null;
        this.isShuttingDown = false;  // Initialize shutdown flag
    }

    async initialize() {
        console.log('[SERVICE] Initializing Service Manager...');
        console.log('[SERVICE] Platform:', process.platform);
        console.log('[SERVICE] Is packaged:', this.isPackaged());

        // Find or setup Python
        this.pythonPath = await this.findOrSetupPython();
        console.log('[SERVICE] Python path:', this.pythonPath);

        this.config = {
            backend: {
                port: APP_CONFIG.backend.port,
                url: `http://localhost:${APP_CONFIG.backend.port}`,
                healthEndpoint: '/api/health',
                startCommand: this.getBackendCommand(),
                cwd: this.getBackendPath(),
                env: {
                    ...process.env,
                    FLASK_ENV: APP_CONFIG.isDevelopment ? 'development' : 'production',
                    PORT: APP_CONFIG.backend.port.toString()
                }
            },
            frontend: {
                port: APP_CONFIG.frontend.port,
                url: `http://localhost:${APP_CONFIG.frontend.port}`,
                healthEndpoint: '/',
                startCommand: this.getFrontendCommand(),
                cwd: this.getFrontendPath(),
                env: {
                    ...process.env,
                    PORT: APP_CONFIG.frontend.port.toString(),
                    NEXT_PUBLIC_API_URL: `http://localhost:${APP_CONFIG.backend.port}/api`
                }
            }
        };
    }

    getBackendPath() {
        // Handle both development and packaged app paths
        if (this.isPackaged()) {
            // In packaged app, unpacked files are in app.asar.unpacked
            const unpackedPath = path.join(path.dirname(require.main.filename), '..', 'app.asar.unpacked', 'backend');
            console.log('[PATHS] Backend path (packaged):', unpackedPath);
            return unpackedPath;
        }
        const devPath = path.join(__dirname, '../../backend');
        console.log('[PATHS] Backend path (dev):', devPath);
        return devPath;
    }

    getFrontendPath() {
        if (this.isPackaged()) {
            const unpackedPath = path.join(path.dirname(require.main.filename), '..', 'app.asar.unpacked', 'frontend');
            console.log('[PATHS] Frontend path (packaged):', unpackedPath);
            return unpackedPath;
        }
        const devPath = path.join(__dirname, '../../frontend');
        console.log('[PATHS] Frontend path (dev):', devPath);
        return devPath;
    }

    isPackaged() {
        const { app } = require('electron');
        const packed = app.isPackaged;
        console.log('[PATHS] Is packaged:', packed);
        return packed;
    }

    /**
     * Find bundled Python, system Python, or download embeddable Python
     */
    async findOrSetupPython() {
        console.log('[PYTHON] ═══════════════════════════════════════════');
        console.log('[PYTHON] Looking for Python installation...');
        console.log('[PYTHON] ═══════════════════════════════════════════');

        const searchResults = [];

        // 1. Check for bundled Python (in resources)
        const bundledPython = this.getBundledPythonPath();
        console.log('[PYTHON] Step 1: Checking bundled Python at:', bundledPython);
        if (bundledPython && fs.existsSync(bundledPython)) {
            console.log('[PYTHON] ✓ Found bundled Python:', bundledPython);
            return bundledPython;
        }
        searchResults.push(`Bundled Python: NOT FOUND at ${bundledPython}`);
        console.log('[PYTHON] ✗ Bundled Python not found');

        // 2. Check for existing venv in backend
        const venvPython = this.getVenvPythonPath();
        console.log('[PYTHON] Step 2: Checking virtual environment at:', venvPython);
        if (fs.existsSync(venvPython)) {
            console.log('[PYTHON] ✓ Found existing venv:', venvPython);
            return venvPython;
        }
        searchResults.push(`Virtual Environment: NOT FOUND at ${venvPython}`);
        console.log('[PYTHON] ✗ Virtual environment not found');

        // 3. Check for system Python
        console.log('[PYTHON] Step 3: Checking system Python...');
        const systemPython = this.findSystemPython();
        if (systemPython) {
            console.log('[PYTHON] ✓ Found system Python:', systemPython);
            // Create venv with system Python
            console.log('[PYTHON] Creating virtual environment...');
            await this.setupVirtualEnv(systemPython);
            const venvPath = this.getVenvPythonPath();
            if (fs.existsSync(venvPath)) {
                console.log('[PYTHON] ✓ Virtual environment created successfully');
                return venvPath;
            }
        }
        searchResults.push(`System Python: NOT FOUND (tried: python3, python${this.isWindows ? ', py -3' : ''})`);
        console.log('[PYTHON] ✗ System Python not found');

        // 4. Download embeddable Python (Windows only)
        if (this.isWindows) {
            console.log('[PYTHON] Step 4: Downloading embeddable Python (Windows)...');
            try {
                await this.downloadEmbeddablePython();
                const downloadedPath = this.getBundledPythonPath();
                if (fs.existsSync(downloadedPath)) {
                    console.log('[PYTHON] ✓ Embeddable Python downloaded successfully');
                    return downloadedPath;
                }
            } catch (downloadError) {
                searchResults.push(`Embeddable Python Download: FAILED - ${downloadError.message}`);
                console.log('[PYTHON] ✗ Failed to download embeddable Python:', downloadError.message);
            }
        }

        // All options exhausted - provide detailed error
        console.log('[PYTHON] ═══════════════════════════════════════════');
        console.log('[PYTHON] FAILED TO FIND PYTHON');
        console.log('[PYTHON] ═══════════════════════════════════════════');
        searchResults.forEach(r => console.log('[PYTHON]', r));

        const errorMessage = `Python not found!\n\nSearched locations:\n${searchResults.map(r => '• ' + r).join('\n')}\n\n` +
            `Solutions:\n` +
            `1. Install Python 3.10+ from https://www.python.org/downloads/\n` +
            `2. Make sure Python is added to your PATH during installation\n` +
            `3. Or create a virtual environment manually:\n` +
            `   cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt`;

        throw new Error(errorMessage);
    }

    getBundledPythonPath() {
        const resourcesPath = this.isPackaged()
            ? process.resourcesPath
            : path.join(__dirname, '../resources');

        if (this.isWindows) {
            return path.join(resourcesPath, 'python', 'python.exe');
        }
        return path.join(resourcesPath, 'python', 'bin', 'python3');
    }

    getVenvPythonPath() {
        const backendPath = this.getBackendPath();
        if (this.isWindows) {
            return path.join(backendPath, 'venv', 'Scripts', 'python.exe');
        }
        return path.join(backendPath, 'venv', 'bin', 'python');
    }

    findSystemPython() {
        const commands = this.isWindows
            ? ['python', 'python3', 'py -3']
            : ['python3', 'python'];

        for (const cmd of commands) {
            try {
                const result = execSync(`${cmd} --version`, {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                if (result.includes('Python 3')) {
                    // Get full path
                    const pathCmd = this.isWindows
                        ? `where ${cmd.split(' ')[0]}`
                        : `which ${cmd}`;
                    try {
                        const pythonPath = execSync(pathCmd, { encoding: 'utf8' }).trim().split('\n')[0];
                        return pythonPath;
                    } catch {
                        return cmd;
                    }
                }
            } catch (e) {
                // Command not found, try next
            }
        }
        return null;
    }

    async setupVirtualEnv(pythonPath) {
        const backendPath = this.getBackendPath();
        const venvPath = path.join(backendPath, 'venv');

        if (fs.existsSync(venvPath)) {
            console.log('[PYTHON] Venv already exists');
            return;
        }

        console.log('[PYTHON] Creating virtual environment...');

        try {
            execSync(`"${pythonPath}" -m venv "${venvPath}"`, {
                cwd: backendPath,
                stdio: 'inherit'
            });

            // Install requirements
            const venvPip = this.isWindows
                ? path.join(venvPath, 'Scripts', 'pip.exe')
                : path.join(venvPath, 'bin', 'pip');

            const requirementsPath = path.join(backendPath, 'requirements.txt');

            if (fs.existsSync(requirementsPath)) {
                console.log('[PYTHON] Installing requirements...');
                execSync(`"${venvPip}" install -r "${requirementsPath}"`, {
                    cwd: backendPath,
                    stdio: 'inherit'
                });
            }

            console.log('[PYTHON] Virtual environment setup complete');
        } catch (error) {
            console.error('[PYTHON] Failed to setup venv:', error);
            throw error;
        }
    }

    async downloadEmbeddablePython() {
        const https = require('https');
        const { createWriteStream, mkdirSync } = require('fs');
        const { pipeline } = require('stream/promises');
        const { createGunzip } = require('zlib');

        const pythonVersion = '3.11.7';
        const downloadUrl = `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;

        const resourcesPath = this.isPackaged()
            ? path.join(process.resourcesPath, 'python')
            : path.join(__dirname, '../resources/python');

        mkdirSync(resourcesPath, { recursive: true });

        const zipPath = path.join(resourcesPath, 'python.zip');

        // Download
        console.log('[PYTHON] Downloading from:', downloadUrl);

        await new Promise((resolve, reject) => {
            const file = createWriteStream(zipPath);
            https.get(downloadUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', reject);
        });

        // Extract using PowerShell on Windows
        console.log('[PYTHON] Extracting...');
        execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${resourcesPath}' -Force"`, {
            stdio: 'inherit'
        });

        // Clean up zip
        fs.unlinkSync(zipPath);

        // Install pip for embeddable Python
        await this.installPipForEmbeddable(resourcesPath);

        console.log('[PYTHON] Embeddable Python ready');
    }

    async installPipForEmbeddable(pythonDir) {
        const https = require('https');
        const { createWriteStream } = require('fs');

        const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
        const getPipPath = path.join(pythonDir, 'get-pip.py');
        const pythonExe = path.join(pythonDir, 'python.exe');

        // Download get-pip.py
        await new Promise((resolve, reject) => {
            const file = createWriteStream(getPipPath);
            https.get(getPipUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', reject);
        });

        // Enable pip in embeddable Python (modify python311._pth)
        const pthFiles = fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));
        for (const pthFile of pthFiles) {
            const pthPath = path.join(pythonDir, pthFile);
            let content = fs.readFileSync(pthPath, 'utf8');
            // Uncomment import site
            content = content.replace('#import site', 'import site');
            content += '\nLib\\site-packages\n';
            fs.writeFileSync(pthPath, content);
        }

        // Install pip
        execSync(`"${pythonExe}" "${getPipPath}"`, { stdio: 'inherit' });

        // Install requirements
        const backendPath = this.getBackendPath();
        const requirementsPath = path.join(backendPath, 'requirements.txt');

        if (fs.existsSync(requirementsPath)) {
            console.log('[PYTHON] Installing requirements with embeddable Python...');
            execSync(`"${pythonExe}" -m pip install -r "${requirementsPath}"`, {
                stdio: 'inherit'
            });
        }

        // Clean up
        fs.unlinkSync(getPipPath);
    }

    getBackendCommand() {
        return { command: this.pythonPath, args: ['app.py'] };
    }

    getFrontendCommand() {
        // Use production build in production, dev server in development
        if (APP_CONFIG.isDevelopment) {
            console.log('[FRONTEND] Development mode - using npm run dev');
            return { command: 'npm', args: ['run', 'dev'] };
        }

        // In production, use the standalone Next.js server
        const frontendPath = this.getFrontendPath();
        console.log('[FRONTEND] Frontend path:', frontendPath);

        // Next.js standalone output mirrors the project structure
        // server.js is at .next/standalone/frontend/server.js (not .next/standalone/server.js)
        const standalonePath = path.join(frontendPath, '.next', 'standalone', 'frontend');
        const serverPath = path.join(standalonePath, 'server.js');

        console.log('[FRONTEND] Looking for standalone server at:', serverPath);
        console.log('[FRONTEND] Standalone path exists:', fs.existsSync(standalonePath));
        console.log('[FRONTEND] Server.js exists:', fs.existsSync(serverPath));

        // Check if standalone server exists
        if (fs.existsSync(serverPath)) {
            console.log('[FRONTEND] Using standalone server');
            // The standalone server.js should be run from its directory
            return {
                command: 'node',
                args: [serverPath],
                cwd: standalonePath
            };
        }

        // Fallback to npm start
        console.log('[FRONTEND] Standalone not found, using npm start');
        return { command: 'npm', args: ['start'] };
    }

    async startAll() {
        console.log('Starting all services...');

        // Check if ports are available
        await this.checkPortAvailability();

        // Start services in parallel
        await Promise.all([
            this.startService('backend'),
            this.startService('frontend')
        ]);

        // Wait for services to be ready
        await this.waitForAllServices();

        console.log('All services started successfully');
    }

    async checkPortAvailability() {
        const portsToCheck = [
            { name: 'Backend', port: this.config.backend.port },
            { name: 'Frontend', port: this.config.frontend.port }
        ];

        for (const { name, port } of portsToCheck) {
            const isInUse = await checkPort(port);
            if (isInUse) {
                throw new Error(`Port ${port} required for ${name} is already in use`);
            }
        }
    }

    async startService(serviceName) {
        const config = this.config[serviceName];

        console.log(`[${serviceName.toUpperCase()}] Starting service...`);

        return new Promise((resolve, reject) => {
            const { command, args, cwd: cmdCwd } = config.startCommand;

            // Use command-specific cwd if provided, otherwise use config cwd
            const workingDir = cmdCwd || config.cwd;

            console.log(`[${serviceName.toUpperCase()}] Command: ${command} ${args.join(' ')}`);
            console.log(`[${serviceName.toUpperCase()}] Working directory: ${workingDir}`);
            console.log(`[${serviceName.toUpperCase()}] Directory exists: ${fs.existsSync(workingDir)}`);

            // Use shell only for npm commands on Windows (npm.cmd requires shell)
            // Direct executables (python, node) don't need shell - safer against injection
            const needsShell = this.isWindows && (command === 'npm' || command.endsWith('npm.cmd'));

            const service = spawn(command, args, {
                cwd: workingDir,
                env: config.env,
                stdio: APP_CONFIG.isDevelopment ? 'inherit' : 'pipe',
                shell: needsShell
            });

            service.on('error', (error) => {
                console.error(`Failed to start ${serviceName}:`, error);
                reject(error);
            });

            service.on('spawn', () => {
                console.log(`${serviceName} process spawned with PID: ${service.pid}`);
                this.services[serviceName] = service;
                resolve();
            });

            // Handle service exit
            service.on('exit', (code, signal) => {
                console.log(`${serviceName} exited with code ${code} and signal ${signal}`);
                this.services[serviceName] = null;

                // Attempt restart if not shutting down
                if (!this.isShuttingDown && code !== 0) {
                    this.restartService(serviceName);
                }
            });

            // Capture output in production
            if (!APP_CONFIG.isDevelopment) {
                service.stdout.on('data', (data) => {
                    console.log(`[${serviceName}]: ${data.toString()}`);
                });

                service.stderr.on('data', (data) => {
                    console.error(`[${serviceName} ERROR]: ${data.toString()}`);
                });
            }
        });
    }

    async waitForAllServices() {
        const waitPromises = Object.keys(this.config).map(async (serviceName) => {
            const config = this.config[serviceName];
            const serviceUrl = config.url + config.healthEndpoint;

            console.log(`Waiting for ${serviceName} to be ready at ${serviceUrl}...`);

            const isReady = await waitForService(serviceUrl, {
                maxRetries: APP_CONFIG.service.maxRetries,
                retryDelay: APP_CONFIG.service.retryDelay,
                timeout: APP_CONFIG.service.timeout
            });

            if (!isReady) {
                throw new Error(`${serviceName} failed to start`);
            }

            console.log(`${serviceName} is ready`);
            return true;
        });

        await Promise.all(waitPromises);
    }

    async restartService(serviceName, retries = 3) {
        console.log(`Attempting to restart ${serviceName} (${retries} retries left)...`);

        if (retries === 0) {
            console.error(`Failed to restart ${serviceName} after multiple attempts`);
            return false;
        }

        // Kill existing process if any
        await this.stopService(serviceName);

        // Wait a moment before restarting
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            await this.startService(serviceName);
            const config = this.config[serviceName];
            const serviceUrl = config.url + config.healthEndpoint;

            const isReady = await waitForService(serviceUrl, {
                maxRetries: 10,
                retryDelay: 1000,
                timeout: 5000
            });

            if (isReady) {
                console.log(`${serviceName} restarted successfully`);
                return true;
            }
        } catch (error) {
            console.error(`Error restarting ${serviceName}:`, error);
        }

        // Retry if failed
        return this.restartService(serviceName, retries - 1);
    }

    async stopService(serviceName) {
        const service = this.services[serviceName];

        if (!service) {
            return;
        }

        console.log(`Stopping ${serviceName}...`);

        return new Promise((resolve) => {
            service.on('exit', () => {
                console.log(`${serviceName} stopped`);
                this.services[serviceName] = null;
                resolve();
            });

            // Try graceful shutdown first
            service.kill('SIGTERM');

            // Force kill after timeout
            setTimeout(() => {
                if (this.services[serviceName]) {
                    console.log(`Force killing ${serviceName}...`);
                    service.kill('SIGKILL');
                }
            }, 5000);
        });
    }

    async stopAll() {
        this.isShuttingDown = true;
        console.log('Stopping all services...');

        await Promise.all(
            Object.keys(this.services).map(serviceName => this.stopService(serviceName))
        );

        console.log('All services stopped');
    }

    getServiceStatus(serviceName) {
        const service = this.services[serviceName];
        return {
            running: service !== null && !service.killed,
            pid: service?.pid || null,
            config: this.config[serviceName]
        };
    }

    getAllStatuses() {
        return Object.keys(this.services).reduce((statuses, serviceName) => {
            statuses[serviceName] = this.getServiceStatus(serviceName);
            return statuses;
        }, {});
    }
}

module.exports = ServiceManager;