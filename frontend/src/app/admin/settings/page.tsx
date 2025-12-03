'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
import {
  Settings,
  Building2,
  Mail,
  Shield,
  Globe,
  CreditCard,
  Bell,
  Palette,
  Database,
  Clock,
  Save,
  RotateCcw,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  ChevronRight,
  FileText,
  IndianRupee,
  Percent,
  Calendar,
  Lock,
  Smartphone,
  Languages,
  Sun,
  Moon
} from 'lucide-react';

interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const settingsSections: SettingsSection[] = [
  { id: 'general', title: 'General', description: 'Basic system settings', icon: Settings, color: 'text-slate-600' },
  { id: 'company', title: 'Company', description: 'Organization details', icon: Building2, color: 'text-blue-600' },
  { id: 'billing', title: 'Billing', description: 'Invoice & tax settings', icon: CreditCard, color: 'text-emerald-600' },
  { id: 'email', title: 'Email', description: 'SMTP & templates', icon: Mail, color: 'text-violet-600' },
  { id: 'security', title: 'Security', description: 'Authentication & access', icon: Shield, color: 'text-red-600' },
  { id: 'notifications', title: 'Notifications', description: 'Alert preferences', icon: Bell, color: 'text-amber-600' },
  { id: 'localization', title: 'Localization', description: 'Language & formats', icon: Globe, color: 'text-teal-600' },
  { id: 'appearance', title: 'Appearance', description: 'Theme & branding', icon: Palette, color: 'text-pink-600' },
];

interface SystemSettings {
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

const defaultSettings: SystemSettings = {
  general: {
    system_name: 'RYX Billing',
    tagline: 'Professional Billing Solution',
    support_email: 'support@ryxbilling.com',
    support_phone: '+91 1234567890',
    maintenance_mode: false,
    allow_registration: false,
  },
  company: {
    company_name: '',
    legal_name: '',
    gst_number: '',
    pan_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
  },
  billing: {
    default_tax_rate: 18,
    tax_inclusive: false,
    currency: 'INR',
    currency_symbol: '₹',
    invoice_prefix: 'INV',
    invoice_start_number: 1001,
    payment_terms_days: 30,
    late_fee_percentage: 2,
    enable_gst_billing: true,
    enable_non_gst_billing: true,
  },
  email: {
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_encryption: 'tls',
    from_email: '',
    from_name: 'RYX Billing',
    email_enabled: false,
  },
  security: {
    password_min_length: 8,
    password_require_uppercase: true,
    password_require_number: true,
    password_require_special: false,
    session_timeout_minutes: 60,
    max_login_attempts: 5,
    lockout_duration_minutes: 30,
    two_factor_enabled: false,
    ip_whitelist_enabled: false,
    ip_whitelist: [],
  },
  notifications: {
    email_on_new_user: true,
    email_on_new_client: true,
    email_on_bill_created: false,
    email_on_payment_received: true,
    email_daily_summary: false,
    email_weekly_report: true,
  },
  localization: {
    default_language: 'en',
    timezone: 'Asia/Kolkata',
    date_format: 'DD/MM/YYYY',
    time_format: '12h',
    first_day_of_week: 1,
  },
  appearance: {
    primary_color: '#7c3aed',
    logo_url: '',
    favicon_url: '',
    login_background_url: '',
    dark_mode_default: false,
  },
};

export default function SystemSettingsPage() {
  const { user, isSuperAdmin } = useClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const [activeSection, setActiveSection] = useState('general');
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [originalSettings, setOriginalSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${apiUrl}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setSettings({ ...defaultSettings, ...response.data });
        setOriginalSettings({ ...defaultSettings, ...response.data });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Use default settings if fetch fails
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings));
  }, [settings, originalSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      await axios.put(`${apiUrl}/admin/settings`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOriginalSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(originalSettings);
  };

  const updateSetting = (section: keyof SystemSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const renderToggle = (checked: boolean, onChange: (value: boolean) => void, disabled = false) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );

  const renderInput = (
    value: string | number,
    onChange: (value: string) => void,
    type: 'text' | 'number' | 'email' | 'password' = 'text',
    placeholder = '',
    disabled = false
  ) => (
    <input
      type={type === 'password' && showPassword ? 'text' : type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );

  const renderSelect = (
    value: string | number,
    options: { value: string | number; label: string }[],
    onChange: (value: string) => void
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );

  const renderSettingRow = (label: string, description: string, control: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-100 dark:border-slate-700 last:border-0 gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="sm:w-64 flex-shrink-0">
        {control}
      </div>
    </div>
  );

  const renderGeneralSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'System Name',
        'The name displayed throughout the application',
        renderInput(settings.general.system_name, (v) => updateSetting('general', 'system_name', v))
      )}
      {renderSettingRow(
        'Tagline',
        'A short description of your system',
        renderInput(settings.general.tagline, (v) => updateSetting('general', 'tagline', v))
      )}
      {renderSettingRow(
        'Support Email',
        'Email address for support inquiries',
        renderInput(settings.general.support_email, (v) => updateSetting('general', 'support_email', v), 'email')
      )}
      {renderSettingRow(
        'Support Phone',
        'Phone number for support',
        renderInput(settings.general.support_phone, (v) => updateSetting('general', 'support_phone', v))
      )}
      {renderSettingRow(
        'Maintenance Mode',
        'Temporarily disable access for non-admins',
        renderToggle(settings.general.maintenance_mode, (v) => updateSetting('general', 'maintenance_mode', v))
      )}
      {renderSettingRow(
        'Allow Registration',
        'Allow new users to self-register',
        renderToggle(settings.general.allow_registration, (v) => updateSetting('general', 'allow_registration', v))
      )}
    </div>
  );

  const renderCompanySettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Company Name',
        'Your business name',
        renderInput(settings.company.company_name, (v) => updateSetting('company', 'company_name', v))
      )}
      {renderSettingRow(
        'Legal Name',
        'Registered legal entity name',
        renderInput(settings.company.legal_name, (v) => updateSetting('company', 'legal_name', v))
      )}
      {renderSettingRow(
        'GST Number',
        'Goods and Services Tax number',
        renderInput(settings.company.gst_number, (v) => updateSetting('company', 'gst_number', v), 'text', 'e.g., 22AAAAA0000A1Z5')
      )}
      {renderSettingRow(
        'PAN Number',
        'Permanent Account Number',
        renderInput(settings.company.pan_number, (v) => updateSetting('company', 'pan_number', v), 'text', 'e.g., AAAAA0000A')
      )}
      {renderSettingRow(
        'Address',
        'Business address',
        renderInput(settings.company.address, (v) => updateSetting('company', 'address', v))
      )}
      <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-100 dark:border-slate-700">
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">City</label>
          {renderInput(settings.company.city, (v) => updateSetting('company', 'city', v))}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">State</label>
          {renderInput(settings.company.state, (v) => updateSetting('company', 'state', v))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 py-4">
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Pincode</label>
          {renderInput(settings.company.pincode, (v) => updateSetting('company', 'pincode', v))}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Country</label>
          {renderSelect(settings.company.country, [
            { value: 'India', label: 'India' },
            { value: 'USA', label: 'United States' },
            { value: 'UK', label: 'United Kingdom' },
          ], (v) => updateSetting('company', 'country', v))}
        </div>
      </div>
    </div>
  );

  const renderBillingSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Default Tax Rate (%)',
        'Default GST/tax percentage',
        renderInput(settings.billing.default_tax_rate, (v) => updateSetting('billing', 'default_tax_rate', parseFloat(v) || 0), 'number')
      )}
      {renderSettingRow(
        'Tax Inclusive Pricing',
        'Prices include tax by default',
        renderToggle(settings.billing.tax_inclusive, (v) => updateSetting('billing', 'tax_inclusive', v))
      )}
      {renderSettingRow(
        'Currency',
        'Default currency for billing',
        renderSelect(settings.billing.currency, [
          { value: 'INR', label: 'Indian Rupee (₹)' },
          { value: 'USD', label: 'US Dollar ($)' },
          { value: 'EUR', label: 'Euro (€)' },
          { value: 'GBP', label: 'British Pound (£)' },
        ], (v) => updateSetting('billing', 'currency', v))
      )}
      {renderSettingRow(
        'Invoice Prefix',
        'Prefix for invoice numbers',
        renderInput(settings.billing.invoice_prefix, (v) => updateSetting('billing', 'invoice_prefix', v))
      )}
      {renderSettingRow(
        'Invoice Start Number',
        'Starting number for invoices',
        renderInput(settings.billing.invoice_start_number, (v) => updateSetting('billing', 'invoice_start_number', parseInt(v) || 1), 'number')
      )}
      {renderSettingRow(
        'Payment Terms (Days)',
        'Default payment due period',
        renderInput(settings.billing.payment_terms_days, (v) => updateSetting('billing', 'payment_terms_days', parseInt(v) || 30), 'number')
      )}
      {renderSettingRow(
        'Late Fee (%)',
        'Percentage charged for late payments',
        renderInput(settings.billing.late_fee_percentage, (v) => updateSetting('billing', 'late_fee_percentage', parseFloat(v) || 0), 'number')
      )}
      {renderSettingRow(
        'Enable GST Billing',
        'Allow GST invoices',
        renderToggle(settings.billing.enable_gst_billing, (v) => updateSetting('billing', 'enable_gst_billing', v))
      )}
      {renderSettingRow(
        'Enable Non-GST Billing',
        'Allow non-GST invoices',
        renderToggle(settings.billing.enable_non_gst_billing, (v) => updateSetting('billing', 'enable_non_gst_billing', v))
      )}
    </div>
  );

  const renderEmailSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Email Notifications',
        'Enable email sending',
        renderToggle(settings.email.email_enabled, (v) => updateSetting('email', 'email_enabled', v))
      )}
      {renderSettingRow(
        'SMTP Host',
        'Mail server address',
        renderInput(settings.email.smtp_host, (v) => updateSetting('email', 'smtp_host', v), 'text', 'smtp.gmail.com')
      )}
      {renderSettingRow(
        'SMTP Port',
        'Mail server port',
        renderInput(settings.email.smtp_port, (v) => updateSetting('email', 'smtp_port', parseInt(v) || 587), 'number')
      )}
      {renderSettingRow(
        'SMTP Username',
        'Authentication username',
        renderInput(settings.email.smtp_user, (v) => updateSetting('email', 'smtp_user', v))
      )}
      {renderSettingRow(
        'SMTP Password',
        'Authentication password',
        <div className="relative">
          {renderInput(settings.email.smtp_password, (v) => updateSetting('email', 'smtp_password', v), 'password')}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      )}
      {renderSettingRow(
        'Encryption',
        'Connection security',
        renderSelect(settings.email.smtp_encryption, [
          { value: 'none', label: 'None' },
          { value: 'tls', label: 'TLS' },
          { value: 'ssl', label: 'SSL' },
        ], (v) => updateSetting('email', 'smtp_encryption', v as 'none' | 'tls' | 'ssl'))
      )}
      {renderSettingRow(
        'From Email',
        'Sender email address',
        renderInput(settings.email.from_email, (v) => updateSetting('email', 'from_email', v), 'email')
      )}
      {renderSettingRow(
        'From Name',
        'Sender display name',
        renderInput(settings.email.from_name, (v) => updateSetting('email', 'from_name', v))
      )}
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Minimum Password Length',
        'Required minimum characters',
        renderInput(settings.security.password_min_length, (v) => updateSetting('security', 'password_min_length', parseInt(v) || 8), 'number')
      )}
      {renderSettingRow(
        'Require Uppercase',
        'Password must contain uppercase letter',
        renderToggle(settings.security.password_require_uppercase, (v) => updateSetting('security', 'password_require_uppercase', v))
      )}
      {renderSettingRow(
        'Require Number',
        'Password must contain number',
        renderToggle(settings.security.password_require_number, (v) => updateSetting('security', 'password_require_number', v))
      )}
      {renderSettingRow(
        'Require Special Character',
        'Password must contain special character',
        renderToggle(settings.security.password_require_special, (v) => updateSetting('security', 'password_require_special', v))
      )}
      {renderSettingRow(
        'Session Timeout (Minutes)',
        'Auto-logout after inactivity',
        renderInput(settings.security.session_timeout_minutes, (v) => updateSetting('security', 'session_timeout_minutes', parseInt(v) || 60), 'number')
      )}
      {renderSettingRow(
        'Max Login Attempts',
        'Failed attempts before lockout',
        renderInput(settings.security.max_login_attempts, (v) => updateSetting('security', 'max_login_attempts', parseInt(v) || 5), 'number')
      )}
      {renderSettingRow(
        'Lockout Duration (Minutes)',
        'Time before unlock after failed attempts',
        renderInput(settings.security.lockout_duration_minutes, (v) => updateSetting('security', 'lockout_duration_minutes', parseInt(v) || 30), 'number')
      )}
      {renderSettingRow(
        'Two-Factor Authentication',
        'Require 2FA for all users',
        renderToggle(settings.security.two_factor_enabled, (v) => updateSetting('security', 'two_factor_enabled', v))
      )}
      {renderSettingRow(
        'IP Whitelist',
        'Restrict access to specific IPs',
        renderToggle(settings.security.ip_whitelist_enabled, (v) => updateSetting('security', 'ip_whitelist_enabled', v))
      )}
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'New User Registration',
        'Email when new user is created',
        renderToggle(settings.notifications.email_on_new_user, (v) => updateSetting('notifications', 'email_on_new_user', v))
      )}
      {renderSettingRow(
        'New Client Created',
        'Email when new client is added',
        renderToggle(settings.notifications.email_on_new_client, (v) => updateSetting('notifications', 'email_on_new_client', v))
      )}
      {renderSettingRow(
        'Bill Created',
        'Email when bill is generated',
        renderToggle(settings.notifications.email_on_bill_created, (v) => updateSetting('notifications', 'email_on_bill_created', v))
      )}
      {renderSettingRow(
        'Payment Received',
        'Email when payment is recorded',
        renderToggle(settings.notifications.email_on_payment_received, (v) => updateSetting('notifications', 'email_on_payment_received', v))
      )}
      {renderSettingRow(
        'Daily Summary',
        'Receive daily activity summary',
        renderToggle(settings.notifications.email_daily_summary, (v) => updateSetting('notifications', 'email_daily_summary', v))
      )}
      {renderSettingRow(
        'Weekly Report',
        'Receive weekly business report',
        renderToggle(settings.notifications.email_weekly_report, (v) => updateSetting('notifications', 'email_weekly_report', v))
      )}
    </div>
  );

  const renderLocalizationSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Default Language',
        'System default language',
        renderSelect(settings.localization.default_language, [
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'Hindi' },
          { value: 'ta', label: 'Tamil' },
          { value: 'te', label: 'Telugu' },
          { value: 'mr', label: 'Marathi' },
        ], (v) => updateSetting('localization', 'default_language', v))
      )}
      {renderSettingRow(
        'Timezone',
        'System timezone',
        renderSelect(settings.localization.timezone, [
          { value: 'Asia/Kolkata', label: 'India (IST)' },
          { value: 'America/New_York', label: 'US Eastern' },
          { value: 'America/Los_Angeles', label: 'US Pacific' },
          { value: 'Europe/London', label: 'UK (GMT)' },
          { value: 'Asia/Dubai', label: 'UAE (GST)' },
        ], (v) => updateSetting('localization', 'timezone', v))
      )}
      {renderSettingRow(
        'Date Format',
        'Display format for dates',
        renderSelect(settings.localization.date_format, [
          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
          { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
        ], (v) => updateSetting('localization', 'date_format', v))
      )}
      {renderSettingRow(
        'Time Format',
        'Display format for time',
        renderSelect(settings.localization.time_format, [
          { value: '12h', label: '12-hour (AM/PM)' },
          { value: '24h', label: '24-hour' },
        ], (v) => updateSetting('localization', 'time_format', v))
      )}
      {renderSettingRow(
        'First Day of Week',
        'Calendar week start',
        renderSelect(settings.localization.first_day_of_week, [
          { value: 0, label: 'Sunday' },
          { value: 1, label: 'Monday' },
          { value: 6, label: 'Saturday' },
        ], (v) => updateSetting('localization', 'first_day_of_week', parseInt(v)))
      )}
    </div>
  );

  const renderAppearanceSettings = () => (
    <div className="space-y-1">
      {renderSettingRow(
        'Primary Color',
        'Main brand color',
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={settings.appearance.primary_color}
            onChange={(e) => updateSetting('appearance', 'primary_color', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border-0"
          />
          <input
            type="text"
            value={settings.appearance.primary_color}
            onChange={(e) => updateSetting('appearance', 'primary_color', e.target.value)}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      )}
      {renderSettingRow(
        'Logo URL',
        'Company logo image URL',
        renderInput(settings.appearance.logo_url, (v) => updateSetting('appearance', 'logo_url', v), 'text', 'https://...')
      )}
      {renderSettingRow(
        'Favicon URL',
        'Browser tab icon URL',
        renderInput(settings.appearance.favicon_url, (v) => updateSetting('appearance', 'favicon_url', v), 'text', 'https://...')
      )}
      {renderSettingRow(
        'Default Dark Mode',
        'Use dark theme by default',
        renderToggle(settings.appearance.dark_mode_default, (v) => updateSetting('appearance', 'dark_mode_default', v))
      )}
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSettings();
      case 'company': return renderCompanySettings();
      case 'billing': return renderBillingSettings();
      case 'email': return renderEmailSettings();
      case 'security': return renderSecuritySettings();
      case 'notifications': return renderNotificationSettings();
      case 'localization': return renderLocalizationSettings();
      case 'appearance': return renderAppearanceSettings();
      default: return renderGeneralSettings();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-violet-200 dark:border-violet-800"></div>
            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-transparent border-t-violet-600 animate-spin"></div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Loading Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">System Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure your billing system</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`
              flex items-center gap-2 px-6 py-2 rounded-xl font-medium transition-all
              ${hasChanges
                ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/25'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You have unsaved changes. Don&apos;t forget to save before leaving.
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 sticky top-6">
            <nav className="space-y-1">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left
                      ${isActive
                        ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? section.color : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isActive ? 'text-violet-700 dark:text-violet-300' : ''}`}>
                        {section.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                        {section.description}
                      </p>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-violet-500" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {settingsSections.find(s => s.id === activeSection)?.title} Settings
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {settingsSections.find(s => s.id === activeSection)?.description}
              </p>
            </div>
            {renderActiveSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
