/**
 * Global TypeScript declarations for Electron API
 */

interface ElectronAPI {
  // Print queue management
  addPrintJob?: (billData: any) => Promise<{ success: boolean; jobId: string }>;
  getPrintQueue?: () => Promise<{
    pending: number;
    failed: number;
    completed: number;
    isProcessing: boolean;
    defaultPrinter: string | null;
    stats: {
      totalPrinted: number;
      totalFailed: number;
      totalRetries: number;
    };
    jobs: {
      pending: Array<{ id: string; status: string; createdAt: string; billNumber?: number }>;
      failed: Array<{ id: string; status: string; error: string; retryCount: number; billNumber?: number }>;
    };
  }>;
  retryFailedJobs?: () => Promise<{ retriedCount: number }>;
  clearPrintQueue?: () => Promise<boolean>;

  // Event listeners
  onPrintJobUpdate?: (callback: (data: any) => void) => void;
  onPrintQueueChange?: (callback: (data: any) => void) => void;
  onPrinterStatusChange?: (callback: (data: any) => void) => void;
  removeListener?: (channel: string) => void;

  // Printer management
  getPrinters?: () => Promise<Array<{ name: string; displayName?: string; isDefault: boolean; status: number }>>;
  setDefaultPrinter?: (printerName: string) => Promise<boolean>;

  // Silent print - MAIN PRINT FUNCTION
  silentPrint?: (html: string, printerName: string | null) => Promise<{ success: boolean; error?: string }>;

  // App info
  getVersion?: () => Promise<string>;
  getPath?: (name: string) => Promise<string>;
  isElectron?: () => boolean;

  // Window controls
  minimizeWindow?: () => void;
  maximizeWindow?: () => void;
  closeWindow?: () => void;

  // Platform info (not functions, static values)
  platform?: string;
  nodeVersion?: string;
  electronVersion?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
