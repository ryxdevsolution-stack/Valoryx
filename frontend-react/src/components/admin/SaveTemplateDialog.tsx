import { useEffect, useRef, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import {
  permissionTemplateService,
  PermissionTemplate,
} from '@/services/permissionTemplateService'

type Mode = 'create' | 'edit'

type InitialValues = {
  template_id: string
  name: string
  description?: string
}

type Props = {
  open: boolean
  mode: Mode
  initialValues?: InitialValues
  currentPermissions: string[]
  onSaved: (template: PermissionTemplate) => void
  onClose: () => void
}

/**
 * Modal for creating or editing a custom permission template.
 *
 * - Validates name length client-side (3-40 chars).
 * - Maps server validation errors (400 with {field, message}) to inline errors.
 * - The permissions list is currentPermissions at the moment Save is clicked —
 *   the caller (CreateClient) is responsible for keeping that prop in sync with
 *   the user's checkbox selections.
 */
export function SaveTemplateDialog({
  open, mode, initialValues, currentPermissions, onSaved, onClose,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Reset when opened with new initialValues (e.g. switching from create to edit).
  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '')
      setDescription(initialValues?.description ?? '')
      setNameError(null)
      setPermError(null)
      setGeneralError(null)
    }
  }, [open, initialValues])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const validateClient = (): boolean => {
    setNameError(null); setPermError(null); setGeneralError(null)
    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed.length > 40) {
      setNameError('Name must be 3-40 characters')
      return false
    }
    if (currentPermissions.length === 0) {
      setPermError('Select at least one permission first')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!validateClient()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: currentPermissions,
      }
      const res = mode === 'create'
        ? await permissionTemplateService.create(payload)
        : await permissionTemplateService.update(initialValues!.template_id, payload)
      onSaved(res.template)
      onClose()
    } catch (err: any) {
      const body = err?.response?.data
      if (body?.field === 'name')         setNameError(body.message || 'Invalid name')
      else if (body?.field === 'permissions') setPermError(body.message || 'Invalid permissions')
      else                                 setGeneralError(body?.error || body?.message || 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Save template' : 'Edit template'}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'create' ? 'Save as template' : 'Edit template'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="template-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template name <span className="text-red-500">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Cashier-Plus"
              autoFocus
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>

          <div>
            <label htmlFor="template-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="template-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="What's this template for?"
            />
          </div>

          <p className="text-xs text-gray-500">
            This template will save <strong>{currentPermissions.length} permissions</strong>.
          </p>

          {permError && <p className="text-xs text-red-600">{permError}</p>}
          {generalError && <p className="text-xs text-red-600">{generalError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
