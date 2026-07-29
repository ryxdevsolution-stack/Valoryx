import { useState } from 'react'
import { Plus, Search, Clock, DollarSign, History, LogIn, LogOut, PenLine, Pencil } from 'lucide-react'
import { useCurrency } from '@/lib/useCurrency'
import type { Employee } from '@/pages/Salary'

interface EmployeePanelProps {
  employees: Employee[]
  loading: boolean
  selectedId: string | null
  onSelect: (employee: Employee) => void
  onAdd: () => void
  onHistory: (employee: Employee) => void
  onEdit: (employee: Employee) => void
  // Bulk selection — separate from selectedId (which drives the detail panels).
  // Lets a supervisor check in/out many of 100+ employees from one device
  // instead of one at a time.
  selectedIds: string[]
  onToggleSelect: (employeeId: string) => void
  onSelectAllToggle: (visibleIds: string[]) => void
  onBulkCheckIn: () => void
  onBulkCheckOut: () => void
  onBulkManualHours: () => void
}

export default function EmployeePanel({
  employees,
  loading,
  selectedId,
  onSelect,
  onAdd,
  onHistory,
  onEdit,
  selectedIds,
  onToggleSelect,
  onSelectAllToggle,
  onBulkCheckIn,
  onBulkCheckOut,
  onBulkManualHours,
}: EmployeePanelProps) {
  const [search, setSearch] = useState('')
  const { symbol } = useCurrency()

  const filtered = employees.filter(emp =>
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    (emp.phone ?? '').includes(search)
  )
  const visibleIds = filtered.map(e => e.employee_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))

  return (
    // On mobile: cap height at 60vh so the list is scrollable but other panels
    // below remain visible. On desktop (≥md): fill the parent's fixed viewport height.
    <div className="flex flex-col md:h-full max-h-[60vh] md:max-h-none bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Employees</h2>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Search + select-all */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300"
          />
        </div>
        {filtered.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => onSelectAllToggle(visibleIds)}
              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600"
            />
            Select all {selectedIds.length > 0 && `(${selectedIds.length} selected)`}
          </label>
        )}
      </div>

      {/* Bulk action bar — only when 1+ employees are selected */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-wrap">
          <button
            type="button"
            onClick={onBulkCheckIn}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Check In ({selectedIds.length})
          </button>
          <button
            type="button"
            onClick={onBulkCheckOut}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Check Out ({selectedIds.length})
          </button>
          <button
            type="button"
            onClick={onBulkManualHours}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            Enter Hours ({selectedIds.length})
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-200 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-600">
            <p className="text-sm">No employees found</p>
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map(emp => (
              <li key={emp.employee_id} data-focus-id={emp.employee_id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(emp.employee_id)}
                  onChange={() => onToggleSelect(emp.employee_id)}
                  onClick={e => e.stopPropagation()}
                  className="ml-4 w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 flex-shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onSelect(emp)}
                  className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selectedId === emp.employee_id
                      ? 'bg-gray-900 dark:bg-white'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase ${
                    selectedId === emp.employee_id
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}>
                    {emp.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-semibold truncate flex-1 ${
                        selectedId === emp.employee_id
                          ? 'text-white dark:text-gray-900'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {emp.name}
                      </span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onEdit(emp) }}
                        className={`p-1 rounded-lg flex-shrink-0 transition-colors ${
                          selectedId === emp.employee_id
                            ? 'text-white/70 dark:text-gray-600 hover:bg-white/20 dark:hover:bg-gray-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                        title="Edit employee"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onHistory(emp) }}
                        className={`p-1 rounded-lg flex-shrink-0 transition-colors ${
                          selectedId === emp.employee_id
                            ? 'text-white/70 dark:text-gray-600 hover:bg-white/20 dark:hover:bg-gray-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                        title="View full history"
                      >
                        <History className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {emp.pay_type === 'hourly' ? (
                        <Clock className={`w-3 h-3 ${selectedId === emp.employee_id ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`} />
                      ) : (
                        <DollarSign className={`w-3 h-3 ${selectedId === emp.employee_id ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`} />
                      )}
                      <span className={`text-xs ${selectedId === emp.employee_id ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                        {symbol}{emp.rate}/{emp.pay_type === 'hourly' ? 'hr' : 'day'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        emp.pay_type === 'hourly'
                          ? selectedId === emp.employee_id
                            ? 'bg-white/20 dark:bg-gray-900/20 text-white dark:text-gray-900'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : selectedId === emp.employee_id
                            ? 'bg-white/20 dark:bg-gray-900/20 text-white dark:text-gray-900'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}>
                        {emp.pay_type}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
