import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SyncButton from '@/components/SyncButton'
import api from '@/lib/api'

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/contexts/ClientContext', () => ({
  useClient: () => ({ client: { client_id: 'c-1' } }),
}))

const mockedGet = vi.mocked(api.get)

describe('SyncButton entitlement states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the paid-until date while entitled', async () => {
    mockedGet.mockResolvedValue({
      data: { running: true, entitled: true, paid_until: '2026-12-31T00:00:00',
              entitlement_reason: 'active' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/active until/i)).toBeInTheDocument()
  })

  it('tells a trial user when the trial ends', async () => {
    mockedGet.mockResolvedValue({
      data: { running: true, entitled: true, paid_until: '2026-08-12T00:00:00',
              entitlement_reason: 'trial' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/trial ends/i)).toBeInTheDocument()
  })

  it('says sync is paused and disables the button when not entitled', async () => {
    mockedGet.mockResolvedValue({
      data: { running: false, entitled: false, paid_until: null,
              entitlement_reason: 'expired' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/renew to turn it back on/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button')).toBeDisabled())
  })

  it('does not lock out an older backend that omits the entitled field', async () => {
    // Forward compatibility: if the desktop app updates before its backend,
    // an absent `entitled` must not be read as "unpaid".
    mockedGet.mockResolvedValue({ data: { running: true } } as any)

    render(<SyncButton />)
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
  })
})
