import { useState } from 'react'
import { FileText, Layers, Plus, Settings } from 'lucide-react'
import type { Employee } from '@/pages/Salary'
import WorkGroupsView from './WorkGroupsView'
import InvoiceBuilder from './InvoiceBuilder'
import InvoiceListView from './InvoiceListView'
import InvoiceSettingsView from './InvoiceSettingsView'
import WeeklyOffSettings from './WeeklyOffSettings'

/**
 * Payroll invoicing, as a tab inside Salary & Attendance.
 *
 * Four sub-views because they're four separate jobs: set up the groups once,
 * raise an invoice each period, chase what's outstanding, and fill in the
 * business/bank details that the invoice footer and GST split depend on.
 */

type SubTab = 'invoices' | 'new' | 'groups' | 'settings'

const SUB_TABS: { id: SubTab; label: string; icon: typeof FileText }[] = [
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'new', label: 'New invoice', icon: Plus },
  { id: 'groups', label: 'Work groups', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface Props {
  employees: Employee[]
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
  onEmployeesChanged: () => void
}

export default function PayrollInvoicePanel({
  employees, canManage, onToast, onEmployeesChanged,
}: Props) {
  const [sub, setSub] = useState<SubTab>('invoices')
  const [listRefresh, setListRefresh] = useState(0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
              sub === id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {sub === 'invoices' && (
        <InvoiceListView canManage={canManage} onToast={onToast} refreshSignal={listRefresh} />
      )}

      {sub === 'new' && (
        <InvoiceBuilder
          employees={employees}
          canManage={canManage}
          onToast={onToast}
          // Jump straight to the list so the new invoice is visible where it
          // will be chased for payment, rather than leaving an empty builder.
          onSaved={() => { setListRefresh(n => n + 1); setSub('invoices') }}
        />
      )}

      {sub === 'groups' && (
        <WorkGroupsView
          employees={employees}
          canManage={canManage}
          onToast={onToast}
          onEmployeesChanged={onEmployeesChanged}
        />
      )}

      {sub === 'settings' && (
        <div className="space-y-4">
          <InvoiceSettingsView canManage={canManage} onToast={onToast} />
          {/* Not invoice config, but it is salary config and this is the only
              settings surface the Salary section has. */}
          <WeeklyOffSettings canManage={canManage} onToast={onToast} />
        </div>
      )}
    </div>
  )
}
