'use client';

import React, { useState, useEffect } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  Activity,
  Server,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Wifi,
  Globe,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Thermometer,
  BarChart3,
  Timer,
  Signal,
  Cloud
} from 'lucide-react';

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
  history: number[];
}

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  uptime: string;
  latency: number;
  lastCheck: string;
}

const mockMetrics: SystemMetric[] = [
  { name: 'CPU Usage', value: 45, unit: '%', status: 'healthy', trend: 'stable', history: [42, 48, 45, 52, 45, 43, 45] },
  { name: 'Memory Usage', value: 68, unit: '%', status: 'healthy', trend: 'up', history: [60, 62, 65, 64, 66, 67, 68] },
  { name: 'Disk Usage', value: 45, unit: '%', status: 'healthy', trend: 'stable', history: [44, 44, 45, 45, 45, 45, 45] },
  { name: 'Network I/O', value: 124, unit: 'MB/s', status: 'healthy', trend: 'down', history: [150, 145, 130, 128, 125, 124, 124] },
];

const mockServices: ServiceStatus[] = [
  { name: 'API Server', status: 'operational', uptime: '99.99%', latency: 45, lastCheck: new Date().toISOString() },
  { name: 'Database', status: 'operational', uptime: '99.95%', latency: 12, lastCheck: new Date().toISOString() },
  { name: 'Cache Server', status: 'operational', uptime: '99.98%', latency: 2, lastCheck: new Date().toISOString() },
  { name: 'File Storage', status: 'operational', uptime: '99.90%', latency: 85, lastCheck: new Date().toISOString() },
  { name: 'Email Service', status: 'degraded', uptime: '98.50%', latency: 250, lastCheck: new Date().toISOString() },
  { name: 'Background Jobs', status: 'operational', uptime: '99.85%', latency: 0, lastCheck: new Date().toISOString() },
];

export default function SystemHealthPage() {
  const { user } = useClient();
  const [metrics, setMetrics] = useState<SystemMetric[]>(mockMetrics);
  const [services, setServices] = useState<ServiceStatus[]>(mockServices);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        refreshData();
      }, 15000); // Refresh every 15 seconds (optimized from 30s)
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const refreshData = () => {
    setRefreshing(true);
    // Data refresh (optimized from 1000ms)
    setTimeout(() => {
      setMetrics(prev => prev.map(m => ({
        ...m,
        value: m.value + Math.floor(Math.random() * 10) - 5,
        history: [...m.history.slice(1), m.value],
      })));
      setLastUpdated(new Date());
      setRefreshing(false);
    }, 200);
  };

  const overallHealth = services.every(s => s.status === 'operational')
    ? 'healthy'
    : services.some(s => s.status === 'down')
    ? 'critical'
    : 'warning';

  const getStatusColor = (status: 'operational' | 'degraded' | 'down' | 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return 'text-emerald-600';
      case 'degraded':
      case 'warning':
        return 'text-amber-600';
      case 'down':
      case 'critical':
        return 'text-red-600';
      default:
        return 'text-slate-600';
    }
  };

  const getStatusBg = (status: 'operational' | 'degraded' | 'down' | 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return 'bg-emerald-100 dark:bg-emerald-900/30';
      case 'degraded':
      case 'warning':
        return 'bg-amber-100 dark:bg-amber-900/30';
      case 'down':
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30';
      default:
        return 'bg-slate-100 dark:bg-slate-700';
    }
  };

  const getStatusIcon = (status: 'operational' | 'degraded' | 'down') => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getMetricIcon = (name: string) => {
    switch (name) {
      case 'CPU Usage':
        return <Cpu className="w-5 h-5" />;
      case 'Memory Usage':
        return <MemoryStick className="w-5 h-5" />;
      case 'Disk Usage':
        return <HardDrive className="w-5 h-5" />;
      case 'Network I/O':
        return <Wifi className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const renderMiniChart = (history: number[], status: 'healthy' | 'warning' | 'critical') => {
    const max = Math.max(...history);
    const min = Math.min(...history);
    const range = max - min || 1;
    const color = status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

    return (
      <div className="flex items-end gap-1 h-8">
        {history.map((value, index) => (
          <div
            key={index}
            className="w-2 rounded-t transition-all duration-300"
            style={{
              height: `${((value - min) / range) * 100}%`,
              minHeight: '4px',
              backgroundColor: color,
              opacity: 0.3 + (index / history.length) * 0.7,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">System Health</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Monitor infrastructure and service status
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-slate-600 dark:text-slate-400">Auto-refresh</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${autoRefresh ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
                  ${autoRefresh ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </label>
          <button
            onClick={refreshData}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div className={`rounded-2xl p-6 mb-6 ${getStatusBg(overallHealth)} border ${
        overallHealth === 'healthy' ? 'border-emerald-200 dark:border-emerald-800' :
        overallHealth === 'warning' ? 'border-amber-200 dark:border-amber-800' :
        'border-red-200 dark:border-red-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${
              overallHealth === 'healthy' ? 'bg-emerald-500' :
              overallHealth === 'warning' ? 'bg-amber-500' :
              'bg-red-500'
            }`}>
              {overallHealth === 'healthy' ? (
                <CheckCircle className="w-8 h-8 text-white" />
              ) : overallHealth === 'warning' ? (
                <AlertTriangle className="w-8 h-8 text-white" />
              ) : (
                <XCircle className="w-8 h-8 text-white" />
              )}
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${getStatusColor(overallHealth)}`}>
                {overallHealth === 'healthy' ? 'All Systems Operational' :
                 overallHealth === 'warning' ? 'Partial Service Degradation' :
                 'System Issues Detected'}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                {services.filter(s => s.status === 'operational').length} of {services.length} services are operational
              </p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400">Operational</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400">Degraded</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400">Down</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((metric) => (
          <div key={metric.name} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2.5 rounded-xl ${getStatusBg(metric.status)}`}>
                <span className={getStatusColor(metric.status)}>
                  {getMetricIcon(metric.name)}
                </span>
              </div>
              {metric.trend && (
                <div className={`flex items-center gap-1 text-xs font-medium ${
                  metric.trend === 'up' ? 'text-amber-600' :
                  metric.trend === 'down' ? 'text-emerald-600' :
                  'text-slate-500'
                }`}>
                  {metric.trend === 'up' && <TrendingUp className="w-3 h-3" />}
                  {metric.trend === 'down' && <TrendingDown className="w-3 h-3" />}
                  {metric.trend === 'stable' && <Signal className="w-3 h-3" />}
                  {metric.trend}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{metric.name}</p>
                <p className={`text-3xl font-bold mt-1 ${getStatusColor(metric.status)}`}>
                  {metric.value}<span className="text-lg ml-1">{metric.unit}</span>
                </p>
              </div>
              {renderMiniChart(metric.history, metric.status)}
            </div>
            <div className="mt-4 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  metric.status === 'healthy' ? 'bg-emerald-500' :
                  metric.status === 'warning' ? 'bg-amber-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${Math.min(metric.value, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Services Status */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Service Status</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time health of system components</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium rounded-full">
                {services.filter(s => s.status === 'operational').length} Healthy
              </span>
              {services.some(s => s.status === 'degraded') && (
                <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-full">
                  {services.filter(s => s.status === 'degraded').length} Degraded
                </span>
              )}
              {services.some(s => s.status === 'down') && (
                <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium rounded-full">
                  {services.filter(s => s.status === 'down').length} Down
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {services.map((service) => (
            <div key={service.name} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getStatusIcon(service.status)}
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{service.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Uptime: {service.uptime}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Latency</p>
                    <p className={`font-semibold ${
                      service.latency < 100 ? 'text-emerald-600' :
                      service.latency < 200 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {service.latency}ms
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
                    service.status === 'operational' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    service.status === 'degraded' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {service.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">API Response Time</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Average latency</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-600">45<span className="text-lg ml-1">ms</span></p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> 12% faster than yesterday
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <Zap className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Requests Today</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total API calls</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-violet-600">12,450</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> 8% more than yesterday
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Timer className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Uptime</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Last 30 days</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-600">99.95<span className="text-lg ml-1">%</span></p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
            Only 21 minutes of downtime
          </p>
        </div>
      </div>
    </div>
  );
}
