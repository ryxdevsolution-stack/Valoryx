'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  Webhook,
  Plus,
  Settings,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
  Copy,
  Eye,
  Code,
  Zap,
  Activity,
  Send
} from 'lucide-react';

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_triggered?: string;
  success_rate: number;
  total_deliveries: number;
  secret: string;
}

interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  response_code?: number;
  response_time?: number;
  timestamp: string;
  payload_preview: string;
}

const mockWebhooks: WebhookEndpoint[] = [
  {
    id: '1',
    name: 'Production Webhook',
    url: 'https://api.example.com/webhooks/billing',
    events: ['bill.created', 'bill.updated', 'payment.received'],
    is_active: true,
    created_at: '2024-10-15',
    last_triggered: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    success_rate: 98.5,
    total_deliveries: 1245,
    secret: 'whsec_abc123def456...',
  },
  {
    id: '2',
    name: 'Accounting Integration',
    url: 'https://accounting.app/hooks/ryx',
    events: ['bill.created', 'customer.created'],
    is_active: true,
    created_at: '2024-11-01',
    last_triggered: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    success_rate: 100,
    total_deliveries: 342,
    secret: 'whsec_xyz789ghi012...',
  },
  {
    id: '3',
    name: 'Test Endpoint',
    url: 'https://webhook.site/test-endpoint',
    events: ['*'],
    is_active: false,
    created_at: '2024-09-20',
    success_rate: 75,
    total_deliveries: 50,
    secret: 'whsec_test123...',
  },
];

const mockLogs: WebhookLog[] = [
  { id: '1', webhook_id: '1', event: 'bill.created', status: 'success', response_code: 200, response_time: 245, timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), payload_preview: '{"bill_id": "B001", "amount": 15000}' },
  { id: '2', webhook_id: '1', event: 'payment.received', status: 'success', response_code: 200, response_time: 180, timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), payload_preview: '{"payment_id": "P001", "amount": 15000}' },
  { id: '3', webhook_id: '2', event: 'bill.created', status: 'failed', response_code: 500, response_time: 5000, timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), payload_preview: '{"bill_id": "B002", "amount": 8500}' },
  { id: '4', webhook_id: '1', event: 'customer.created', status: 'success', response_code: 201, response_time: 320, timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), payload_preview: '{"customer_id": "C001", "name": "ABC Corp"}' },
  { id: '5', webhook_id: '1', event: 'bill.updated', status: 'pending', timestamp: new Date().toISOString(), payload_preview: '{"bill_id": "B003", "status": "paid"}' },
];

const availableEvents = [
  { category: 'Bills', events: ['bill.created', 'bill.updated', 'bill.deleted', 'bill.voided'] },
  { category: 'Payments', events: ['payment.received', 'payment.refunded', 'payment.failed'] },
  { category: 'Customers', events: ['customer.created', 'customer.updated', 'customer.deleted'] },
  { category: 'Users', events: ['user.created', 'user.updated', 'user.deleted', 'user.login'] },
  { category: 'Stock', events: ['stock.updated', 'stock.low_alert'] },
];

export default function WebhooksPage() {
  const { user } = useClient();
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>(mockWebhooks);
  const [logs] = useState<WebhookLog[]>(mockLogs);
  const [activeTab, setActiveTab] = useState<'endpoints' | 'logs' | 'events'>('endpoints');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const toggleWebhook = (id: string) => {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: !w.is_active } : w));
  };

  const getStatusIcon = (status: WebhookLog['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-500 animate-pulse" />;
    }
  };

  const getStatusColor = (status: WebhookLog['status']) => {
    switch (status) {
      case 'success': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Webhooks</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage webhook endpoints and event subscriptions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Webhook
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <Webhook className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Endpoints</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{webhooks.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Active</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{webhooks.filter(w => w.is_active).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Send className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Deliveries Today</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">156</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Success Rate</p>
              <p className="text-2xl font-bold text-emerald-600">98.2%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'endpoints', label: 'Endpoints', icon: Webhook },
          { id: 'logs', label: 'Delivery Logs', icon: Activity },
          { id: 'events', label: 'Available Events', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'endpoints' && (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{webhook.name}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      webhook.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {webhook.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <code className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 truncate max-w-md">
                      {webhook.url}
                    </code>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <Copy className="w-4 h-4" />
                    </button>
                    <a href={webhook.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {webhook.events.map(event => (
                      <span key={event} className="px-2 py-1 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-lg">
                        {event}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
                    <span>Success rate: <strong className={webhook.success_rate >= 95 ? 'text-emerald-600' : webhook.success_rate >= 80 ? 'text-amber-600' : 'text-red-600'}>{webhook.success_rate}%</strong></span>
                    <span>Total deliveries: <strong className="text-slate-700 dark:text-slate-300">{webhook.total_deliveries}</strong></span>
                    {webhook.last_triggered && (
                      <span>Last triggered: <strong className="text-slate-700 dark:text-slate-300">{new Date(webhook.last_triggered).toLocaleString()}</strong></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleWebhook(webhook.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      webhook.is_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      webhook.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Test">
                    <Play className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Settings">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Event</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Response</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Latency</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Timestamp</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(log.status)}`}>
                        {getStatusIcon(log.status)}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm font-mono text-slate-700 dark:text-slate-300">
                        {log.event}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      {log.response_code ? (
                        <span className={`font-mono text-sm ${
                          log.response_code >= 200 && log.response_code < 300 ? 'text-emerald-600' :
                          log.response_code >= 400 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {log.response_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {log.response_time ? `${log.response_time}ms` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors" title="View Payload">
                          <Eye className="w-4 h-4" />
                        </button>
                        {log.status === 'failed' && (
                          <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Retry">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableEvents.map((category) => (
            <div key={category.category} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{category.category}</h3>
              <div className="space-y-2">
                {category.events.map(event => (
                  <div key={event} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                    <code className="text-sm font-mono text-violet-600 dark:text-violet-400">{event}</code>
                    <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      <Code className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
