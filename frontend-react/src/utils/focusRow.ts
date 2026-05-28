/**
 * Scroll an element into view and apply a brief highlight class.
 * The class is added on next tick (so any concurrent re-render doesn't strip it)
 * and removed after `duration` ms.
 */
export function focusRowById(id: string, options: { duration?: number; highlightClass?: string } = {}): void {
  const duration = options.duration ?? 2000
  const highlightClass = options.highlightClass ?? 'focus-row-highlight'
  // Wait one tick so the row exists in the DOM even if we just navigated
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(id)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add(highlightClass)
    window.setTimeout(() => el.classList.remove(highlightClass), duration)
  })
}

function cssEscape(s: string): string {
  // CSS.escape isn't available everywhere; do a minimal safe escape for UUIDs/IDs (alnum + dash)
  return s.replace(/[^a-zA-Z0-9-_]/g, '\\$&')
}
