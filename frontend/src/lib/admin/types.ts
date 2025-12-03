// Shared types for admin module

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Status types
export type Status = 'active' | 'inactive' | 'pending' | 'suspended';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type OperationStatus = 'success' | 'failed' | 'pending' | 'in_progress';

// Common entity interfaces
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at?: string;
}

export interface Client extends BaseEntity {
  client_id: string;
  client_name: string;
  email: string;
  phone: string;
  address: string | null;
  gst_number: string | null;
  logo_url: string | null;
  is_active: boolean;
  user_count: number;
  admin_email: string | null;
}

export interface User extends BaseEntity {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'staff';
  is_active: boolean;
  is_super_admin: boolean;
  client_id: string;
  last_login?: string;
}

export interface AuditLog extends BaseEntity {
  audit_id: string;
  user_id: string;
  client_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  user?: {
    email: string;
    full_name: string;
  };
}

export interface Notification extends BaseEntity {
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'system' | 'billing' | 'security' | 'user' | 'client';
  title: string;
  message: string;
  read: boolean;
  action_url?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertRule extends BaseEntity {
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  channels: ('email' | 'sms' | 'push' | 'in_app')[];
  recipients: string[];
  severity: Severity;
}

export interface Backup extends BaseEntity {
  name: string;
  type: 'full' | 'incremental' | 'differential';
  status: OperationStatus | 'completed' | 'scheduled';
  size: string;
  completed_at?: string;
  storage_location: 'local' | 'cloud' | 's3';
  retention_days: number;
}

export interface BackupSchedule extends BaseEntity {
  name: string;
  type: 'full' | 'incremental';
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  enabled: boolean;
  last_run?: string;
  next_run: string;
  retention_count: number;
}

export interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
  history: number[];
}

export interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  uptime: string;
  latency: number;
  lastCheck: string;
}

export interface Plan extends BaseEntity {
  name: string;
  description: string;
  price: number;
  billing_cycle: 'monthly' | 'yearly';
  features: string[];
  limits: {
    users: number | 'unlimited';
    bills_per_month: number | 'unlimited';
    storage_gb: number;
    support: 'email' | 'priority' | '24/7';
  };
  is_popular: boolean;
  is_active: boolean;
  subscribers_count: number;
}

export interface Subscription extends BaseEntity {
  client_id: string;
  client_name: string;
  plan_id: string;
  plan_name: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  amount: number;
}

export interface ApiKey extends BaseEntity {
  name: string;
  key: string;
  last_used?: string;
  permissions: string[];
  is_active: boolean;
  requests_today: number;
}

export interface Integration extends BaseEntity {
  name: string;
  description: string;
  category: 'payment' | 'accounting' | 'crm' | 'communication' | 'storage' | 'analytics';
  icon: string;
  status: 'connected' | 'available' | 'coming_soon';
  connected_at?: string;
}

export interface WebhookEndpoint extends BaseEntity {
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered?: string;
  success_rate: number;
  total_deliveries: number;
  secret: string;
}

export interface WebhookLog extends BaseEntity {
  webhook_id: string;
  event: string;
  status: OperationStatus;
  response_code?: number;
  response_time?: number;
  payload_preview: string;
}

export interface SecurityEvent extends BaseEntity {
  type: 'login_success' | 'login_failed' | 'password_changed' | 'permission_changed' | 'suspicious_activity' | 'session_expired';
  description: string;
  user_email: string;
  ip_address: string;
  location: string;
  device: string;
  severity: Severity;
}

export interface ActiveSession extends BaseEntity {
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

export interface StorageItem extends BaseEntity {
  name: string;
  type: 'file' | 'folder';
  category: 'documents' | 'images' | 'backups' | 'exports' | 'logs';
  size: number;
  modified_at: string;
}

export interface StorageStats {
  total: number;
  used: number;
  documents: number;
  images: number;
  backups: number;
  exports: number;
  logs: number;
}

// Dashboard stats
export interface DashboardStats {
  clients: {
    total: number;
    active: number;
    inactive: number;
    new_this_month: number;
    growth_percentage: number;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
    super_admins: number;
    new_this_week: number;
    active_today: number;
  };
  billing: {
    total_bills: number;
    bills_today: number;
    bills_this_month: number;
    total_revenue: number;
    revenue_this_month: number;
    revenue_growth: number;
    average_bill_value: number;
  };
  system: {
    database_size: string;
    storage_used: string;
    api_requests_today: number;
    uptime_percentage: number;
    last_backup: string;
    pending_alerts: number;
  };
}

// Settings types
export interface SystemSettings {
  general: {
    system_name: string;
    tagline: string;
    support_email: string;
    support_phone: string;
    maintenance_mode: boolean;
    allow_registration: boolean;
  };
  company: {
    company_name: string;
    legal_name: string;
    gst_number: string;
    pan_number: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  billing: {
    default_tax_rate: number;
    tax_inclusive: boolean;
    currency: string;
    currency_symbol: string;
    invoice_prefix: string;
    invoice_start_number: number;
    payment_terms_days: number;
    late_fee_percentage: number;
    enable_gst_billing: boolean;
    enable_non_gst_billing: boolean;
  };
  email: {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    smtp_encryption: 'none' | 'tls' | 'ssl';
    from_email: string;
    from_name: string;
    email_enabled: boolean;
  };
  security: {
    password_min_length: number;
    password_require_uppercase: boolean;
    password_require_number: boolean;
    password_require_special: boolean;
    session_timeout_minutes: number;
    max_login_attempts: number;
    lockout_duration_minutes: number;
    two_factor_enabled: boolean;
    ip_whitelist_enabled: boolean;
    ip_whitelist: string[];
  };
  notifications: {
    email_on_new_user: boolean;
    email_on_new_client: boolean;
    email_on_bill_created: boolean;
    email_on_payment_received: boolean;
    email_daily_summary: boolean;
    email_weekly_report: boolean;
  };
  localization: {
    default_language: string;
    timezone: string;
    date_format: string;
    time_format: string;
    first_day_of_week: number;
  };
  appearance: {
    primary_color: string;
    logo_url: string;
    favicon_url: string;
    login_background_url: string;
    dark_mode_default: boolean;
  };
}
