/**
 * Global TypeScript declarations
 */

interface ElectronAPI {
  // Print queue management
  getPrintQueueStatus?: () => Promise<{
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
  retryFailedPrintJobs?: () => Promise<{ success: boolean; message?: string }>;
  clearPrintQueue?: () => Promise<void>;
  onPrintQueueChange?: (callback: (data: any) => void) => void;
  removeListener?: (channel: string) => void;

  // Printer management
  getPrinters?: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  getDefaultPrinter?: () => string | null;
  setDefaultPrinter?: (printerName: string) => Promise<{ success: boolean; message?: string }>;

  // Print functions
  print?: (html: string, options?: { silent?: boolean; copies?: number }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
