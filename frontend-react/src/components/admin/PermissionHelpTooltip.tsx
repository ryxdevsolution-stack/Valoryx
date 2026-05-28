import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { permissionMeta } from '@/data/permissionMeta'

type Props = {
  permissionName: string
}

/**
 * Renders an (i) trigger next to a permission label. On click (or desktop hover),
 * opens a small tooltip card with a themed icon + plain-English example.
 *
 * Returns null when the permission is not documented in permissionMeta — the row
 * then renders normally with no (i) icon (graceful fallback).
 *
 * Anchoring: captures the trigger's getBoundingClientRect() on open and renders
 * the card as position:fixed at those coordinates via a portal to document.body.
 * Survives parent scroll and overflow-y-auto without a popover library.
 */
export function PermissionHelpTooltip({ permissionName }: Props) {
  const meta = permissionMeta[permissionName]
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ top: rect.bottom + 6, left: rect.right })
  }, [])

  const close = useCallback(() => setAnchor(null), [])

  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (cardRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close()
    }
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, close])

  if (!meta) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More info about ${permissionName}`}
        aria-expanded={anchor !== null}
        onClick={() => (anchor ? close() : open())}
        onMouseEnter={open}
        onMouseLeave={(e) => {
          const next = e.relatedTarget as Node | null
          if (next && cardRef.current?.contains(next)) return
          setTimeout(() => {
            if (!cardRef.current?.matches(':hover')) close()
          }, 60)
        }}
        className="ml-auto p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {anchor && createPortal(
        <div
          ref={cardRef}
          role="tooltip"
          style={{ position: 'fixed', top: anchor.top, left: Math.max(8, anchor.left - 280), zIndex: 70 }}
          onMouseLeave={close}
          className="w-72 rounded-lg bg-gray-900 text-white shadow-2xl ring-1 ring-black/20 p-3 text-xs"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base" aria-hidden="true">{meta.icon}</span>
            <span className="font-semibold">{permissionName}</span>
          </div>
          <p className="text-gray-200 leading-snug">{meta.example}</p>
        </div>,
        document.body
      )}
    </>
  )
}
