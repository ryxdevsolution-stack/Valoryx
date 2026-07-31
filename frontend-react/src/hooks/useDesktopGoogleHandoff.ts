import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Desktop Google sign-in transport.
 *
 * Google blocks OAuth inside an Electron window, so the app opens the cloud web
 * login in the system browser and the browser hands back a short-lived signed
 * assertion over the valoryx:// deep link. This hook owns *getting* that
 * handoff — opening the browser, listening for the deep link, replaying one
 * that arrived before mount, and the paste-the-code fallback for when the OS
 * has no handler registered for the scheme.
 *
 * It deliberately does not know what the handoff is spent on. The login screen
 * exchanges it for a local session; the first-run setup screen exchanges it for
 * a data sync. Both get identical PKCE behaviour because both come through here.
 *
 * Only one consumer may be mounted at a time — `removeDesktopOAuth` clears all
 * listeners on the channel. That holds today: ElectronSetup renders instead of
 * the router, so it and Login never coexist.
 */

const CODE_UNREADABLE = 'That code could not be read. Copy it again from the browser.'

/** The slice of the Electron bridge this hook touches. Narrower than the full
 *  ElectronAPI on purpose — it documents the contract the preload must keep. */
interface DesktopOAuthBridge {
  loginWithGoogle?: () => Promise<{ success: boolean }>
  onDesktopOAuth?: (callback: (handoff: DesktopOAuthHandoff) => void) => void
  removeDesktopOAuth?: () => void
  getPendingOAuth?: () => Promise<DesktopOAuthHandoff | null>
  redeemOAuthCode?: (code: string) => Promise<DesktopOAuthHandoff | null>
}

function getElectronAPI(): DesktopOAuthBridge | undefined {
  return typeof window !== 'undefined' ? (window as any).electronAPI : undefined
}

export function useDesktopGoogleHandoff(
  onHandoff: (handoff: DesktopOAuthHandoff) => void | Promise<void>,
) {
  // True while the system browser has the user; drives the "Waiting for
  // browser…" state and reveals the paste-code escape hatch.
  const [waiting, setWaiting] = useState(false)
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [pastedCode, setPastedCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  // Hold the newest callback in a ref so the deep-link effect can register
  // exactly once. Depending on `onHandoff` directly would re-register the IPC
  // listener on every render of a caller that doesn't memoize it.
  const handoffRef = useRef(onHandoff)
  useEffect(() => {
    handoffRef.current = onHandoff
  })

  const deliver = useCallback(async (handoff: DesktopOAuthHandoff | null) => {
    if (!handoff?.assertion) return
    try {
      await handoffRef.current(handoff)
    } catch (err) {
      // Consumers own error display; both of ours catch internally. If one ever
      // throws anyway, contain it here — this runs from an IPC callback nobody
      // awaits, so it would otherwise surface as an unhandled rejection that
      // main.js logs as an app-level fault.
      if (import.meta.env.DEV) {
        console.error('[DesktopGoogleHandoff] consumer failed to process handoff', err)
      }
    } finally {
      // The browser is done with us either way — success navigates away, and a
      // failure needs the button back so the user can retry. Clearing it here
      // keeps every consumer from having to remember to.
      setWaiting(false)
    }
  }, [])

  /** Open the system browser. Returns false when the bridge is unavailable so
   *  the caller can surface its own message. */
  const start = useCallback((): boolean => {
    const electronAPI = getElectronAPI()
    if (!electronAPI?.loginWithGoogle) return false
    setWaiting(true)
    electronAPI.loginWithGoogle()
    return true
  }, [])

  /** Redeem a manually pasted code. Resolves to an error message, or null on
   *  success — the caller owns how errors are displayed. */
  const submitCode = useCallback(async (): Promise<string | null> => {
    const code = pastedCode.trim()
    if (!code) return null
    setRedeeming(true)
    try {
      const handoff = await getElectronAPI()?.redeemOAuthCode?.(code)
      if (!handoff?.assertion) return CODE_UNREADABLE
      await deliver(handoff)
      return null
    } finally {
      setRedeeming(false)
    }
  }, [pastedCode, deliver])

  useEffect(() => {
    const electronAPI = getElectronAPI()
    if (!electronAPI?.onDesktopOAuth) return

    electronAPI.onDesktopOAuth(deliver)
    // Cold start: the app may have been launched by the deep link itself, so a
    // handoff can already be waiting before this listener attached.
    electronAPI.getPendingOAuth?.().then(handoff => {
      if (handoff) deliver(handoff)
    })

    return () => {
      electronAPI.removeDesktopOAuth?.()
    }
  }, [deliver])

  return {
    /** Whether the Electron bridge exposes Google sign-in at all. */
    available: !!getElectronAPI()?.loginWithGoogle,
    waiting,
    setWaiting,
    showCodeEntry,
    setShowCodeEntry,
    pastedCode,
    setPastedCode,
    redeeming,
    start,
    submitCode,
  }
}
