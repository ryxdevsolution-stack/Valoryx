'use client';

/**
 * PrintStatus Component
 * Shows print queue status in the UI (for Electron desktop app)
 * Displays pending/failed jobs and allows retry
 */

import { useState, useEffect } from 'react';
import { Printer, AlertCircle, CheckCircle2, Clock, RefreshCw, X } from 'lucide-react';
import { qzPrinter, getPrintSystemStatus } from '@/lib/qzPrinter';

interface PrintQueueStatus {
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
}

export default function PrintStatus() {
  const [isElectron, setIsElectron] = useState(false);
  const [queueStatus, setQueueStatus] = useState<PrintQueueStatus | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    const status = getPrintSystemStatus();
    setIsElectron(status.isElectron);

    if (!status.isElectron) return;

    // Initial fetch
    fetchQueueStatus();

    // Set up polling for queue status (optimized from 3s)
    const interval = setInterval(fetchQueueStatus, 1500);

    // Listen for queue changes
    if (window.electronAPI?.onPrintQueueChange) {
      window.electronAPI.onPrintQueueChange((data) => {
        setQueueStatus(data);
      });
    }

    return () => {
      clearInterval(interval);
      window.electronAPI?.removeListener?.('print:queue-change');
    };
  }, []);

  const fetchQueueStatus = async () => {
    try {
      const status = await qzPrinter.getElectronQueueStatus();
      setQueueStatus(status as PrintQueueStatus);
    } catch (error) {
      console.error('Failed to fetch print queue status:', error);
    }
  };

  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      await qzPrinter.retryElectronFailedJobs();
      await fetchQueueStatus();
    } catch (error) {
      console.error('Failed to retry jobs:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleClearQueue = async () => {
    if (!window.electronAPI?.clearPrintQueue) return;
    try {
      await window.electronAPI.clearPrintQueue();
      await fetchQueueStatus();
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  };

  // Don't render if not in Electron
  if (!isElectron) return null;

  // Don't render if no queue status
  if (!queueStatus) return null;

  const { pending, failed, completed, defaultPrinter, isProcessing } = queueStatus;
  const hasIssues = failed > 0;
  const hasActivity = pending > 0 || isProcessing;

  // Minimal view - just show status indicator
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all z-50 ${
          hasIssues
            ? 'bg-red-500 text-white hover:bg-red-600'
            : hasActivity
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <Printer className="w-4 h-4" />
        {hasIssues && (
          <>
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{failed} failed</span>
          </>
        )}
        {hasActivity && !hasIssues && (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">{pending} printing</span>
          </>
        )}
        {!hasIssues && !hasActivity && (
          <span className="text-sm font-medium">Print Ready</span>
        )}
      </button>
    );
  }

  // Expanded view - show full status
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5 text-gray-700" />
          <span className="font-semibold text-gray-900">Print Queue</span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Printer Status */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Printer:</span>
          <span className="text-sm font-medium text-gray-900">
            {defaultPrinter || 'Not selected'}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-gray-600">Status:</span>
          <span className={`text-sm font-medium ${isProcessing ? 'text-blue-600' : 'text-green-600'}`}>
            {isProcessing ? 'Printing...' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-blue-600">
              <Clock className="w-4 h-4" />
              <span className="text-lg font-bold">{pending}</span>
            </div>
            <span className="text-xs text-gray-500">Pending</span>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-red-600">
              <AlertCircle className="w-4 h-4" />
              <span className="text-lg font-bold">{failed}</span>
            </div>
            <span className="text-xs text-gray-500">Failed</span>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-lg font-bold">{completed}</span>
            </div>
            <span className="text-xs text-gray-500">Completed</span>
          </div>
        </div>
      </div>

      {/* Failed Jobs Alert */}
      {failed > 0 && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{failed} jobs waiting for printer</span>
          </div>
          <p className="text-xs text-red-600 mb-2">
            Will auto-retry when printer is available
          </p>
          <button
            onClick={handleRetryFailed}
            disabled={isRetrying}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : 'Retry Now'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
        <button
          onClick={fetchQueueStatus}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        {(pending > 0 || failed > 0) && (
          <button
            onClick={handleClearQueue}
            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
          >
            Clear Queue
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 rounded-b-lg border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          Total printed: {queueStatus.stats?.totalPrinted || 0}
        </div>
      </div>
    </div>
  );
}
