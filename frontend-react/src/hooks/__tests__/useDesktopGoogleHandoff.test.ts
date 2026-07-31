import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDesktopGoogleHandoff } from '@/hooks/useDesktopGoogleHandoff'

/**
 * The hook is the transport half of desktop Google sign-in: open the browser,
 * receive the valoryx:// handoff (or a pasted code), hand it to the caller.
 * These tests stand in for the Electron bridge, which only exists in a packaged
 * build — the real deep-link round trip still needs a manual smoke test.
 */

const HANDOFF = { assertion: 'signed.jwt.here', verifier: 'pkce-verifier' }

function mockBridge(overrides: Record<string, any> = {}) {
  const listeners: Array<(h: any) => void> = []
  const bridge = {
    isElectron: true,
    loginWithGoogle: vi.fn().mockResolvedValue({ success: true }),
    onDesktopOAuth: vi.fn((cb: (h: any) => void) => { listeners.push(cb) }),
    removeDesktopOAuth: vi.fn(() => { listeners.length = 0 }),
    getPendingOAuth: vi.fn().mockResolvedValue(null),
    redeemOAuthCode: vi.fn().mockResolvedValue(HANDOFF),
    ...overrides,
  }
  ;(window as any).electronAPI = bridge
  return { bridge, emitDeepLink: (h: any) => listeners.forEach(cb => cb(h)) }
}

beforeEach(() => {
  delete (window as any).electronAPI
})

afterEach(() => {
  delete (window as any).electronAPI
  vi.restoreAllMocks()
})

describe('useDesktopGoogleHandoff', () => {
  it('reports unavailable outside Electron and refuses to start', () => {
    const onHandoff = vi.fn()
    const { result } = renderHook(() => useDesktopGoogleHandoff(onHandoff))

    expect(result.current.available).toBe(false)
    act(() => { expect(result.current.start()).toBe(false) })
    expect(result.current.waiting).toBe(false)
  })

  it('opens the system browser and waits', () => {
    const { bridge } = mockBridge()
    const { result } = renderHook(() => useDesktopGoogleHandoff(vi.fn()))

    expect(result.current.available).toBe(true)
    act(() => { expect(result.current.start()).toBe(true) })

    expect(bridge.loginWithGoogle).toHaveBeenCalledTimes(1)
    expect(result.current.waiting).toBe(true)
  })

  it('delivers a deep-link handoff to the caller and stops waiting', async () => {
    const { emitDeepLink } = mockBridge()
    const onHandoff = vi.fn()
    const { result } = renderHook(() => useDesktopGoogleHandoff(onHandoff))

    act(() => { result.current.start() })
    await act(async () => { emitDeepLink(HANDOFF) })

    expect(onHandoff).toHaveBeenCalledWith(HANDOFF)
    await waitFor(() => expect(result.current.waiting).toBe(false))
  })

  it('stops waiting even when the caller throws, so the button comes back', async () => {
    const { emitDeepLink } = mockBridge()
    const onHandoff = vi.fn().mockRejectedValue(new Error('exchange failed'))
    const { result } = renderHook(() => useDesktopGoogleHandoff(onHandoff))

    act(() => { result.current.start() })
    await act(async () => {
      try { emitDeepLink(HANDOFF) } catch { /* surfaced by the caller, not here */ }
    })

    await waitFor(() => expect(result.current.waiting).toBe(false))
  })

  it('replays a handoff that arrived before mount (cold start)', async () => {
    mockBridge({ getPendingOAuth: vi.fn().mockResolvedValue(HANDOFF) })
    const onHandoff = vi.fn()

    renderHook(() => useDesktopGoogleHandoff(onHandoff))

    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(HANDOFF))
  })

  it('ignores a handoff with no assertion', async () => {
    const { emitDeepLink } = mockBridge()
    const onHandoff = vi.fn()
    renderHook(() => useDesktopGoogleHandoff(onHandoff))

    await act(async () => { emitDeepLink({ assertion: '', verifier: null }) })

    expect(onHandoff).not.toHaveBeenCalled()
  })

  it('redeems a pasted code through the main process', async () => {
    const { bridge } = mockBridge()
    const onHandoff = vi.fn()
    const { result } = renderHook(() => useDesktopGoogleHandoff(onHandoff))

    act(() => { result.current.setPastedCode('  pasted.code  ') })
    let message: string | null = 'unset'
    await act(async () => { message = await result.current.submitCode() })

    expect(bridge.redeemOAuthCode).toHaveBeenCalledWith('pasted.code')
    expect(onHandoff).toHaveBeenCalledWith(HANDOFF)
    expect(message).toBeNull()
  })

  it('returns a message when the pasted code is unreadable', async () => {
    mockBridge({ redeemOAuthCode: vi.fn().mockResolvedValue(null) })
    const onHandoff = vi.fn()
    const { result } = renderHook(() => useDesktopGoogleHandoff(onHandoff))

    act(() => { result.current.setPastedCode('garbage') })
    let message: string | null = null
    await act(async () => { message = await result.current.submitCode() })

    expect(message).toMatch(/could not be read/i)
    expect(onHandoff).not.toHaveBeenCalled()
  })

  it('does nothing for an empty pasted code', async () => {
    const { bridge } = mockBridge()
    const { result } = renderHook(() => useDesktopGoogleHandoff(vi.fn()))

    let message: string | null = 'unset'
    await act(async () => { message = await result.current.submitCode() })

    expect(bridge.redeemOAuthCode).not.toHaveBeenCalled()
    expect(message).toBeNull()
  })

  it('registers the deep-link listener once and removes it on unmount', () => {
    const { bridge } = mockBridge()
    const { rerender, unmount } = renderHook(
      // A fresh inline callback every render — the hook must not re-register.
      () => useDesktopGoogleHandoff(() => {}),
    )

    rerender()
    rerender()
    expect(bridge.onDesktopOAuth).toHaveBeenCalledTimes(1)

    unmount()
    expect(bridge.removeDesktopOAuth).toHaveBeenCalledTimes(1)
  })

  it('always calls the newest callback, not the one from first render', async () => {
    const { emitDeepLink } = mockBridge()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useDesktopGoogleHandoff(cb), {
      initialProps: { cb: first },
    })

    rerender({ cb: second })
    await act(async () => { emitDeepLink(HANDOFF) })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(HANDOFF)
  })
})
