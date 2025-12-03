'use client';

import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  Cloud,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  Calendar,
  FileArchive,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Server,
  Timer,
  Zap
} from 'lucide-react';
import {
  Backup,
  BackupSchedule,
  formatDateTime,
  getStatusColors,
  PageHeader,
  Button,
  Tabs,
  Toggle,
  Card,
  StatusBadge,
  ProgressBar,
  Alert
} from '@/lib/admin';

// Mock data factory functions
const createMockBackups = (): Backup[] => [
  {
    id: '1',
    name: 'Full Backup - Dec 2024',
    type: 'full',
    status: 'completed',
    size: '2.4 GB',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 1.5).toISOString(),
    storage_location: 'cloud',
    retention_days: 30,
  },
  {
    id: '2',
    name: 'Incremental Backup',
    type: 'incremental',
    status: 'in_progress',
    size: '145 MB',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    storage_location: 'local',
    retention_days: 7,
  },
  {
    id: '3',
    name: 'Daily Backup - Dec 2',
    type: 'full',
    status: 'completed',
    size: '2.3 GB',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
    storage_location: 'cloud',
    retention_days: 30,
  },
  {
    id: '4',
    name: 'Manual Backup',
    type: 'full',
    status: 'failed',
    size: '0 B',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    storage_location: 'local',
    retention_days: 7,
  },
];

const createMockSchedules = (): BackupSchedule[] => [
  {
    id: '1',
    name: 'Daily Full Backup',
    type: 'full',
    frequency: 'daily',
    time: '02:00',
    enabled: true,
    last_run: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    next_run: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    retention_count: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Hourly Incremental',
    type: 'incremental',
    frequency: 'hourly',
    time: ':00',
    enabled: true,
    last_run: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    next_run: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
    retention_count: 24,
    created_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Weekly Archive',
    type: 'full',
    frequency: 'weekly',
    time: '03:00',
    enabled: false,
    next_run: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
    retention_count: 4,
    created_at: new Date().toISOString(),
  },
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  in_progress: <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />,
  failed: <XCircle className="w-5 h-5 text-red-500" />,
  scheduled: <Clock className="w-5 h-5 text-amber-500" />,
};

const STORAGE_ICONS: Record<string, React.ReactNode> = {
  cloud: <Cloud className="w-4 h-4 text-blue-500" />,
  s3: <Server className="w-4 h-4 text-orange-500" />,
  local: <HardDrive className="w-4 h-4 text-slate-500" />,
};

export default function BackupRecoveryPage() {
  const [backups, setBackups] = useState<Backup[]>(createMockBackups);
  const [schedules, setSchedules] = useState<BackupSchedule[]>(createMockSchedules);
  const [activeTab, setActiveTab] = useState<'backups' | 'schedules' | 'restore'>('backups');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  const storageStats = {
    total: '50 GB',
    used: '12.4 GB',
    percentage: 24.8,
    backupCount: backups.length,
  };

  const startBackup = async (type: 'full' | 'incremental') => {
    setIsBackingUp(true);
    setTimeout(() => {
      const newBackup: Backup = {
        id: Date.now().toString(),
        name: `Manual ${type} Backup`,
        type,
        status: 'in_progress',
        size: '0 B',
        created_at: new Date().toISOString(),
        storage_location: 'local',
        retention_days: 7,
      };
      setBackups(prev => [newBackup, ...prev]);
      setIsBackingUp(false);
    }, 2000);
  };

  const toggleSchedule = (id: string) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const deleteBackup = (id: string) => {
    setBackups(prev => prev.filter(b => b.id !== id));
  };

  const tabs = [
    { id: 'backups', label: 'Backups', icon: Database },
    { id: 'schedules', label: 'Schedules', icon: Calendar },
    { id: 'restore', label: 'Restore', icon: RotateCcw },
  ];

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <PageHeader
        title="Backup & Recovery"
        description="Manage data backups and disaster recovery"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => startBackup('incremental')}
              disabled={isBackingUp}
              icon={Zap}
            >
              Quick Backup
            </Button>
            <Button
              onClick={() => startBackup('full')}
              disabled={isBackingUp}
              loading={isBackingUp}
              icon={Database}
            >
              Full Backup
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Storage Used</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{storageStats.used}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">of {storageStats.total}</p>
            </div>
            <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <HardDrive className="w-6 h-6 text-violet-600" />
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar value={storageStats.percentage} color="violet" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Backups</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{storageStats.backupCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">stored safely</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <FileArchive className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Last Backup</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">2 hours ago</p>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Successful
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Clock className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Next Scheduled</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">In 2 hours</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Daily Full Backup</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Timer className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as typeof activeTab)}
        variant="pills"
      />

      <div className="mt-6">
        {activeTab === 'backups' && (
          <Card noPadding>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Backup</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Storage</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {backups.map((backup) => (
                    <tr key={backup.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {STATUS_ICONS[backup.status]}
                          <span className="font-medium text-slate-900 dark:text-white">{backup.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={backup.type} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={backup.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{backup.size}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {STORAGE_ICONS[backup.storage_location]}
                          <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">{backup.storage_location}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(backup.created_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {backup.status === 'completed' && (
                            <>
                              <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Download">
                                <Download className="w-4 h-4" />
                              </button>
                              <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Restore">
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => deleteBackup(backup.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'schedules' && (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <Card key={schedule.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${schedule.enabled ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <Calendar className={`w-6 h-6 ${schedule.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{schedule.name}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        <span className="capitalize">{schedule.frequency}</span> at {schedule.time} •
                        <StatusBadge status={schedule.type} size="sm" className="ml-1" />
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                        {schedule.last_run && (
                          <span>Last run: {formatDateTime(schedule.last_run)}</span>
                        )}
                        <span>Next: {formatDateTime(schedule.next_run)}</span>
                        <span>Keep: {schedule.retention_count} backups</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={schedule.enabled}
                      onChange={() => toggleSchedule(schedule.id)}
                    />
                    <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
            <button className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-500 dark:text-slate-400 hover:text-violet-600 hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
              + Add New Schedule
            </button>
          </div>
        )}

        {activeTab === 'restore' && (
          <Card>
            <div className="max-w-2xl mx-auto text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Restore from Backup</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-8">
                Select a backup to restore your system to a previous state. This action will replace current data.
              </p>

              <Alert type="warning" title="Warning" className="mb-6 text-left">
                Restoring from a backup will overwrite all current data. This action cannot be undone.
                Make sure to create a backup of your current data before proceeding.
              </Alert>

              <div className="space-y-3 mb-8">
                {backups.filter(b => b.status === 'completed').map((backup) => (
                  <button
                    key={backup.id}
                    onClick={() => setSelectedBackup(backup.id)}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left
                      ${selectedBackup === backup.id
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <FileArchive className={`w-5 h-5 ${selectedBackup === backup.id ? 'text-violet-600' : 'text-slate-400'}`} />
                      <div>
                        <p className={`font-medium ${selectedBackup === backup.id ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-white'}`}>
                          {backup.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {formatDateTime(backup.created_at)} • {backup.size}
                        </p>
                      </div>
                    </div>
                    {selectedBackup === backup.id && (
                      <CheckCircle className="w-5 h-5 text-violet-600" />
                    )}
                  </button>
                ))}
              </div>

              <Button
                disabled={!selectedBackup}
                variant="primary"
                size="lg"
                icon={RotateCcw}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Restore Selected Backup
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
