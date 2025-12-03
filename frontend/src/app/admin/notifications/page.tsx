'use client';

import React, { useState } from 'react';
import {
  Bell,
  Mail,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Clock,
  Settings,
  Trash2,
  RefreshCw,
  Check,
  BellRing,
  BellOff,
  Users,
  Building2,
  FileText,
  Shield,
  Zap,
  Globe
} from 'lucide-react';
import {
  Notification as NotificationType,
  AlertRule,
  Severity,
  formatTimeAgo,
  getStatusColors,
  PageHeader,
  SearchInput,
  Select,
  Button,
  Tabs,
  Toggle,
  EmptyState,
  Card
} from '@/lib/admin';

// Mock data factory functions to avoid hardcoding
const createMockNotifications = (): NotificationType[] => [
  {
    id: '1',
    type: 'warning',
    category: 'system',
    title: 'High CPU Usage Detected',
    message: 'Server CPU usage exceeded 80% for the last 15 minutes. Consider scaling resources.',
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    type: 'success',
    category: 'billing',
    title: 'Daily Backup Completed',
    message: 'Automated backup completed successfully. 2.4GB of data backed up.',
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: '3',
    type: 'info',
    category: 'user',
    title: 'New User Registration',
    message: 'John Doe (john@example.com) registered as a new user under Client ABC.',
    read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: '4',
    type: 'error',
    category: 'security',
    title: 'Failed Login Attempts',
    message: '5 failed login attempts detected from IP 192.168.1.100 in the last hour.',
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: '5',
    type: 'info',
    category: 'client',
    title: 'New Client Created',
    message: 'New client "Tech Solutions Pvt Ltd" has been created and activated.',
    read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

const createMockAlertRules = (): AlertRule[] => [
  {
    id: '1',
    name: 'High CPU Alert',
    description: 'Triggered when CPU usage exceeds 80%',
    enabled: true,
    trigger: 'cpu_usage > 80',
    channels: ['email', 'in_app'],
    recipients: ['admin@ryxbilling.com'],
    severity: 'high',
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Failed Login Alert',
    description: 'Triggered after 3 failed login attempts',
    enabled: true,
    trigger: 'failed_logins >= 3',
    channels: ['email', 'sms', 'in_app'],
    recipients: ['security@ryxbilling.com'],
    severity: 'critical',
    created_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'New Client Notification',
    description: 'Notify when a new client is created',
    enabled: true,
    trigger: 'client_created',
    channels: ['email', 'in_app'],
    recipients: ['admin@ryxbilling.com'],
    severity: 'low',
    created_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'Daily Revenue Report',
    description: 'Send daily revenue summary',
    enabled: false,
    trigger: 'schedule:daily:9am',
    channels: ['email'],
    recipients: ['finance@ryxbilling.com'],
    severity: 'low',
    created_at: new Date().toISOString(),
  },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'system', label: 'System' },
  { value: 'billing', label: 'Billing' },
  { value: 'security', label: 'Security' },
  { value: 'user', label: 'User' },
  { value: 'client', label: 'Client' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const TYPE_ICONS: Record<NotificationType['type'], React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

const CATEGORY_ICONS: Record<NotificationType['category'], React.ElementType> = {
  system: Zap,
  billing: FileText,
  security: Shield,
  user: Users,
  client: Building2,
};

const getSeverityClasses = (severity: Severity): string => {
  const colors = getStatusColors(severity);
  return `${colors.bg} ${colors.text}`;
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'notifications' | 'alerts'>('notifications');
  const [notifications, setNotifications] = useState<NotificationType[]>(createMockNotifications);
  const [alertRules, setAlertRules] = useState<AlertRule[]>(createMockAlertRules);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.read) return false;
    if (filter === 'read' && !n.read) return false;
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    if (searchTerm && !n.title.toLowerCase().includes(searchTerm.toLowerCase()) && !n.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const toggleAlertRule = (id: string) => {
    setAlertRules(prev => prev.map(rule => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  const tabs = [
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadCount > 0 ? unreadCount : undefined },
    { id: 'alerts', label: 'Alert Rules', icon: BellRing },
  ];

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <PageHeader
        title="Notifications & Alerts"
        description="Manage system notifications and alert rules"
        actions={
          <>
            {activeTab === 'notifications' && unreadCount > 0 && (
              <Button variant="ghost" onClick={markAllAsRead} icon={Check}>
                Mark all as read
              </Button>
            )}
            <Button onClick={handleRefresh} loading={loading} icon={RefreshCw}>
              Refresh
            </Button>
          </>
        }
      />

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'notifications' | 'alerts')}
        variant="pills"
      />

      <div className="mt-6">
        {activeTab === 'notifications' ? (
          <>
            {/* Filters */}
            <Card className="mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search notifications..."
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <Select
                    value={filter}
                    onChange={setFilter}
                    options={FILTER_OPTIONS}
                  />
                  <Select
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={CATEGORY_OPTIONS}
                  />
                </div>
              </div>
            </Card>

            {/* Notifications List */}
            <Card noPadding>
              {filteredNotifications.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredNotifications.map((notification) => {
                    const CategoryIcon = CATEGORY_ICONS[notification.category] || Bell;
                    return (
                      <div
                        key={notification.id}
                        className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${!notification.read ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 mt-1">
                            {TYPE_ICONS[notification.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className={`text-sm font-semibold ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {notification.title}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                  {notification.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!notification.read && (
                                  <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-medium">
                                <CategoryIcon className="w-4 h-4" />
                                {notification.category}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500">
                                <Clock className="w-3 h-3" />
                                {formatTimeAgo(notification.created_at)}
                              </span>
                              <div className="flex-1"></div>
                              {!notification.read && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                                >
                                  Mark as read
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notification.id)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={BellOff}
                  title="No notifications"
                  description="You're all caught up!"
                />
              )}
            </Card>
          </>
        ) : (
          <>
            {/* Alert Rules */}
            <Card
              noPadding
              title="Alert Rules"
              actions={
                <Button size="sm" icon={Zap}>
                  Create Rule
                </Button>
              }
            >
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {alertRules.map((rule) => (
                  <div key={rule.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-slate-900 dark:text-white">{rule.name}</h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getSeverityClasses(rule.severity)}`}>
                            {rule.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{rule.description}</p>
                        <div className="flex items-center gap-4 mt-3">
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            Trigger: <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{rule.trigger}</code>
                          </span>
                          <div className="flex items-center gap-1">
                            {rule.channels.includes('email') && <Mail className="w-4 h-4 text-slate-400" />}
                            {rule.channels.includes('sms') && <Smartphone className="w-4 h-4 text-slate-400" />}
                            {rule.channels.includes('push') && <Bell className="w-4 h-4 text-slate-400" />}
                            {rule.channels.includes('in_app') && <Globe className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Toggle
                          checked={rule.enabled}
                          onChange={() => toggleAlertRule(rule.id)}
                        />
                        <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Channel Configuration */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Mail, name: 'Email', status: 'Configured', statusColor: 'text-emerald-600', bgColor: 'bg-violet-100 dark:bg-violet-900/30', iconColor: 'text-violet-600', description: 'Send alerts via email to specified recipients' },
                { icon: Smartphone, name: 'SMS', status: 'Not configured', statusColor: 'text-amber-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600', description: 'Send SMS alerts for critical notifications' },
                { icon: Bell, name: 'Push', status: 'Not configured', statusColor: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600', description: 'Browser push notifications' },
                { icon: Globe, name: 'In-App', status: 'Active', statusColor: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600', description: 'Show notifications within the app' },
              ].map((channel) => (
                <Card key={channel.name}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl ${channel.bgColor}`}>
                      <channel.icon className={`w-5 h-5 ${channel.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{channel.name}</h3>
                      <p className={`text-xs ${channel.statusColor}`}>{channel.status}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{channel.description}</p>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
