'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  Plug,
  Key,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Check,
  X,
  ExternalLink,
  Settings,
  Trash2,
  Plus,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  Zap,
  Globe,
  Database,
  Mail,
  CreditCard,
  FileText,
  Cloud,
  Smartphone,
  BarChart3,
  Package
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used?: string;
  permissions: string[];
  is_active: boolean;
  requests_today: number;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  category: 'payment' | 'accounting' | 'crm' | 'communication' | 'storage' | 'analytics';
  icon: string;
  status: 'connected' | 'available' | 'coming_soon';
  connected_at?: string;
}

const mockApiKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production API Key',
    key: 'ryx_live_sk_1234567890abcdef1234567890abcdef',
    created_at: '2024-10-15',
    last_used: new Date().toISOString(),
    permissions: ['read', 'write', 'delete'],
    is_active: true,
    requests_today: 1245,
  },
  {
    id: '2',
    name: 'Development Key',
    key: 'ryx_test_sk_abcdef1234567890abcdef1234567890',
    created_at: '2024-11-01',
    last_used: new Date(Date.now() - 86400000).toISOString(),
    permissions: ['read', 'write'],
    is_active: true,
    requests_today: 342,
  },
  {
    id: '3',
    name: 'Webhook Key',
    key: 'ryx_whk_9876543210fedcba9876543210fedcba',
    created_at: '2024-09-20',
    permissions: ['webhook'],
    is_active: false,
    requests_today: 0,
  },
];

const mockIntegrations: Integration[] = [
  { id: '1', name: 'Razorpay', description: 'Accept payments via UPI, cards, and netbanking', category: 'payment', icon: '💳', status: 'connected', connected_at: '2024-08-15' },
  { id: '2', name: 'Tally', description: 'Sync invoices with Tally accounting software', category: 'accounting', icon: '📊', status: 'available' },
  { id: '3', name: 'GST Portal', description: 'Auto-file GST returns', category: 'accounting', icon: '🏛️', status: 'connected', connected_at: '2024-06-01' },
  { id: '4', name: 'WhatsApp Business', description: 'Send invoices and updates via WhatsApp', category: 'communication', icon: '💬', status: 'available' },
  { id: '5', name: 'Google Drive', description: 'Automatic backup to Google Drive', category: 'storage', icon: '☁️', status: 'connected', connected_at: '2024-07-20' },
  { id: '6', name: 'Zoho CRM', description: 'Sync customers with Zoho CRM', category: 'crm', icon: '👥', status: 'available' },
  { id: '7', name: 'Shiprocket', description: 'Shipping and logistics integration', category: 'communication', icon: '📦', status: 'coming_soon' },
  { id: '8', name: 'Google Analytics', description: 'Track billing analytics', category: 'analytics', icon: '📈', status: 'available' },
];

export default function IntegrationsPage() {
  const { user } = useClient();
  const [activeTab, setActiveTab] = useState<'api' | 'integrations'>('api');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockApiKeys);
  const [integrations] = useState<Integration[]>(mockIntegrations);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleKeyVisibility = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleKeyStatus = (id: string) => {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !k.is_active } : k));
  };

  const maskKey = (key: string) => {
    return key.substring(0, 12) + '••••••••••••••••••••••••';
  };

  const getCategoryIcon = (category: Integration['category']) => {
    switch (category) {
      case 'payment': return <CreditCard className="w-5 h-5" />;
      case 'accounting': return <FileText className="w-5 h-5" />;
      case 'crm': return <Database className="w-5 h-5" />;
      case 'communication': return <Mail className="w-5 h-5" />;
      case 'storage': return <Cloud className="w-5 h-5" />;
      case 'analytics': return <BarChart3 className="w-5 h-5" />;
      default: return <Package className="w-5 h-5" />;
    }
  };

  const getCategoryColor = (category: Integration['category']) => {
    switch (category) {
      case 'payment': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'accounting': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'crm': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
      case 'communication': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'storage': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      case 'analytics': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
    }
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Integrations</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage API keys and third-party integrations</p>
        </div>
        <a
          href="#"
          className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium"
        >
          <FileText className="w-4 h-4" />
          API Documentation
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('api')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'api'
              ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Key className="w-5 h-5" />
          API Keys
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'integrations'
              ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Plug className="w-5 h-5" />
          Integrations
        </button>
      </div>

      {activeTab === 'api' && (
        <>
          {/* API Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30">
                  <Key className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Active Keys</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{apiKeys.filter(k => k.is_active).length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                  <Activity className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Requests Today</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{apiKeys.reduce((sum, k) => sum + k.requests_today, 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Rate Limit</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">10K/hr</p>
                </div>
              </div>
            </div>
          </div>

          {/* API Keys List */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">API Keys</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors text-sm font-medium">
                <Plus className="w-4 h-4" />
                Create New Key
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{apiKey.name}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          apiKey.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {apiKey.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300">
                          {showKeys[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                        </code>
                        <button
                          onClick={() => toggleKeyVisibility(apiKey.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          {showKeys[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          {copiedKey === apiKey.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Created: {new Date(apiKey.created_at).toLocaleDateString()}
                        </span>
                        {apiKey.last_used && (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Last used: {new Date(apiKey.last_used).toLocaleString()}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {apiKey.requests_today.toLocaleString()} requests today
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        {apiKey.permissions.map(perm => (
                          <span key={perm} className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded capitalize">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleKeyStatus(apiKey.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          apiKey.is_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          apiKey.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'integrations' && (
        <>
          {/* Connected Integrations */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Connected</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.filter(i => i.status === 'connected').map((integration) => (
                <div key={integration.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-emerald-200 dark:border-emerald-800 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{integration.icon}</span>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{integration.name}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(integration.category)}`}>
                          {integration.category}
                        </span>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{integration.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-500 dark:text-slate-500">
                      Since {new Date(integration.connected_at!).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors">
                        <Settings className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Integrations */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Available</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.filter(i => i.status === 'available').map((integration) => (
                <div key={integration.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{integration.icon}</span>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{integration.name}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(integration.category)}`}>
                          {integration.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{integration.description}</p>
                  <button className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors">
                    Connect
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Coming Soon */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Coming Soon</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.filter(i => i.status === 'coming_soon').map((integration) => (
                <div key={integration.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 opacity-60">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl grayscale">{integration.icon}</span>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{integration.name}</h3>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{integration.description}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
