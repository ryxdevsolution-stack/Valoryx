import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UpdateNotification from '@/components/UpdateNotification'
import api from '@/lib/api'

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
}))

const mockedPost = vi.mocked(api.post)

/**
 * Stubs the Electron bridge with an update already downloaded, so the component
 * renders straight into the "Restart & Update" state.
 */
function stubElectronAPI() {
  const installUpdate = vi.fn()
  ;(window as any).electronAPI = {
    onUpdateStatus: vi.fn(),
    removeUpdateStatus: vi.fn(),
    getUpdateStatus: vi.fn().mockResolvedValue({
      status: 'downloaded',
      data: { version: '1.1.23' },
    }),
    installUpdate,
    downloadUpdate: vi.fn(),
  }
  return installUpdate
}

// The toast mounts empty and only renders once the async getUpdateStatus()
// replay resolves — so the button has to be awaited, not queried synchronously.
const clickInstall = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /restart & update/i }))

describe('UpdateNotification — pre-install upload sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads local changes before handing off to the installer', async () => {
    const installUpdate = stubElectronAPI()
    // Resolve only when we say so, to prove install waits for the upload.
    let resolveSync: (v: unknown) => void = () => {}
    mockedPost.mockReturnValue(new Promise((res) => { resolveSync = res }) as any)

    render(<UpdateNotification />)
    await clickInstall()

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    expect(mockedPost).toHaveBeenCalledWith(
      '/sync/trigger?type=upload',
      null,
      expect.objectContaining({ timeout: expect.any(Number) }),
    )
    // Backend is force-killed by installUpdate — it must not fire mid-upload.
    expect(installUpdate).not.toHaveBeenCalled()

    resolveSync({ data: { status: 'success' } })
    await waitFor(() => expect(installUpdate).toHaveBeenCalledTimes(1))
  })

  it('still installs when the upload fails — data stays flagged unsynced locally', async () => {
    const installUpdate = stubElectronAPI()
    mockedPost.mockRejectedValue(new Error('Network Error'))

    render(<UpdateNotification />)
    await clickInstall()

    await waitFor(() => expect(installUpdate).toHaveBeenCalledTimes(1))
  })

  it('ignores repeat clicks while the upload is in flight', async () => {
    stubElectronAPI()
    mockedPost.mockReturnValue(new Promise(() => {}) as any)  // never settles

    render(<UpdateNotification />)
    await clickInstall()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving your data/i })).toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /saving your data/i }))

    expect(mockedPost).toHaveBeenCalledTimes(1)
  })
})
