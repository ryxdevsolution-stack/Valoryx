'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  Shield,
  Lock,
  Key,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  Globe,
  Smartphone,
  Monitor,
  MapPin,
  RefreshCw,
  Settings,
  Ban,
  UserX,
  Activity,
  FileText,
  Download,
  Filter,
  Search
} from 'lucide-react';

interface SecurityEvent {
  id: string;
  type: 'login_success' | 'login_failed' | 'password_changed' | 'permission_changed' | 'suspicious_activity' | 'session_expired';
  description: string;
  user_email: string;
  ip_address: string;
  location: string;
  device: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ActiveSession {
  id: string;
  user_email: string;
  user_name: string;
  device: string;
  browser: string;
  ip_address: string;
  location: string;
  started_at: string;
  last_activity: string;
  is_current: boolean;
}

const mockSecurityEvents: SecurityEvent[] = [
  { id: '1', type: 'login_failed', description: '5 failed login attempts', user_email: 'admin@abc.com', ip_address: '192.168.1.100', location: 'Mumbai, India', device: 'Chrome on Windows', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), severity: 'high' },
  { id: '2', type: 'login_success', description: 'Successful login', user_email: 'john@xyz.com', ip_address: '10.0.0.50', location: 'Delhi, India', device: 'Safari on Mac', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), severity: 'low' },
  { id: '3', type: 'password_changed', description: 'Password updated', user_email: 'admin@example.com', ip_address: '172.16.0.1', location: 'Bangalore, India', device: 'Firefox on Linux', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), severity: 'medium' },
  { id: '4', type: 'suspicious_activity', description: 'Login from new location', user_email: 'user@test.com', ip_address: '203.45.67.89', location: 'Singapore', device: 'Chrome on Android', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), severity: 'high' },
  { id: '5', type: 'permission_changed', description: 'Admin role assigned', user_email: 'manager@company.com', ip_address: '192.168.1.50', location: 'Chennai, India', device: 'Edge on Windows', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), severity: 'medium' },
];

const mockActiveSessions: ActiveSession[] = [
  { id: '1', user_email: 'admin@ryxbilling.com', user_name: 'Super Admin', device: 'Desktop', browser: 'Chrome 120', ip_address: '192.168.1.100', location: 'Mumbai, India', started_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), last_activity: new Date().toISOString(), is_current: true },
  { id: '2', user_email: 'john@abc.com', user_name: 'John Doe', device: 'Mobile', browser: 'Safari 17', ip_address: '10.0.0.50', location: 'Delhi, India', started_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), last_activity: new Date(Date.now() - 1000 * 60 * 5).toISOString(), is_current: false },
  { id: '3', user_email: 'jane@xyz.com', user_name: 'Jane Smith', device: 'Tablet', browser: 'Chrome 119', ip_address: '172.16.0.25', location: 'Bangalore, India', started_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), last_activity: new Date(Date.now() - 1000 * 60 * 15).toISOString(), is_current: false },
];

export default function SecurityPage() {
  const { user } = useClient();
  const [activeTab, setActiveTab] = useState<'events' | 'sessions' | 'policies'>('events');
  const [events] = useState<SecurityEvent[]>(mockSecurityEvents);
  const [sessions, setSessions] = useState<ActiveSession[]>(mockActiveSessions);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filteredEvents = events.filter(e => {
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
    if (searchTerm && !e.user_email.toLowerCase().includes(searchTerm.toLowerCase()) && !e.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const securityStats = {
    totalEvents: events.length,
    criticalEvents: events.filter(e => e.severity === 'critical' || e.severity === 'high').length,
    activeSessions: sessions.length,
    failedLogins: events.filter(e => e.type === 'login_failed').length,
  };

  const terminateSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const getSeverityColor = (severity: SecurityEvent['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getEventIcon = (type: SecurityEvent['type']) => {
    switch (type) {
      case 'login_success': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'login_failed': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'password_changed': return <Key className="w-5 h-5 text-blue-500" />;
      case 'permission_changed': return <Shield className="w-5 h-5 text-violet-500" />;
      case 'suspicious_activity': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Activity className="w-5 h-5 text-slate-500" />;
    }
  };

  const getDeviceIcon = (device: string) => {
    if (device.toLowerCase().includes('mobile') || device.toLowerCase().includes('android') || device.toLowerCase().includes('iphone')) {
      return <Smartphone className="w-4 h-4" />;
    }
    return <Monitor className="w-4 h-4" />;
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Security Center</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor and manage system security</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors">
            <Download className="w-4 h-4" />
            Export Logs
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors">
            <Settings className="w-4 h-4" />
            Security Settings
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Security Events</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{securityStats.totalEvents}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Critical Alerts</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{securityStats.criticalEvents}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Active Sessions</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{securityStats.activeSessions}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Globe className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Failed Logins</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{securityStats.failedLogins}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'events', label: 'Security Events', icon: Activity },
          { id: 'sessions', label: 'Active Sessions', icon: Globe },
          { id: 'policies', label: 'Security Policies', icon: Shield },
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

      {activeTab === 'events' && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Events List */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredEvents.map((event) => (
                <div key={event.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{event.description}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{event.user_email}</p>
                        </div>
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${getSeverityColor(event.severity)}`}>
                          {event.severity}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {event.ip_address}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          {event.device}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Active Sessions</h2>
            <button className="text-sm text-red-600 hover:text-red-700 font-medium">
              Terminate All Other Sessions
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {sessions.map((session) => (
              <div key={session.id} className={`p-4 ${session.is_current ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700">
                      {getDeviceIcon(session.device)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-white">{session.user_name}</p>
                        {session.is_current && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{session.user_email}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-500">
                        <span>{session.device} • {session.browser}</span>
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.ip_address}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {session.location}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        Last activity: {new Date(session.last_activity).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {!session.is_current && (
                    <button
                      onClick={() => terminateSession(session.id)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'policies' && (
        <div className="space-y-4">
          {[
            { title: 'Password Policy', description: 'Minimum 8 characters, uppercase, number required', enabled: true, icon: Key },
            { title: 'Two-Factor Authentication', description: 'Optional for all users', enabled: false, icon: Smartphone },
            { title: 'Session Timeout', description: 'Auto-logout after 60 minutes of inactivity', enabled: true, icon: Clock },
            { title: 'IP Whitelist', description: 'Restrict access to specific IP addresses', enabled: false, icon: Globe },
            { title: 'Login Attempt Lockout', description: 'Lock account after 5 failed attempts', enabled: true, icon: Lock },
            { title: 'Audit Logging', description: 'Log all security-related events', enabled: true, icon: FileText },
          ].map((policy) => {
            const Icon = policy.icon;
            return (
              <div key={policy.title} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${policy.enabled ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <Icon className={`w-5 h-5 ${policy.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{policy.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{policy.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${policy.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {policy.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
