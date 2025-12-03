'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  HardDrive,
  Database,
  FileText,
  Image as ImageIcon,
  File,
  Folder,
  Download,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  Filter,
  MoreVertical,
  AlertTriangle,
  CheckCircle,
  Cloud,
  Server,
  Archive,
  TrendingUp
} from 'lucide-react';

interface StorageItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  category: 'documents' | 'images' | 'backups' | 'exports' | 'logs';
  size: number;
  created_at: string;
  modified_at: string;
}

interface StorageStats {
  total: number;
  used: number;
  documents: number;
  images: number;
  backups: number;
  exports: number;
  logs: number;
}

const mockStorageStats: StorageStats = {
  total: 53687091200, // 50 GB
  used: 13421772800, // 12.5 GB
  documents: 2147483648, // 2 GB
  images: 3221225472, // 3 GB
  backups: 5368709120, // 5 GB
  exports: 1073741824, // 1 GB
  logs: 1610612736, // 1.5 GB
};

const mockFiles: StorageItem[] = [
  { id: '1', name: 'backup_2024_12_01.zip', type: 'file', category: 'backups', size: 2684354560, created_at: '2024-12-01', modified_at: '2024-12-01' },
  { id: '2', name: 'backup_2024_11_30.zip', type: 'file', category: 'backups', size: 2576980378, created_at: '2024-11-30', modified_at: '2024-11-30' },
  { id: '3', name: 'export_bills_nov.csv', type: 'file', category: 'exports', size: 52428800, created_at: '2024-11-30', modified_at: '2024-11-30' },
  { id: '4', name: 'company_logo.png', type: 'file', category: 'images', size: 1048576, created_at: '2024-10-15', modified_at: '2024-10-15' },
  { id: '5', name: 'audit_log_2024_12.log', type: 'file', category: 'logs', size: 104857600, created_at: '2024-12-01', modified_at: '2024-12-03' },
];

export default function StoragePage() {
  const { user } = useClient();
  const [stats] = useState<StorageStats>(mockStorageStats);
  const [files, setFiles] = useState<StorageItem[]>(mockFiles);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsagePercentage = () => {
    return ((stats.used / stats.total) * 100).toFixed(1);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'documents': return <FileText className="w-5 h-5 text-blue-600" />;
      case 'images': return <ImageIcon className="w-5 h-5 text-pink-600" />;
      case 'backups': return <Archive className="w-5 h-5 text-violet-600" />;
      case 'exports': return <Download className="w-5 h-5 text-emerald-600" />;
      case 'logs': return <File className="w-5 h-5 text-amber-600" />;
      default: return <Folder className="w-5 h-5 text-slate-600" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'documents': return 'bg-blue-500';
      case 'images': return 'bg-pink-500';
      case 'backups': return 'bg-violet-500';
      case 'exports': return 'bg-emerald-500';
      case 'logs': return 'bg-amber-500';
      default: return 'bg-slate-500';
    }
  };

  const filteredFiles = files.filter(f => {
    if (activeCategory !== 'all' && f.category !== activeCategory) return false;
    if (searchTerm && !f.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const deleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const categories = [
    { id: 'all', name: 'All Files', count: files.length },
    { id: 'documents', name: 'Documents', count: files.filter(f => f.category === 'documents').length, size: stats.documents },
    { id: 'images', name: 'Images', count: files.filter(f => f.category === 'images').length, size: stats.images },
    { id: 'backups', name: 'Backups', count: files.filter(f => f.category === 'backups').length, size: stats.backups },
    { id: 'exports', name: 'Exports', count: files.filter(f => f.category === 'exports').length, size: stats.exports },
    { id: 'logs', name: 'Logs', count: files.filter(f => f.category === 'logs').length, size: stats.logs },
  ];

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Storage Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage files and storage usage</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm">
            <Upload className="w-4 h-4" />
            Upload Files
          </button>
        </div>
      </div>

      {/* Storage Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-shrink-0">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" className="dark:stroke-slate-700" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${parseFloat(getUsagePercentage()) * 2.51} 251`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{getUsagePercentage()}%</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Storage Usage</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {formatBytes(stats.used)} of {formatBytes(stats.total)}
              </span>
            </div>
            <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
              <div className="h-full flex">
                <div className="bg-blue-500 transition-all" style={{ width: `${(stats.documents / stats.total) * 100}%` }} title="Documents"></div>
                <div className="bg-pink-500 transition-all" style={{ width: `${(stats.images / stats.total) * 100}%` }} title="Images"></div>
                <div className="bg-violet-500 transition-all" style={{ width: `${(stats.backups / stats.total) * 100}%` }} title="Backups"></div>
                <div className="bg-emerald-500 transition-all" style={{ width: `${(stats.exports / stats.total) * 100}%` }} title="Exports"></div>
                <div className="bg-amber-500 transition-all" style={{ width: `${(stats.logs / stats.total) * 100}%` }} title="Logs"></div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { name: 'Documents', size: stats.documents, color: 'bg-blue-500' },
                { name: 'Images', size: stats.images, color: 'bg-pink-500' },
                { name: 'Backups', size: stats.backups, color: 'bg-violet-500' },
                { name: 'Exports', size: stats.exports, color: 'bg-emerald-500' },
                { name: 'Logs', size: stats.logs, color: 'bg-amber-500' },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.name}</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatBytes(item.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 space-y-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Available</span>
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatBytes(stats.total - stats.used)}</p>
            </div>
            {parseFloat(getUsagePercentage()) > 80 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Storage running low</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Categories and Files */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Category Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Categories</h3>
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                    activeCategory === cat.id
                      ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {cat.id === 'all' ? <Folder className="w-4 h-4" /> : getCategoryIcon(cat.id)}
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Files List */}
        <div className="flex-1">
          {/* Search */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Files Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Category</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Size</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Modified</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {getCategoryIcon(file.category)}
                          <span className="font-medium text-slate-900 dark:text-white">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${
                          file.category === 'documents' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          file.category === 'images' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' :
                          file.category === 'backups' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                          file.category === 'exports' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          {file.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {new Date(file.modified_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
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

            {filteredFiles.length === 0 && (
              <div className="p-12 text-center">
                <Folder className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No files found</h3>
                <p className="text-slate-500 dark:text-slate-400">No files match your search criteria</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
