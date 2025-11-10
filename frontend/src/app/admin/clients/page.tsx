'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
import {
  Search,
  Filter,
  Plus,
  Edit,
  Users,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserCheck,
  UserX,
  RefreshCw,
  Check,
  X,
  Phone,
  Mail,
  MapPin,
  Trash2,
  AlertTriangle
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
}

interface ClientsResponse {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function ClientManagement() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    if (user && isSuperAdmin()) {
      fetchClients();
    }
  }, [user, authLoading, isSuperAdmin, router, currentPage, searchTerm, statusFilter]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter })
      });

      const token = localStorage.getItem('token');
      const response = await axios.get<ClientsResponse>(
        `${apiUrl}/admin/clients?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setClients(response.data.clients);
      setTotalPages(response.data.pages);
      setTotalClients(response.data.total);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (clientId: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/admin/clients/${clientId}/toggle-status`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      fetchClients();
    } catch (error) {
      console.error('Error toggling client status:', error);
    }
  };

  const handleViewUsers = (clientId: string) => {
    router.push(`/admin/users?client_id=${clientId}`);
  };

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem('token');
      const response = await axios.delete(
        `${apiUrl}/admin/clients/${clientToDelete.client_id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      // Show success message with deletion summary
      const summary = response.data.summary;
      const summaryMessage = `
Client deleted successfully!

Summary:
- Users: ${summary.users}
- Total Bills: ${summary.total_bills} (GST: ${summary.gst_bills}, Non-GST: ${summary.non_gst_bills})
- Stock Entries: ${summary.stock_entries}
- Customers: ${summary.customers}
- Payment Types: ${summary.payment_types}
- Reports: ${summary.reports}
- Audit Logs: ${summary.audit_logs}
      `.trim();

      alert(summaryMessage);

      setDeleteConfirmOpen(false);
      setClientToDelete(null);
      fetchClients();
    } catch (error: any) {
      console.error('Error deleting client:', error);
      alert(error.response?.data?.error || 'Failed to delete client');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setClientToDelete(null);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchClients}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Client Management</h1>
            <p className="text-gray-600 mt-1">Manage all clients in the system</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/admin/clients/create')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="h-5 w-5" />
              Create Client
            </button>
            <button
              onClick={fetchClients}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or GST number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  GST Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clients.map((client) => (
                <tr key={client.client_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {client.logo_url ? (
                        <img
                          src={client.logo_url}
                          alt={client.client_name}
                          className="h-10 w-10 rounded-full mr-3"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {client.client_name}
                        </div>
                        {client.admin_email && (
                          <div className="text-xs text-gray-500">
                            Admin: {client.admin_email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      <div className="flex items-center gap-1 mb-1">
                        <Mail className="h-3 w-3 text-gray-400" />
                        {client.email}
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-gray-400" />
                        {client.phone}
                      </div>
                      {client.address && (
                        <div className="flex items-start gap-1 mt-1">
                          <MapPin className="h-3 w-3 text-gray-400 mt-0.5" />
                          <span className="text-xs text-gray-500">{client.address}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {client.gst_number || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {client.user_count} users
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {client.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <X className="h-3 w-3 mr-1" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(client.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/admin/clients/${client.client_id}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleViewUsers(client.client_id)}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="View Users"
                      >
                        <Users className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(client.client_id)}
                        className={`${
                          client.is_active
                            ? 'text-yellow-600 hover:text-yellow-900'
                            : 'text-green-600 hover:text-green-900'
                        }`}
                        title={client.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {client.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(client)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Client"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, totalClients)} of {totalClients} clients
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && clientToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Client</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to delete the following client?
              </p>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  {clientToDelete.logo_url ? (
                    <img
                      src={clientToDelete.logo_url}
                      alt={clientToDelete.client_name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900">{clientToDelete.client_name}</p>
                    <p className="text-xs text-gray-500">{clientToDelete.email}</p>
                  </div>
                </div>
                {clientToDelete.user_count > 0 && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-xs text-yellow-800">
                      <strong>Warning:</strong> This client has {clientToDelete.user_count} user(s). All associated data will be permanently deleted.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Client
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}