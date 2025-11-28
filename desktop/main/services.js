/**
 * Service Manager
 * Handles starting, stopping, and monitoring of backend and frontend services
 */

const { spawn } = require('child_process');
const path = require('path');
const { checkPort, waitForService } = require('../utils/health-check');
const { APP_CONFIG } = require('../utils/config');

class ServiceManager {
    constructor() {
        this.services = {
            backend: null,
            frontend: null
        };

        this.config = {
            backend: {
                port: APP_CONFIG.backend.port,
                url: `http://localhost:${APP_CONFIG.backend.port}`,
                healthEndpoint: '/api/health',
                startCommand: this.getBackendCommand(),
                cwd: path.join(__dirname, '../../backend'),
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
                cwd: path.join(__dirname, '../../frontend'),
                env: {
                    ...process.env,
                    PORT: APP_CONFIG.frontend.port.toString(),
                    NEXT_PUBLIC_API_URL: `http://localhost:${APP_CONFIG.backend.port}/api`
                }
            }
        };
    }

    getBackendCommand() {
        // Check for virtual environment first (cross-platform)
        const fs = require('fs');
        const isWindows = process.platform === 'win32';

        // Windows: venv\Scripts\python.exe, Linux/Mac: venv/bin/python
        const venvPython = isWindows
            ? path.join(__dirname, '../../backend/venv/Scripts/python.exe')
            : path.join(__dirname, '../../backend/venv/bin/python');

        if (fs.existsSync(venvPython)) {
            return { command: venvPython, args: ['app.py'] };
        }

        // Fallback to system Python
        const pythonCmd = isWindows ? 'python' : 'python3';
        return { command: pythonCmd, args: ['app.py'] };
    }

    getFrontendCommand() {
        // Use production build in production, dev server in development
        if (APP_CONFIG.isDevelopment) {
            return { command: 'npm', args: ['run', 'dev'] };
        }
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

        console.log(`Starting ${serviceName} service...`);

        return new Promise((resolve, reject) => {
            const { command, args } = config.startCommand;

            const service = spawn(command, args, {
                cwd: config.cwd,
                env: config.env,
                stdio: APP_CONFIG.isDevelopment ? 'inherit' : 'pipe',
                shell: true
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