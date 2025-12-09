/**
 * QZ Printer / Electron Printing Integration
 * Handles printing for Electron desktop app
 */

// Check if running in Electron environment
export function getPrintSystemStatus() {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  return {
    isElectron,
    isReady: isElectron,
    defaultPrinter: null as string | null,
  };
}

// QZ Printer class for Electron integration
class QZPrinter {
  /**
   * Get print queue status from Electron
   */
  async getElectronQueueStatus() {
    const defaultStatus = {
      pending: 0,
      failed: 0,
      completed: 0,
      isProcessing: false,
      defaultPrinter: null,
      stats: {
        totalPrinted: 0,
        totalFailed: 0,
        totalRetries: 0,
      },
      jobs: {
        pending: [],
        failed: [],
      },
    };

    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      return defaultStatus;
    }

    try {
      const electronAPI = (window as any).electronAPI;
      // Use getPrintQueue (correct method name from preload.js)
      if (electronAPI.getPrintQueue) {
        return await electronAPI.getPrintQueue();
      }
      return defaultStatus;
    } catch (error) {
      console.error('Failed to get Electron queue status:', error);
      return defaultStatus;
    }
  }

  /**
   * Retry failed print jobs in Electron
   */
  async retryElectronFailedJobs() {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      return { success: false, message: 'Not running in Electron' };
    }

    try {
      const electronAPI = (window as any).electronAPI;
      // Use retryFailedJobs (correct method name from preload.js)
      if (electronAPI.retryFailedJobs) {
        return await electronAPI.retryFailedJobs();
      }
      return { success: false, message: 'Retry function not available' };
    } catch (error) {
      console.error('Failed to retry print jobs:', error);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Print using Electron's native printing
   */
  async printViaElectron(html: string, printerName?: string | null) {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      throw new Error('Not running in Electron');
    }

    const electronAPI = (window as any).electronAPI;
    // Use silentPrint (correct method name from preload.js)
    if (electronAPI.silentPrint) {
      return await electronAPI.silentPrint(html, printerName || null);
    }
    throw new Error('Print function not available');
  }

  /**
   * Get list of available printers
   */
  async getPrinters() {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      return [];
    }

    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI.getPrinters) {
        return await electronAPI.getPrinters();
      }
      return [];
    } catch (error) {
      console.error('Failed to get printers:', error);
      return [];
    }
  }

  /**
   * Set default printer
   */
  async setDefaultPrinter(printerName: string) {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      return { success: false, message: 'Not running in Electron' };
    }

    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI.setDefaultPrinter) {
        return await electronAPI.setDefaultPrinter(printerName);
      }
      return { success: false, message: 'Function not available' };
    } catch (error) {
      console.error('Failed to set default printer:', error);
      return { success: false, message: String(error) };
    }
  }
}

// Export singleton instance
export const qzPrinter = new QZPrinter();

// Export class for testing
export { QZPrinter };
