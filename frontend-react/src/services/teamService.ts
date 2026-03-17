import api from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────

export interface TeamMember {
  user_id: string
  email: string
  full_name: string
  phone: string
  department: string
  role: string
  is_active: boolean
  invite_accepted: boolean
  branch_id: string | null
  branch_name: string | null
  last_login: string | null
  created_at: string | null
}

export interface TeamListResponse {
  success: boolean
  data: TeamMember[]
  total: number
  page: number
  per_page: number
}

export interface PermissionItem {
  permission_id: string
  permission_name: string
  description: string
  display_order: number
  has_permission?: boolean
}

export interface PermissionSection {
  section_id: string
  section_name: string
  description: string
  display_order: number
  icon: string | null
  permissions: PermissionItem[]
}

export interface BranchItem {
  branch_id: string
  name: string
  location: string | null
}

export interface CreateTeamMemberPayload {
  email: string
  full_name: string
  phone?: string
  department?: string
  role: string
  branch_id?: string | null
  permissions?: string[]
  // password removed — invite flow handles password setup
  /** Pre-verified TOTP action token (required when owner has 2FA enabled) */
  totp_action_token?: string
}

export interface UpdateTeamMemberPayload {
  full_name?: string
  phone?: string
  department?: string
  role?: string
  is_active?: boolean
  branch_id?: string | null
}

export interface PlanInfo {
  plan_name: string | null
  is_trial: boolean
  max_members: number
  current_members: number
  can_add_member: boolean
  allowed_billing: string[]
  slots_remaining: number
}

export interface PermissionPreset {
  preset_id: string
  client_id: string
  role: string
  permissions: string[]
  updated_at: string | null
  updated_by: string | null
}

// ─── Service ─────────────────────────────────────────────────────────

const teamService = {
  list: (params?: { page?: number; per_page?: number; search?: string; role?: string }) =>
    api.get<TeamListResponse>('/team', { params }),

  create: (data: CreateTeamMemberPayload) =>
    api.post('/team', data),

  update: (userId: string, data: UpdateTeamMemberPayload) =>
    api.put(`/team/${userId}`, data),

  delete: (userId: string) =>
    api.delete(`/team/${userId}`),

  toggleStatus: (userId: string) =>
    api.post(`/team/${userId}/toggle-status`),

  resetPassword: (userId: string, password?: string) =>
    api.post(`/team/${userId}/reset-password`, password ? { password } : {}),

  getPermissions: (userId: string) =>
    api.get<{ success: boolean; data: PermissionSection[] }>(`/team/${userId}/permissions`),

  updatePermissions: (userId: string, permissions: string[]) =>
    api.post(`/team/${userId}/permissions`, { permissions }),

  getAllPermissions: () =>
    api.get<{ success: boolean; data: PermissionSection[] }>('/team/permissions/all'),

  getBranches: () =>
    api.get<{ success: boolean; data: BranchItem[] }>('/team/branches'),

  createBranch: (data: { name: string; location?: string }) =>
    api.post<{ success: boolean; data: BranchItem; message: string }>('/branches', data),

  getPlanInfo: () =>
    api.get<{ success: boolean; data: PlanInfo }>('/team/plan-info'),

  getPreset: (role: string) =>
    api.get<{ success: boolean; data: PermissionPreset | null }>(`/team/presets/${role}`),

  resendInvite: (userId: string) =>
    api.post<{ success: boolean; message: string }>(`/invite/resend/${userId}`),
}

export default teamService
