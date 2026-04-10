import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import api from '@/lib/api';
import { toast } from '@/utils/toast';
import {
  PageHeader,
  SearchInput,
  Select,
  Pagination,
  Button,
  Card,
  LoadingState,
  EmptyState,
  ConfirmDialog,
} from '@/lib/admin';
import {
  UserPlus,
  Edit,
  Shield,
  UserCheck,
  UserX,
  RefreshCw,
  Check,
  X,
  MoreVertical,
  Users,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Lock,
} from 'lucide-react';

interface User {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  department: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  permissions: string[];
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'cashier', label: 'Cashier' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'super_admin', label: 'Super Admin' },
];

function RoleBadge({ role, isSuperAdmin }: { role: string; isSuperAdmin: boolean }) {
  const colors: Record<string, string> = {
    owner: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
    admin: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    manager: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    staff: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    cashier: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${colors[role] || colors.staff}`}>
        {role}
      </span>
      {isSuperAdmin && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200/60 dark:ring-purple-800/40" title="Super Admin">
          <Shield className="h-2.5 w-2.5" />
          SA
        </span>
      )}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
      <Check className="h-3 w-3" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      <X className="h-3 w-3" />
      Inactive
    </span>
  );
}

export default function UserManagement() {
  const { user: currentUser, isLoading: authLoading, isSuperAdmin } = useClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientIdFilter = searchParams.get('client_id') || '';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<{ op: string; open: boolean }>({ op: '', open: false });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(searchTerm && { search: searchTerm }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(clientIdFilter && { client_id: clientIdFilter }),
      });
      const response = await api.get<UsersResponse>(`/admin/users?${params}`);
      setUsers(response.data.users);
      setTotalPages(response.data.pages);
      setTotalUsers(response.data.total);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter, clientIdFilter]);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => { setSearchTerm(inputValue); setCurrentPage(1); }, 400);
    return () => clearTimeout(id);
  }, [inputValue]);

  useEffect(() => {
    if (!authLoading && !currentUser) { navigate('/auth/login'); return; }
    if (!authLoading && currentUser && !isSuperAdmin()) { navigate('/dashboard'); return; }
    if (currentUser && isSuperAdmin()) fetchUsers();
  }, [currentUser, authLoading, isSuperAdmin, navigate, fetchUsers]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  const handleToggleStatus = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/toggle-status`, {});
      fetchUsers();
    } catch { /* swallow */ }
  };

  const handleToggleSuperAdmin = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/promote`, {});
      fetchUsers();
    } catch { /* swallow */ }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const response = await api.post(`/admin/users/${userId}/password`, {});
      if (response.data.generated_password) {
        const pwd = response.data.generated_password;
        try { await navigator.clipboard.writeText(pwd); } catch { /* ignore */ }
        toast.success(`New password copied to clipboard: ${pwd}`);
      }
    } catch { /* swallow */ }
  };

  const handleBulkOperation = async () => {
    if (selectedUsers.length === 0) return;
    try {
      await api.post('/admin/users/bulk', { user_ids: selectedUsers, operation: bulkConfirm.op });
      setSelectedUsers([]);
      setBulkConfirm({ op: '', open: false });
      fetchUsers();
    } catch { /* swallow */ }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    setSelectedUsers((prev) => (prev.length === users.length ? [] : users.map((u) => u.user_id)));
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingState message="Loading users..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load users"
          description={error}
          action={<Button onClick={fetchUsers}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Client filter banner */}
      {clientIdFilter && (
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
          <span className="text-blue-700 dark:text-blue-300">
            Showing users for client <span className="font-semibold">{clientIdFilter.slice(0, 8)}...</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => { searchParams.delete('client_id'); setSearchParams(searchParams); }}
          >
            Show All
          </Button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="User Management"
        description={clientIdFilter ? "Showing users for selected client" : "Manage all users and their permissions"}
        actions={
          <>
            <Button variant="outline" onClick={fetchUsers} icon={RefreshCw} size="sm">
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button onClick={() => navigate('/admin/users/create')} icon={UserPlus} size="sm">
              Create User
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card noPadding>
        <div className="flex flex-col md:flex-row gap-3 p-4">
          <SearchInput
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search by name, email, or phone..."
            className="flex-1"
          />
          <Select
            value={roleFilter}
            onChange={(v) => { setRoleFilter(v); setCurrentPage(1); }}
            options={ROLE_OPTIONS}
            placeholder="All Roles"
          />
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
            options={STATUS_OPTIONS}
            placeholder="All Status"
          />
        </div>
        {/* Bulk Actions Bar */}
        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {selectedUsers.length} selected
            </span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => setBulkConfirm({ op: 'activate', open: true })}>
                Activate
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkConfirm({ op: 'deactivate', open: true })}>
                Deactivate
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBulkConfirm({ op: 'delete', open: true })}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUsers([])}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Desktop Table */}
      <Card noPadding className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
                <th className="px-5 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedUsers.length === users.length && users.length > 0}
                    onChange={selectAllUsers}
                    className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 dark:bg-slate-700"
                  />
                </th>
                {['User', 'Role', 'Department', 'Status', 'Last Login', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
                      i === 5 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {users.map((u) => (
                <tr
                  key={u.user_id}
                  className={`hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors ${
                    selectedUsers.includes(u.user_id) ? 'bg-violet-50/40 dark:bg-violet-900/10' : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.user_id)}
                      onChange={() => toggleUserSelection(u.user_id)}
                      className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 dark:bg-slate-700"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {u.full_name || u.email}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                      {u.phone && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{u.phone}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={u.role} isSuperAdmin={u.is_super_admin} />
                  </td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">
                    {u.department || <span className="text-slate-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <ActiveBadge active={u.is_active} />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/users/${u.user_id}`)}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u.user_id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                        title={u.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      {/* More actions dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === u.user_id ? null : u.user_id); }}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuId === u.user_id && (
                          <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-lg ring-1 ring-slate-200 dark:ring-slate-700 z-20 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                            <button
                              type="button"
                              onClick={() => { navigate(`/admin/permissions?user=${u.user_id}`); setOpenMenuId(null); }}
                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                            >
                              <KeyRound className="h-4 w-4 text-slate-400" />
                              Manage Permissions
                            </button>
                            <button
                              type="button"
                              onClick={() => { handleResetPassword(u.user_id); setOpenMenuId(null); }}
                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                            >
                              <Lock className="h-4 w-4 text-slate-400" />
                              Reset Password
                            </button>
                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                            <button
                              type="button"
                              onClick={() => { handleToggleSuperAdmin(u.user_id); setOpenMenuId(null); }}
                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                            >
                              {u.is_super_admin ? (
                                <><ShieldOff className="h-4 w-4 text-red-400" /> Remove Super Admin</>
                              ) : (
                                <><ShieldCheck className="h-4 w-4 text-violet-400" /> Make Super Admin</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12">
                    <EmptyState
                      icon={Users}
                      title="No users found"
                      description={inputValue ? 'Try adjusting your search.' : 'Create your first user to get started.'}
                      action={
                        !inputValue ? (
                          <Button onClick={() => navigate('/admin/users/create')} icon={UserPlus} size="sm">
                            Create User
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalUsers > 0 && (
          <Pagination page={currentPage} limit={10} total={totalUsers} onPageChange={setCurrentPage} />
        )}
      </Card>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {users.map((u) => (
          <Card key={u.user_id} className="!p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {u.full_name || u.email}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                {u.phone && <p className="text-[11px] text-slate-400 dark:text-slate-500">{u.phone}</p>}
              </div>
              <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                <button type="button" onClick={() => navigate(`/admin/users/${u.user_id}`)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <Edit className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => handleToggleStatus(u.user_id)} className={`p-1.5 rounded-lg ${u.is_active ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-600'}`}>
                  {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Role </span>
                <RoleBadge role={u.role} isSuperAdmin={u.is_super_admin} />
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Dept </span>
                <span className="text-slate-800 dark:text-slate-200">{u.department || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Status </span>
                <ActiveBadge active={u.is_active} />
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Last Login </span>
                <span className="text-slate-800 dark:text-slate-200">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                </span>
              </div>
            </div>
          </Card>
        ))}
        {users.length === 0 && (
          <EmptyState icon={Users} title="No users found" description="Try adjusting your search." />
        )}
        {totalUsers > 0 && (
          <div className="flex items-center justify-between py-3 px-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Page {currentPage} of {totalPages} ({totalUsers} users)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Confirm */}
      <ConfirmDialog
        isOpen={bulkConfirm.open}
        onClose={() => setBulkConfirm({ op: '', open: false })}
        onConfirm={handleBulkOperation}
        title={`Bulk ${bulkConfirm.op}`}
        message={`Are you sure you want to ${bulkConfirm.op} ${selectedUsers.length} user(s)?`}
        confirmText={bulkConfirm.op.charAt(0).toUpperCase() + bulkConfirm.op.slice(1)}
        variant={bulkConfirm.op === 'delete' ? 'danger' : 'warning'}
      />
    </div>
  );
}
