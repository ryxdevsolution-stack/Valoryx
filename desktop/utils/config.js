/**
 * Application Configuration
 * Central configuration for the desktop application
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDevelopment = NODE_ENV === 'development';

// Configuration object
const APP_CONFIG = {
    // Environment
    isDevelopment,
    isProduction: !isDevelopment,
    environment: NODE_ENV,

    // Application
    app: {
        name: 'RYX Billing System',
        version: require('../../package.json').version || '1.0.0',
        description: 'Professional Billing and Inventory Management System'
    },

    // Backend service configuration
    backend: {
        port: parseInt(process.env.BACKEND_PORT || '5000', 10),
        host: process.env.BACKEND_HOST || 'localhost',
        protocol: 'http',
        get url() {
            return `${this.protocol}://${this.host}:${this.port}`;
        }
    },

    // Frontend service configuration
    frontend: {
        port: parseInt(process.env.FRONTEND_PORT || '3001', 10),
        host: process.env.FRONTEND_HOST || 'localhost',
        protocol: 'http',
        get url() {
            return `${this.protocol}://${this.host}:${this.port}`;
        }
    },

    // Service management - optimized for faster startup
    service: {
        maxRetries: parseInt(process.env.SERVICE_MAX_RETRIES || '20', 10),
        retryDelay: parseInt(process.env.SERVICE_RETRY_DELAY || '500', 10),
        timeout: parseInt(process.env.SERVICE_TIMEOUT || '3000', 10),
        restartAttempts: parseInt(process.env.SERVICE_RESTART_ATTEMPTS || '3', 10)
    },

    // Startup messages - friendly user feedback
    messages: {
        steps: {
            initializing: 'Initializing your workspace...',
            pythonSetup: 'Preparing the environment...',
            backendStarting: 'Waking up the system...',
            frontendStarting: 'Setting up the interface...',
            servicesReady: 'Almost ready...',
            loadingApp: 'Opening RYX Billing...'
        },
        errors: {
            pythonNotFound: 'Could not find Python. Please install Python 3.10+ from python.org',
            portInUse: 'Required port is in use. Please close other instances.',
            serviceTimeout: 'Services took too long to start. Please try again.',
            general: 'Something went wrong. Please restart the application.'
        }
    },

    // Window configuration
    window: {
        width: parseInt(process.env.WINDOW_WIDTH || '1400', 10),
        height: parseInt(process.env.WINDOW_HEIGHT || '900', 10),
        minWidth: parseInt(process.env.WINDOW_MIN_WIDTH || '1024', 10),
        minHeight: parseInt(process.env.WINDOW_MIN_HEIGHT || '600', 10),
        startMaximized: process.env.WINDOW_START_MAXIMIZED === 'true',
        showDevTools: isDevelopment || process.env.SHOW_DEV_TOOLS === 'true'
    },

    // Database configuration
    database: {
        useLocal: process.env.USE_LOCAL_DB === 'true',
        localPath: process.env.LOCAL_DB_PATH || path.join(__dirname, '../../data/local.db'),
        syncInterval: parseInt(process.env.DB_SYNC_INTERVAL || '30000', 10),
        offlineMode: process.env.OFFLINE_MODE === 'true'
    },

    // Printing configuration
    printing: {
        enabled: process.env.PRINTER_ENABLED !== 'false',
        defaultPrinter: process.env.PRINTER_NAME || null,
        printerType: process.env.PRINTER_TYPE || 'thermal',
        silentPrint: process.env.SILENT_PRINT === 'true'
    },

    // Paths
    paths: {
        root: path.join(__dirname, '../..'),
        desktop: path.join(__dirname, '..'),
        backend: path.join(__dirname, '../../backend'),
        frontend: path.join(__dirname, '../../frontend'),
        resources: path.join(__dirname, '../resources'),
        userData: '', // Will be set at runtime
        temp: '', // Will be set at runtime
        logs: '' // Will be set at runtime
    },

    // Auto-update configuration
    autoUpdate: {
        enabled: process.env.AUTO_UPDATE_ENABLED !== 'false',
        checkInterval: parseInt(process.env.UPDATE_CHECK_INTERVAL || '3600000', 10), // 1 hour
        channel: process.env.UPDATE_CHANNEL || 'stable'
    },

    // Security configuration
    security: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: !isDevelopment,
        contentSecurityPolicy: isDevelopment ? null : "default-src 'self'"
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
        toFile: process.env.LOG_TO_FILE === 'true',
        maxLogSize: parseInt(process.env.MAX_LOG_SIZE || '10485760', 10), // 10MB
        maxLogFiles: parseInt(process.env.MAX_LOG_FILES || '5', 10)
    }
};

// Helper functions
const ConfigUtils = {
    /**
     * Get API URL for frontend
     */
    getApiUrl() {
        return `${APP_CONFIG.backend.url}/api`;
    },

    /**
     * Get full URL for a service
     */
    getServiceUrl(service) {
        if (service === 'backend') {
            return APP_CONFIG.backend.url;
        } else if (service === 'frontend') {
            return APP_CONFIG.frontend.url;
        }
        throw new Error(`Unknown service: ${service}`);
    },

    /**
     * Check if running in packaged app
     */
    isPackaged() {
        return process.mainModule && process.mainModule.filename.indexOf('app.asar') !== -1;
    },

    /**
     * Get resource path (handles both dev and packaged)
     */
    getResourcePath(relativePath) {
        if (this.isPackaged()) {
            return path.join(process.resourcesPath, relativePath);
        }
        return path.join(APP_CONFIG.paths.resources, relativePath);
    },

    /**
     * Validate configuration
     */
    validateConfig() {
        const errors = [];

        // Check required paths exist
        if (!fs.existsSync(APP_CONFIG.paths.backend)) {
            errors.push(`Backend path does not exist: ${APP_CONFIG.paths.backend}`);
        }

        if (!fs.existsSync(APP_CONFIG.paths.frontend)) {
            errors.push(`Frontend path does not exist: ${APP_CONFIG.paths.frontend}`);
        }

        // Check port numbers are valid
        if (APP_CONFIG.backend.port < 1 || APP_CONFIG.backend.port > 65535) {
            errors.push(`Invalid backend port: ${APP_CONFIG.backend.port}`);
        }

        if (APP_CONFIG.frontend.port < 1 || APP_CONFIG.frontend.port > 65535) {
            errors.push(`Invalid frontend port: ${APP_CONFIG.frontend.port}`);
        }

        // Check ports don't conflict
        if (APP_CONFIG.backend.port === APP_CONFIG.frontend.port) {
            errors.push('Backend and frontend ports cannot be the same');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Get environment info for debugging
     */
    getEnvironmentInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            environment: APP_CONFIG.environment,
            config: {
                backend: APP_CONFIG.backend,
                frontend: APP_CONFIG.frontend,
                database: APP_CONFIG.database,
                printing: APP_CONFIG.printing
            }
        };
    }
};

module.exports = {
    APP_CONFIG,
    ConfigUtils
};