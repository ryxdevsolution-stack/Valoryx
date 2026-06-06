/**
 * Bridges a desktop-app download across an OAuth redirect.
 *
 * When a user starts the download via "Continue with Google", the browser
 * navigates away to Google before the download can fire. We stash the installer
 * URL in localStorage, then trigger the download once the OAuth callback lands
 * the user back in the app.
 */
const KEY = 'valoryx_pending_download'

export function setPendingDownload(url: string): void {
  try {
    localStorage.setItem(KEY, url)
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function clearPendingDownload(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** If a download was deferred across an OAuth redirect, trigger it now (once). */
export function consumePendingDownload(): void {
  let url: string | null = null
  try {
    url = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
  } catch {
    return
  }
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
