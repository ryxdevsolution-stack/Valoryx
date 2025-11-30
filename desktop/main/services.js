/**
 * Service Manager
 * Handles starting, stopping, and monitoring of backend and frontend services
 */

const { spawn, execSync, fork } = require('child_process');
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
            // In packaged app, unpacked files are in resources/app.asar.unpacked
            // Use process.resourcesPath which gives us the resources directory
            const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');
            console.log('[PATHS] Backend path (packaged):', unpackedPath);
            return unpackedPath;
        }
        const devPath = path.join(__dirname, '../../backend');
        console.log('[PATHS] Backend path (dev):', devPath);
        return devPath;
    }

    getFrontendPath() {
        if (this.isPackaged()) {
            // Use process.resourcesPath for correct path resolution
            const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'frontend');
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
        const venvPath = this.getVenvPath();
        console.log('[PYTHON] Step 2: Checking virtual environment at:', venvPython);
        if (fs.existsSync(venvPython)) {
            console.log('[PYTHON] ✓ Found existing venv:', venvPython);

            // Verify requirements are installed, install if missing
            if (!this.verifyRequirementsInstalled(venvPath)) {
                console.log('[PYTHON] Requirements not installed in existing venv, installing...');
                await this.installRequirements(venvPath);
            }

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

    getVenvPath() {
        // On Windows packaged app, use AppData to avoid Program Files permission issues
        if (this.isWindows && this.isPackaged()) {
            const appDataPath = process.env.LOCALAPPDATA || process.env.APPDATA;
            return path.join(appDataPath, 'RYX Billing', 'venv');
        }
        return path.join(this.getBackendPath(), 'venv');
    }

    getVenvPythonPath() {
        const venvPath = this.getVenvPath();
        if (this.isWindows) {
            return path.join(venvPath, 'Scripts', 'python.exe');
        }
        return path.join(venvPath, 'bin', 'python');
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
                        // Remove both \r and \n to handle Windows line endings properly
                        const pythonPath = execSync(pathCmd, { encoding: 'utf8' })
                            .replace(/\r/g, '')
                            .trim()
                            .split('\n')[0];
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
        const venvPath = this.getVenvPath();

        // Ensure parent directory exists (for AppData path on Windows)
        const venvParent = path.dirname(venvPath);
        if (!fs.existsSync(venvParent)) {
            fs.mkdirSync(venvParent, { recursive: true });
        }

        const venvPip = this.isWindows
            ? path.join(venvPath, 'Scripts', 'pip.exe')
            : path.join(venvPath, 'bin', 'pip');

        const requirementsPath = path.join(backendPath, 'requirements.txt');

        // Check if venv already exists
        if (fs.existsSync(venvPath)) {
            console.log('[PYTHON] Venv already exists at:', venvPath);

            // Verify Flask is installed (check if requirements are actually installed)
            if (this.verifyRequirementsInstalled(venvPath)) {
                console.log('[PYTHON] Requirements already installed');
                return;
            }

            // Requirements not installed - install them now
            console.log('[PYTHON] Requirements not installed, installing now...');
            if (fs.existsSync(requirementsPath) && fs.existsSync(venvPip)) {
                try {
                    execSync(`"${venvPip}" install -r "${requirementsPath}"`, {
                        cwd: backendPath,
                        stdio: 'inherit',
                        windowsHide: true
                    });
                    console.log('[PYTHON] Requirements installed successfully');
                } catch (error) {
                    console.error('[PYTHON] Failed to install requirements:', error);
                    throw error;
                }
            }
            return;
        }

        console.log('[PYTHON] Creating virtual environment...');
        console.log('[PYTHON] Using Python:', pythonPath);
        console.log('[PYTHON] Venv path:', venvPath);

        try {
            // On Windows, use 'python' command directly since execSync works with shell
            // This avoids issues with Electron GUI apps not inheriting PATH properly
            const pythonCmd = this.isWindows ? 'python' : pythonPath;

            console.log('[PYTHON] Running venv creation with command:', pythonCmd);
            execSync(`${pythonCmd} -m venv "${venvPath}"`, {
                cwd: backendPath,
                stdio: 'inherit',
                windowsHide: true
            });

            // Install requirements
            if (fs.existsSync(requirementsPath)) {
                console.log('[PYTHON] Installing requirements...');
                execSync(`"${venvPip}" install -r "${requirementsPath}"`, {
                    cwd: backendPath,
                    stdio: 'inherit',
                    windowsHide: true
                });
            }

            console.log('[PYTHON] Virtual environment setup complete');
        } catch (error) {
            console.error('[PYTHON] Failed to setup venv:', error);
            throw error;
        }
    }

    verifyRequirementsInstalled(venvPath) {
        // Check if Flask is installed by looking for flask package in site-packages
        const sitePackages = this.isWindows
            ? path.join(venvPath, 'Lib', 'site-packages', 'flask')
            : path.join(venvPath, 'lib', 'python*', 'site-packages', 'flask');

        if (this.isWindows) {
            // On Windows, directly check the path
            const exists = fs.existsSync(sitePackages);
            console.log('[PYTHON] Flask package check:', sitePackages, 'exists:', exists);
            return exists;
        } else {
            // On Linux/Mac, need to handle python version wildcard
            const libPath = path.join(venvPath, 'lib');
            if (!fs.existsSync(libPath)) return false;

            const pythonDirs = fs.readdirSync(libPath).filter(d => d.startsWith('python'));
            for (const pyDir of pythonDirs) {
                const flaskPath = path.join(libPath, pyDir, 'site-packages', 'flask');
                if (fs.existsSync(flaskPath)) return true;
            }
            return false;
        }
    }

    async installRequirements(venvPath) {
        const backendPath = this.getBackendPath();
        const venvPip = this.isWindows
            ? path.join(venvPath, 'Scripts', 'pip.exe')
            : path.join(venvPath, 'bin', 'pip');

        const requirementsPath = path.join(backendPath, 'requirements.txt');

        console.log('[PYTHON] Installing requirements...');
        console.log('[PYTHON] Pip path:', venvPip);
        console.log('[PYTHON] Requirements path:', requirementsPath);

        if (!fs.existsSync(venvPip)) {
            throw new Error(`Pip not found at ${venvPip}`);
        }

        if (!fs.existsSync(requirementsPath)) {
            throw new Error(`Requirements file not found at ${requirementsPath}`);
        }

        try {
            execSync(`"${venvPip}" install -r "${requirementsPath}"`, {
                cwd: backendPath,
                stdio: 'inherit',
                windowsHide: true
            });
            console.log('[PYTHON] Requirements installed successfully');
        } catch (error) {
            console.error('[PYTHON] Failed to install requirements:', error);
            throw error;
        }
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

        // Next.js standalone output structure:
        // .next/standalone/
        //   ├── node_modules/     <- shared node_modules (including 'next')
        //   ├── server.js         <- main entry (or in frontend/ subfolder)
        //   └── frontend/
        //       └── server.js     <- project-specific server
        const standaloneRoot = path.join(frontendPath, '.next', 'standalone');
        const standalonePath = path.join(standaloneRoot, 'frontend');
        const serverPath = path.join(standalonePath, 'server.js');
        const nodeModulesPath = path.join(standaloneRoot, 'node_modules');

        console.log('[FRONTEND] Looking for standalone server at:', serverPath);
        console.log('[FRONTEND] Standalone root:', standaloneRoot);
        console.log('[FRONTEND] node_modules path:', nodeModulesPath);
        console.log('[FRONTEND] Server.js exists:', fs.existsSync(serverPath));
        console.log('[FRONTEND] node_modules exists:', fs.existsSync(nodeModulesPath));

        // Check if standalone server exists
        if (fs.existsSync(serverPath)) {
            console.log('[FRONTEND] Using standalone server');
            // Use fork() which uses Electron's built-in Node.js
            // NODE_PATH tells Node.js where to find modules (since server.js is in frontend/ subfolder)
            return {
                command: 'node',  // Not actually used when useElectronNode is true
                args: [serverPath],
                cwd: standalonePath,
                useElectronNode: true,  // Flag to use fork() instead of spawn()
                nodeModulesPath: nodeModulesPath  // Pass node_modules path for NODE_PATH
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
            const { command, args, cwd: cmdCwd, useElectronNode, nodeModulesPath } = config.startCommand;

            // Use command-specific cwd if provided, otherwise use config cwd
            const workingDir = cmdCwd || config.cwd;

            console.log(`[${serviceName.toUpperCase()}] Command: ${command} ${args.join(' ')}`);
            console.log(`[${serviceName.toUpperCase()}] Working directory: ${workingDir}`);
            console.log(`[${serviceName.toUpperCase()}] Directory exists: ${fs.existsSync(workingDir)}`);

            let service;

            // Use fork for Node.js scripts (uses Electron's built-in Node.js)
            if (useElectronNode && args.length > 0) {
                const scriptPath = args[args.length - 1]; // Last arg is the script path
                console.log(`[${serviceName.toUpperCase()}] Using fork for Node.js script: ${scriptPath}`);

                // Build environment with NODE_PATH for module resolution
                const forkEnv = { ...config.env };
                if (nodeModulesPath) {
                    // NODE_PATH tells Node.js where to find modules
                    // This is needed because server.js is in a subfolder but node_modules is in parent
                    forkEnv.NODE_PATH = nodeModulesPath;
                    console.log(`[${serviceName.toUpperCase()}] Setting NODE_PATH: ${nodeModulesPath}`);
                }

                service = fork(scriptPath, [], {
                    cwd: workingDir,
                    env: forkEnv,
                    stdio: APP_CONFIG.isDevelopment ? 'inherit' : 'pipe',
                    silent: !APP_CONFIG.isDevelopment
                });
            } else {
                // Use shell only for npm commands on Windows (npm.cmd requires shell)
                // Direct executables (python, node) don't need shell - safer against injection
                const needsShell = this.isWindows && (command === 'npm' || command.endsWith('npm.cmd'));

                service = spawn(command, args, {
                    cwd: workingDir,
                    env: config.env,
                    stdio: APP_CONFIG.isDevelopment ? 'inherit' : 'pipe',
                    shell: needsShell
                });
            }

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