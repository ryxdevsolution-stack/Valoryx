/**
 * RYX Billing - User & Auth Types
 * Type definitions for authentication and user management
 */

// ============================================================================
// USER
// ============================================================================

export interface User {
  user_id: string;
  client_id: string;
  email: string;
  full_name?: string;
  role: 'admin' | 'manager' | 'staff';
  is_active: boolean;
  is_super_admin: boolean;
  permissions: string[];
  last_login?: string;
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// CLIENT
// ============================================================================

export interface Client {
  client_id: string;
  client_name: string;
  email: string;
  phone?: string;
  address?: string;
  gst_number?: string;
  logo_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// AUTH
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
  client?: Client;
  message: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
  client_name: string;
  phone?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user_id?: string;
}

export interface TokenPayload {
  user_id: string;
  client_id: string;
  email: string;
  is_super_admin: boolean;
  permissions: string[];
  exp: number;
  iat: number;
}

// ============================================================================
// PERMISSIONS
// ============================================================================

export const PERMISSIONS = {
  // Billing permissions
  GST_BILLING: 'gst_billing',
  NON_GST_BILLING: 'non_gst_billing',
  VIEW_ALL_BILLS: 'view_all_bills',
  VIEW_OWN_BILLS: 'view_own_bills',
  EDIT_BILL_DETAILS: 'edit_bill_details',
  PRINT_BILLS: 'print_bills',

  // Stock permissions
  VIEW_STOCK: 'view_stock',
  ADD_PRODUCT: 'add_product',
  EDIT_PRODUCT_DETAILS: 'edit_product_details',
  DELETE_PRODUCT: 'delete_product',

  // Customer permissions
  VIEW_CUSTOMERS: 'view_customers',
  MANAGE_CUSTOMERS: 'manage_customers',

  // Report permissions
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',

  // Admin permissions
  MANAGE_USERS: 'manage_users',
  MANAGE_PERMISSIONS: 'manage_permissions',
  VIEW_AUDIT_LOGS: 'view_audit_logs',

  // Settings permissions
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_PAYMENT_TYPES: 'manage_payment_types',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ============================================================================
// PAYMENT TYPE
// ============================================================================

export interface PaymentTypeConfig {
  payment_type_id: string;
  client_id: string;
  payment_name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name?: string;
  role: 'admin' | 'manager' | 'staff';
  permissions: string[];
}

export interface UpdateUserRequest {
  full_name?: string;
  role?: 'admin' | 'manager' | 'staff';
  is_active?: boolean;
  permissions?: string[];
}

export interface UserListResponse {
  success: boolean;
  users: User[];
}
