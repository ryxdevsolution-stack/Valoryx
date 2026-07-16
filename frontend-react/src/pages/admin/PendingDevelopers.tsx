import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import api from '@/lib/api';
import { toast } from '@/utils/toast';
import {
  PageHeader,
  Select,
  Button,
  Card,
  LoadingState,
  EmptyState,
  ConfirmDialog,
} from '@/lib/admin';
import { RefreshCw, Check, Ban, AlertTriangle, Code2, Copy } from 'lucide-react';

interface DeveloperPartner {
  dev_id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  status: 'pending' | 'approved' | 'suspended';
  created_at: string;
  approved_at: string | null;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
];

function StatusBadge({ status }: { status: DeveloperPartner['status'] }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    suspended: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function PendingDevelopers() {
  const { user: currentUser, isLoading: authLoading, isSuperAdmin } = useClient();
  const navigate = useNavigate();

  const [developers, setDevelopers] = useState<DeveloperPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [confirm, setConfirm] = useState<{ dev: DeveloperPartner; action: 'approve' | 'suspend' } | null>(null);
  const [issuedKey, setIssuedKey] = useState<{ email: string; key: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchDevelopers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams(statusFilter ? { status: statusFilter } : {});
      const response = await api.get(`/admin/developers?${params}`);
      setDevelopers(response.data.developers);
    } catch {
      setError('Failed to load developers');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && !currentUser) { navigate('/auth/login'); return; }
    if (!authLoading && currentUser && !isSuperAdmin()) { navigate('/dashboard'); return; }
    if (currentUser && isSuperAdmin()) fetchDevelopers();
  }, [currentUser, authLoading, isSuperAdmin, navigate, fetchDevelopers]);

  const handleConfirm = async () => {
    if (!confirm) return;
    const { dev, action } = confirm;
    setBusyId(dev.dev_id);
    try {
      const response = await api.post(`/admin/developers/${dev.dev_id}/${action}`, {});
      if (action === 'approve') {
        // The raw key only ever appears in this one response — show it now.
        setIssuedKey({ email: dev.email, key: response.data.api_key });
        toast.success(`Approved — API key emailed to ${dev.email}`);
      } else {
        toast.success(`${dev.name} suspended — all their API keys were revoked`);
      }
      fetchDevelopers();
    } catch {
      toast.error(`Failed to ${action} developer`);
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingState message="Loading developers..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load developers"
          description={error}
          action={<Button onClick={fetchDevelopers}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Developer Partners"
        description="Devs who registered for the Ryx stock API — approve to issue their dev-level key."
        actions={
          <Button variant="outline" onClick={fetchDevelopers} icon={RefreshCw} size="sm">
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      <Card noPadding>
        <div className="flex flex-col md:flex-row gap-3 p-4">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            placeholder="All Status"
          />
        </div>
      </Card>

      <Card noPadding className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60">
                {['Developer', 'Company', 'Status', 'Registered', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
                      i === 4 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {developers.map((dev) => (
                <tr key={dev.dev_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-white">{dev.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{dev.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">
                    {dev.company || <span className="text-slate-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={dev.status} />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(dev.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {(dev.status === 'pending' || dev.status === 'suspended') && (
                        <button
                          type="button"
                          disabled={busyId === dev.dev_id}
                          onClick={() => setConfirm({ dev, action: 'approve' })}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                          title={dev.status === 'suspended' ? 'Reactivate' : 'Approve'}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {dev.status === 'approved' && (
                        <button
                          type="button"
                          disabled={busyId === dev.dev_id}
                          onClick={() => setConfirm({ dev, action: 'suspend' })}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                          title="Suspend"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {developers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12">
                    <EmptyState
                      icon={Code2}
                      title="No developers found"
                      description="No dev partners match this filter."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        title={
          confirm?.action === 'approve'
            ? (confirm.dev.status === 'suspended' ? 'Reactivate developer' : 'Approve developer')
            : 'Suspend developer'
        }
        message={
          confirm?.action === 'approve'
            ? confirm.dev.status === 'suspended'
              ? `Reactivate ${confirm.dev.name}? A new dev-level key will be emailed to them. Their previous clients' stock keys stay revoked — recreate those separately if needed.`
              : `Approve ${confirm.dev.name}? They will be emailed a dev-level API key immediately.`
            : `Suspend ${confirm?.dev.name}? This revokes their dev-level key and every client-level key created under them.`
        }
        confirmText={confirm?.action === 'approve' ? (confirm.dev.status === 'suspended' ? 'Reactivate' : 'Approve') : 'Suspend'}
        variant={confirm?.action === 'suspend' ? 'danger' : 'warning'}
      />

      {issuedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="max-w-lg w-full space-y-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Developer approved</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{issuedKey.email}</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(issuedKey.key); toast.success('Copied'); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="truncate">{issuedKey.key}</span>
              <Copy className="h-4 w-4 flex-shrink-0" />
            </button>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Also emailed to the developer — this key is not shown again after you close this dialog.
            </p>
            <Button onClick={() => setIssuedKey(null)} className="w-full">Done</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
