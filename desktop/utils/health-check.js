/**
 * Health Check Utilities
 * Service health monitoring and port checking
 */

const net = require('net');
const http = require('http');

/**
 * Check if a port is in use
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is in use, false otherwise
 */
function checkPort(port) {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true); // Port is in use
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                tester.close();
                resolve(false); // Port is free
            })
            .listen(port);
    });
}

/**
 * Wait for a service to be ready
 * @param {string} url - URL to check
 * @param {object} options - Options for retry behavior
 * @returns {Promise<boolean>} - True if service is ready, false if timeout
 */
async function waitForService(url, options = {}) {
    const {
        maxRetries = 30,
        retryDelay = 1000,
        timeout = 5000
    } = options;

    for (let i = 0; i < maxRetries; i++) {
        const isReady = await checkServiceHealth(url, timeout);

        if (isReady) {
            return true;
        }

        // Don't delay on last attempt
        if (i < maxRetries - 1) {
            await delay(retryDelay);
        }
    }

    return false;
}

/**
 * Check if a service is healthy
 * @param {string} url - URL to check
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<boolean>} - True if service responds, false otherwise
 */
function checkServiceHealth(url, timeout = 5000) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'GET',
            timeout: timeout
        };

        const req = http.request(options, (res) => {
            // Any response is considered healthy
            resolve(res.statusCode < 500);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Find an available port starting from a base port
 * @param {number} basePort - Starting port number
 * @param {number} maxAttempts - Maximum ports to try
 * @returns {Promise<number>} - Available port number
 */
async function findAvailablePort(basePort, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const port = basePort + i;
        const isInUse = await checkPort(port);

        if (!isInUse) {
            return port;
        }
    }

    throw new Error(`No available port found starting from ${basePort}`);
}

/**
 * Delay helper function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Monitor service health continuously
 * @param {string} url - URL to monitor
 * @param {function} onStatusChange - Callback for status changes
 * @param {number} interval - Check interval in ms
 * @returns {function} - Function to stop monitoring
 */
function monitorServiceHealth(url, onStatusChange, interval = 5000) {
    let lastStatus = null;

    const checkHealth = async () => {
        const isHealthy = await checkServiceHealth(url, 2000);

        if (isHealthy !== lastStatus) {
            lastStatus = isHealthy;
            onStatusChange(isHealthy);
        }
    };

    // Initial check
    checkHealth();

    // Set up interval
    const intervalId = setInterval(checkHealth, interval);

    // Return stop function
    return () => clearInterval(intervalId);
}

module.exports = {
    checkPort,
    waitForService,
    checkServiceHealth,
    findAvailablePort,
    delay,
    monitorServiceHealth
};