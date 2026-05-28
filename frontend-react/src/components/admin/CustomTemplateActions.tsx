import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { permissionTemplateService, PermissionTemplate } from '@/services/permissionTemplateService'

type Props = {
  template: PermissionTemplate
  onEdit: (template: PermissionTemplate) => void
  /** Called after a successful delete (so the caller can re-fetch the list). */
  onDeleted: (template_id: string) => void
}

/**
 * Overlay rendered absolutely-positioned in the top-right of a custom template
 * card. Edit and Delete buttons fade in on parent hover via Tailwind
 * `group-hover` (the parent card must have `group` in its className).
 *
 * Delete uses an inline confirm popover (not a modal) so the user's larger
 * client-creation flow isn't disrupted.
 */
export function CustomTemplateActions({ template, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!template.template_id) return
    setDeleting(true)
    setError(null)
    try {
      await permissionTemplateService.delete(template.template_id)
      onDeleted(template.template_id)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        aria-label={`Edit template ${template.name}`}
        onClick={(e) => { e.stopPropagation(); onEdit(template) }}
        className="p-1 rounded bg-white/80 hover:bg-white text-gray-600 hover:text-blue-600 shadow-sm"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete template ${template.name}`}
        onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
        className="p-1 rounded bg-white/80 hover:bg-white text-gray-600 hover:text-red-600 shadow-sm"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label="Confirm delete"
          className="absolute top-7 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-gray-700 mb-2">Delete &quot;{template.name}&quot;?</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      )}
    </div>
  )
}
