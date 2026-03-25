import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import { useNotification } from '@/hooks/useNotification';
import api from '@/lib/api';
import {
  PageHeader,
  SearchInput,
  Select,
  Pagination,
  StatusBadge,
  Button,
  Card,
  LoadingState,
  EmptyState,
  ConfirmDialog,
} from '@/lib/admin';
import {
  Plus,
  Edit,
  Users,
  Building2,
  UserCheck,
  UserX,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Crown,
  Clock,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface Client {
  client_id: string;
  client_name: string;
  email: string;
  phone: string;
  address: string | null;
  gst_number: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  admin_email: string | null;
  subscription_status: string | null;
  plan_id: string | null;
  subscription_end_date: string | null;
  trial_end_date: string | null;
}

interface ClientsResponse {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function SubscriptionBadge({ client }: { client: Client }) {
  if (client.subscription_status === 'active') {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
          <Crown className="h-3 w-3" />
          Active
        </span>
        {client.subscription_end_date && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Expires {new Date(client.subscription_end_date).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }
  if (client.subscription_status === 'trial') {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          Trial
        </span>
        {client.trial_end_date && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Ends {new Date(client.trial_end_date).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }
  if (client.subscription_status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
        <X className="h-3 w-3" />
        Expired
      </span>
    );
  }
  return <span className="text-xs text-slate-400 dark:text-slate-500">&mdash;</span>;
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

export default function ClientManagement() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const navigate = useNavigate();
  const { showSuccess, showError, NotificationContainer } = useNotification();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<{ op: string; open: boolean }>({ op: '', open: false });
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter }),
      });
      const response = await api.get<ClientsResponse>(`/admin/clients?${params}`);
      setClients(response.data.clients);
      setTotalPages(response.data.pages);
      setTotalClients(response.data.total);
    } catch {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, statusFilter]);

  useEffect(() => {
    if (!authLoading && !user) { navigate('/auth/login'); return; }
    if (!authLoading && user && !isSuperAdmin()) { navigate('/dashboard'); return; }
    if (user && isSuperAdmin()) fetchClients();
  }, [user, authLoading, isSuperAdmin, navigate, currentPage, searchTerm, statusFilter, fetchClients]);

  const toggleClientSelection = (id: string) => {
    setSelectedClients((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };
  const selectAllClients = () => {
    setSelectedClients((prev) => prev.length === clients.length ? [] : clients.map((c) => c.client_id));
  };
  const handleBulkOperation = async () => {
    if (selectedClients.length === 0) return;
    setBulkProcessing(true);
    try {
      for (const id of selectedClients) {
        if (bulkConfirm.op === 'activate' || bulkConfirm.op === 'deactivate') {
          await api.post(`/admin/clients/${id}/toggle-status`, {});
        } else if (bulkConfirm.op === 'delete') {
          await api.delete(`/admin/clients/${id}`);
        }
      }
      showSuccess('Bulk Action Complete', `${bulkConfirm.op} applied to ${selectedClients.length} client(s).`);
      setSelectedClients([]);
      setBulkConfirm({ op: '', open: false });
      fetchClients();
    } catch (err: any) {
      showError('Bulk Action Failed', err.response?.data?.error || 'Some operations may have failed.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleToggleStatus = async (clientId: string) => {
    try {
      await api.post(`/admin/clients/${clientId}/toggle-status`, {});
      fetchClients();
    } catch { /* swallow */ }
  };

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;
    try {
      setDeleting(true);
      const response = await api.delete(`/admin/clients/${clientToDelete.client_id}`);
      const s = response.data.summary;
      showSuccess(
        'Client Deleted',
        `Users: ${s.users} | Bills: ${s.total_bills} | Stock: ${s.stock_entries} | Customers: ${s.customers}`
      );
      setDeleteConfirmOpen(false);
      setClientToDelete(null);
      fetchClients();
    } catch (err: any) {
      showError('Delete Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingState message="Loading clients..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load clients"
          description={error}
          action={<Button onClick={fetchClients}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <>
      <NotificationContainer />
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <PageHeader
          title="Client Management"
          description="Manage all clients in the system"
          actions={
            <>
              <Button variant="outline" onClick={fetchClients} icon={RefreshCw} size="sm">
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button onClick={() => navigate('/admin/clients/create')} icon={Plus} size="sm">
                Create Client
              </Button>
            </>
          }
        />

        {/* Filters */}
        <Card noPadding>
          <div className="flex flex-col md:flex-row gap-3 p-4">
            <SearchInput
              value={searchTerm}
              onChange={(v) => { setSearchTerm(v); setCurrentPage(1); }}
              placeholder="Search by name, email, phone, or GST number..."
              className="flex-1"
            />
            <Select
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
              options={STATUS_OPTIONS}
              placeholder="All Status"
            />
          </div>
          {/* Bulk Actions Bar */}
          {selectedClients.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {selectedClients.length} selected
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
                <Button size="sm" variant="ghost" onClick={() => setSelectedClients([])}>
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
                      checked={selectedClients.length === clients.length && clients.length > 0}
                      onChange={selectAllClients}
                      className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 dark:bg-slate-700"
                    />
                  </th>
                  {['Client', 'Contact', 'GST Number', 'Users', 'Subscription', 'Status', 'Created', 'Actions'].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
                          i === 7 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {clients.map((client) => (
                  <tr
                    key={client.client_id}
                    className={`hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors ${
                      selectedClients.includes(client.client_id) ? 'bg-violet-50/40 dark:bg-violet-900/10' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.client_id)}
                        onChange={() => toggleClientSelection(client.client_id)}
                        className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 dark:bg-slate-700"
                      />
                    </td>
                    {/* Client */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {client.logo_url ? (
                          <img
                            src={client.logo_url}
                            alt={client.client_name}
                            width={36}
                            height={36}
                            className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {client.client_name}
                          </p>
                          {client.admin_email && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              Admin: {client.admin_email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Contact */}
                    <td className="px-5 py-3.5">
                      <div className="space-y-1 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{client.email}</span>
                        </div>
                        {client.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="truncate max-w-[180px]">{client.address}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    {/* GST */}
                    <td className="px-5 py-3.5">
                      <span className="text-slate-700 dark:text-slate-300 font-mono text-xs">
                        {client.gst_number || <span className="text-slate-400 dark:text-slate-500">-</span>}
                      </span>
                    </td>
                    {/* Users */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200/60 dark:ring-blue-800/40">
                        {client.user_count} users
                      </span>
                    </td>
                    {/* Subscription */}
                    <td className="px-5 py-3.5">
                      <SubscriptionBadge client={client} />
                    </td>
                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <ActiveBadge active={client.is_active} />
                    </td>
                    {/* Created */}
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users?client_id=${client.client_id}`)}
                          disabled={client.user_count < 1}
                          className={`p-1.5 rounded-lg transition-colors ${
                            client.user_count < 1
                              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                              : 'text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                          }`}
                          title={client.user_count < 1 ? 'No users' : 'View Users'}
                        >
                          <Users className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(client.client_id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            client.is_active
                              ? 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          }`}
                          title={client.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {client.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClientToDelete(client);
                            setDeleteConfirmOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12">
                      <EmptyState
                        icon={Building2}
                        title="No clients found"
                        description={searchTerm ? 'Try adjusting your search.' : 'Create your first client to get started.'}
                        action={
                          !searchTerm ? (
                            <Button onClick={() => navigate('/admin/clients/create')} icon={Plus} size="sm">
                              Create Client
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
          {totalClients > 0 && (
            <Pagination
              page={currentPage}
              limit={10}
              total={totalClients}
              onPageChange={setCurrentPage}
            />
          )}
        </Card>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {clients.map((client) => (
            <Card key={client.client_id} className="!p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {client.logo_url ? (
                    <img
                      src={client.logo_url}
                      alt={client.client_name}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{client.client_name}</p>
                    {client.admin_email && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Admin: {client.admin_email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                  <button type="button" onClick={() => navigate(`/admin/clients/${client.client_id}`)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => navigate(`/admin/users?client_id=${client.client_id}`)} disabled={client.user_count < 1} className={`p-1.5 rounded-lg ${client.user_count < 1 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}>
                    <Users className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => handleToggleStatus(client.client_id)} className={`p-1.5 rounded-lg ${client.is_active ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-600'}`}>
                    {client.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => { setClientToDelete(client); setDeleteConfirmOpen(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Email </span>
                  <span className="text-slate-800 dark:text-slate-200 break-all">{client.email}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Phone </span>
                  <span className="text-slate-800 dark:text-slate-200">{client.phone || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Status </span>
                  <ActiveBadge active={client.is_active} />
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Users </span>
                  <span className="text-slate-800 dark:text-slate-200">{client.user_count}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Created </span>
                  <span className="text-slate-800 dark:text-slate-200">{new Date(client.created_at).toLocaleDateString()}</span>
                </div>
                {client.gst_number && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">GST </span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono">{client.gst_number}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {clients.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No clients found"
              description="Try adjusting your search."
            />
          )}
          {totalClients > 0 && (
            <div className="flex items-center justify-between py-3 px-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {currentPage} of {totalPages} ({totalClients} clients)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation */}
        {clientToDelete && (
          <ConfirmDialog
            isOpen={deleteConfirmOpen}
            onClose={() => { setDeleteConfirmOpen(false); setClientToDelete(null); }}
            onConfirm={handleDeleteConfirm}
            title="Delete Client"
            message={`Are you sure you want to permanently delete "${clientToDelete.client_name}"? This will remove all ${clientToDelete.user_count} user(s) and associated data.`}
            confirmText={deleting ? 'Deleting...' : 'Delete Client'}
            variant="danger"
            loading={deleting}
          />
        )}

        {/* Bulk Confirm */}
        <ConfirmDialog
          isOpen={bulkConfirm.open}
          onClose={() => { if (!bulkProcessing) setBulkConfirm({ op: '', open: false }); }}
          onConfirm={handleBulkOperation}
          title={`Bulk ${bulkConfirm.op}`}
          message={`Are you sure you want to ${bulkConfirm.op} ${selectedClients.length} client(s)?${bulkConfirm.op === 'delete' ? ' This cannot be undone.' : ''}`}
          confirmText={bulkProcessing ? `Processing ${selectedClients.length} client(s)...` : bulkConfirm.op.charAt(0).toUpperCase() + bulkConfirm.op.slice(1)}
          variant={bulkConfirm.op === 'delete' ? 'danger' : 'warning'}
          loading={bulkProcessing}
        />
      </div>
    </>
  );
}
