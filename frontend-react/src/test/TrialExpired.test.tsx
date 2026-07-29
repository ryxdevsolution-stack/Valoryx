import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrialExpired from '@/pages/TrialExpired'
import ErrorBoundary from '@/components/ErrorBoundary'
import api from '@/lib/api'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const mockClient = {
  client_id: 'c-1',
  client_name: 'Test Shop',
  subscription_status: 'expired',
  subscription_end_date: '2026-07-01',
  currency_code: 'INR',
}

vi.mock('@/contexts/ClientContext', () => ({
  useClient: () => ({
    logout: vi.fn(),
    client: mockClient,
    user: { role: 'owner' },
    token: 't',
    updateSubscriptionStatus: vi.fn(),
    refreshClientData: vi.fn(),
  }),
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)

/** A plan with limits: {} — exactly what the backend emits for a NULL column. */
const PLAN_WITH_EMPTY_LIMITS = {
  plan_id: 'p-1',
  name: 'Starter',
  description: 'Small shops',
  monthly_price: 99900,
  yearly_price: 999900,
  currency: 'INR',
  features: ['Basic invoicing'],
  limits: {},
  is_popular: false,
}

function renderPage() {
  return render(
    <ErrorBoundary showDetails>
      <MemoryRouter>
        <TrialExpired />
      </MemoryRouter>
    </ErrorBoundary>,
  )
}

describe('TrialExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).electronAPI = { isElectron: true }
    mockedPost.mockResolvedValue({ data: { status: 'success' } } as any)
  })

  it('renders plans whose limits object is empty instead of crashing the app', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [PLAN_WITH_EMPTY_LIMITS] } } as any)

    renderPage()

    // The page must survive — previously formatLimit(undefined) threw here and
    // took the whole tree down, leaving a blank screen.
    expect(await screen.findByText(/your subscription has expired/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/users/)).toBeInTheDocument())
    // Missing limits degrade to a placeholder, not an exception.
    expect(screen.getByText(/— users/)).toBeInTheDocument()
    expect(screen.getByText(/— bills\/mo/)).toBeInTheDocument()
    // ErrorBoundary must NOT have engaged.
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })

  it('requests the one-time expiry backup rather than a raw upload', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)

    renderPage()

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        '/sync/expiry-backup',
        { client_id: 'c-1' },
        expect.objectContaining({ timeout: expect.any(Number) }),
      ),
    )
    // The ungated upload endpoint must NOT be used here — reopening this page
    // would otherwise be an unlimited free sync channel around the paid gate.
    expect(mockedPost).not.toHaveBeenCalledWith(
      '/sync/trigger?type=upload', expect.anything(), expect.anything())
    expect(await screen.findByText(/your data is backed up to the cloud/i)).toBeInTheDocument()
  })

  it('reports an already-taken backup as done, not failed', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)
    mockedPost.mockResolvedValue({ data: { status: 'already_taken' } } as any)

    renderPage()

    expect(await screen.findByText(/your data is backed up to the cloud/i)).toBeInTheDocument()
  })

  it('tells the user data is safe locally when the backup cannot reach the cloud', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)
    mockedPost.mockRejectedValue(new Error('Network Error'))

    renderPage()

    expect(await screen.findByText(/backup pending .* saved on this device/i)).toBeInTheDocument()
  })

  it('skips the upload on web, where there is no local database to push', async () => {
    ;(window as any).electronAPI = undefined
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)

    renderPage()

    await screen.findByText(/your subscription has expired/i)
    expect(mockedPost).not.toHaveBeenCalled()
  })
})

describe('TrialExpired — "already paid" recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).electronAPI = { isElectron: true }
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)
  })

  const clickAlreadyPaid = async () =>
    fireEvent.click(await screen.findByRole('button', { name: /already paid/i }))

  it('pulls the cloud billing state for this client', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'success', is_active: false } } as any)

    renderPage()
    await clickAlreadyPaid()

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        '/sync/subscription',
        { client_id: 'c-1' },
        expect.objectContaining({ timeout: expect.any(Number) }),
      ),
    )
  })

  it('says no payment found yet when the cloud still shows them unpaid', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'success', is_active: false } } as any)

    renderPage()
    await clickAlreadyPaid()

    expect(await screen.findByText(/no active payment found yet/i)).toBeInTheDocument()
  })

  it('distinguishes being offline from having no payment', async () => {
    // These must not read the same: "we couldn't check" is a very different
    // message to a customer than "you haven't paid".
    mockedPost.mockResolvedValue({ data: { status: 'offline' } } as any)

    renderPage()
    await clickAlreadyPaid()

    expect(await screen.findByText(/can't reach the cloud/i)).toBeInTheDocument()
    expect(screen.queryByText(/no active payment found/i)).toBeNull()
  })

  it('surfaces a failed request instead of silently doing nothing', async () => {
    mockedPost.mockRejectedValue(new Error('Network Error'))

    renderPage()
    await clickAlreadyPaid()

    expect(await screen.findByText(/couldn't check your payment status/i)).toBeInTheDocument()
  })
})
