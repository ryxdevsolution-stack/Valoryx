'use client'

import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'

interface AuditLog {
  audit_id: string
  action: string
  table_name: string
  record_id: string
  user_id: string
  old_data: any
  new_data: any
  ip_address: string
  user_agent: string
  created_at: string
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = { page, limit: 20 }
      if (filter !== 'all') {
        params.action = filter
      }

      const response = await api.get('/audit/logs', { params })
      setLogs(response.data.logs || [])
      setTotalPages(response.data.total_pages || 1)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getActionBadge = (action: string) => {
    const colors: any = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      LOGIN: 'bg-purple-100 text-purple-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
    }
    return colors[action] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-2 text-gray-600">Track all system activities and changes</p>
      </div>

      {/* Filter Buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setFilter('all')
            setPage(1)
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => {
            setFilter('CREATE')
            setPage(1)
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            filter === 'CREATE'
              ? 'bg-green-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Create
        </button>
        <button
          onClick={() => {
            setFilter('UPDATE')
            setPage(1)
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            filter === 'UPDATE'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Update
        </button>
        <button
          onClick={() => {
            setFilter('DELETE')
            setPage(1)
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            filter === 'DELETE'
              ? 'bg-red-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Delete
        </button>
        <button
          onClick={() => {
            setFilter('LOGIN')
            setPage(1)
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            filter === 'LOGIN'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Login
        </button>
      </div>

      {/* Audit Logs Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading audit logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No audit logs found</p>
          <p className="text-gray-400 mt-2">System activities will be logged here</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Table
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Record ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.audit_id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getActionBadge(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.table_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {log.record_id ? log.record_id.slice(0, 8) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ip_address || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {log.old_data || log.new_data ? (
                          <details className="cursor-pointer">
                            <summary className="text-blue-600 hover:text-blue-800 font-medium">
                              View Changes
                            </summary>
                            <div className="mt-2 p-3 bg-gray-50 rounded text-xs">
                              {log.old_data && (
                                <div className="mb-2">
                                  <p className="font-semibold text-gray-700">Old Data:</p>
                                  <pre className="mt-1 text-gray-600 overflow-x-auto">
                                    {JSON.stringify(log.old_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_data && (
                                <div>
                                  <p className="font-semibold text-gray-700">New Data:</p>
                                  <pre className="mt-1 text-gray-600 overflow-x-auto">
                                    {JSON.stringify(log.new_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:bg-gray-200 disabled:text-gray-400"
              >
                Previous
              </button>
              <span className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:bg-gray-200 disabled:text-gray-400"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
