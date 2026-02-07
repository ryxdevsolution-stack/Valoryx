'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Cloud, CloudOff, Check, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface SyncStatus {
  running: boolean;
  last_upload?: string;
  last_download?: string;
  next_sync?: string;
  interval_hours?: number;
  client_id?: string;
  sync_mode?: string;
  reason?: string;
}

interface SyncButtonProps {
  compact?: boolean;
  showStatus?: boolean;
}

export default function SyncButton({ compact = false, showStatus = true }: SyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/sync/status');
      setStatus(response.data);
    } catch (err) {
      setStatus({ running: false, reason: 'Sync not available' });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);

    try {
      const response = await api.post('/sync/trigger?type=upload');

      if (response.data.status === 'success') {
        setSyncResult('success');
        setTimeout(() => setSyncResult(null), 3000);
      } else {
        setSyncResult('error');
        setError(response.data.error || 'Sync failed');
      }

      // Refresh status after sync
      await fetchStatus();
    } catch (err: any) {
      setSyncResult('error');
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Compact version for header
  if (compact) {
    return (
      <button
        onClick={triggerSync}
        disabled={syncing || !status?.running}
        title={status?.running ? 'Sync to cloud' : 'Sync not available'}
        className={`
          relative p-2 rounded-lg transition-all
          ${syncing ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
          ${!status?.running ? 'opacity-50 cursor-not-allowed' : ''}
          ${syncResult === 'success' ? 'bg-green-100 dark:bg-green-900/30' : ''}
          ${syncResult === 'error' ? 'bg-red-100 dark:bg-red-900/30' : ''}
        `}
      >
        {syncResult === 'success' ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : syncResult === 'error' ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : status?.running ? (
          <Cloud className={`w-4 h-4 ${syncing ? 'text-blue-600 animate-pulse' : 'text-gray-600 dark:text-gray-400'}`} />
        ) : (
          <CloudOff className="w-4 h-4 text-gray-400" />
        )}
        {syncing && (
          <RefreshCw className="w-3 h-3 text-blue-600 animate-spin absolute -top-1 -right-1" />
        )}
      </button>
    );
  }

  // Full version with status
  return (
    <div className="flex items-center gap-2">
      {showStatus && status?.last_upload && (
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          Last sync: {formatLastSync(status.last_upload)}
        </span>
      )}

      <button
        onClick={triggerSync}
        disabled={syncing || !status?.running}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
          ${!status?.running
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : syncing
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : syncResult === 'success'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : syncResult === 'error'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
          }
        `}
      >
        {syncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Syncing...
          </>
        ) : syncResult === 'success' ? (
          <>
            <Check className="w-3.5 h-3.5" />
            Synced!
          </>
        ) : syncResult === 'error' ? (
          <>
            <AlertCircle className="w-3.5 h-3.5" />
            Failed
          </>
        ) : status?.running ? (
          <>
            <Cloud className="w-3.5 h-3.5" />
            Sync Now
          </>
        ) : (
          <>
            <CloudOff className="w-3.5 h-3.5" />
            Offline
          </>
        )}
      </button>

      {error && (
        <span className="text-[10px] text-red-500" title={error}>
          {error.length > 20 ? error.substring(0, 20) + '...' : error}
        </span>
      )}
    </div>
  );
}
