import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PricingCards from '@/components/PricingCards'
import PricingSection from '@/components/landing/PricingSection'
import ErrorBoundary from '@/components/ErrorBoundary'
import api from '@/lib/api'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// The landing section animates in with framer-motion's whileInView, which needs
// an IntersectionObserver that jsdom does not provide. The stub reports every
// observed node as visible so the cards render.
class IntersectionObserverStub {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb([{ target, isIntersecting: true } as IntersectionObserverEntry], this as any)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

vi.mock('@/contexts/ClientContext', () => ({
  useClient: () => ({
    token: 't',
    client: { client_id: 'c-1', client_name: 'Test Shop', subscription_status: 'trial', currency_code: 'INR' },
    updateSubscriptionStatus: vi.fn(),
    refreshClientData: vi.fn(),
  }),
}))

const mockedGet = vi.mocked(api.get)

/**
 * The plan the shop actually sells now. `limits: {}` mirrors what the backend
 * emits when a plan is created without user/bill caps — the admin form makes
 * both optional, so this is the realistic shape, not an edge case.
 */
const FIFTEEN_HUNDRED_PLAN = {
  plan_id: 'p-1500',
  name: 'Business',
  description: 'Everything your shop needs',
  monthly_price: 150000,
  yearly_price: 1500000,
  currency: 'INR',
  features: ['GST billing', 'Inventory'],
  limits: {},
  is_popular: true,
}

const OTHER_PLANS = [
  { ...FIFTEEN_HUNDRED_PLAN, plan_id: 'p-999', name: 'Starter', monthly_price: 99900, is_popular: false },
  FIFTEEN_HUNDRED_PLAN,
  { ...FIFTEEN_HUNDRED_PLAN, plan_id: 'p-7999', name: 'Enterprise', monthly_price: 799900, is_popular: false },
]

describe('PricingCards with a single visible plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders only the plan the API returned', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [FIFTEEN_HUNDRED_PLAN] } } as any)

    render(
      <ErrorBoundary showDetails>
        <MemoryRouter><PricingCards /></MemoryRouter>
      </ErrorBoundary>,
    )

    expect(await screen.findByText('Business')).toBeInTheDocument()
    expect(screen.getByText(/₹1,500/)).toBeInTheDocument()
    expect(screen.queryByText('Starter')).toBeNull()
    expect(screen.queryByText('Enterprise')).toBeNull()
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })

  it('lays the lone card out as one column instead of stranding it in a 3-col grid', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [FIFTEEN_HUNDRED_PLAN] } } as any)

    const { container } = render(
      <MemoryRouter><PricingCards /></MemoryRouter>,
    )

    await screen.findByText('Business')
    const grid = container.querySelector('.grid')!
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).not.toContain('md:grid-cols-3')
  })

  it('drops the "Most Popular" badge when there is nothing to compare against', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [FIFTEEN_HUNDRED_PLAN] } } as any)

    render(<MemoryRouter><PricingCards /></MemoryRouter>)

    await screen.findByText('Business')
    expect(screen.queryByText(/most popular/i)).toBeNull()
    // ...but the only way to pay is still a solid primary button.
    expect(screen.getByRole('button', { name: /subscribe now/i }).className).toContain('bg-blue-600')
  })

  it('still uses the 3-column grid when several plans come back', async () => {
    mockedGet.mockResolvedValue({ data: { plans: OTHER_PLANS } } as any)

    const { container } = render(<MemoryRouter><PricingCards /></MemoryRouter>)

    await screen.findByText('Enterprise')
    expect(container.querySelector('.grid')!.className).toContain('md:grid-cols-3')
    expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  })
})

describe('Landing PricingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows only the live plan, never the old hardcoded three', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [FIFTEEN_HUNDRED_PLAN] } } as any)

    render(<MemoryRouter><PricingSection /></MemoryRouter>)

    expect(await screen.findByText('Business')).toBeInTheDocument()
    expect(screen.queryByText('Starter')).toBeNull()
    expect(screen.queryByText('Professional')).toBeNull()
    expect(screen.queryByText('Enterprise')).toBeNull()
  })

  it('renders nothing rather than resurrecting hidden plans when the API fails', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'))

    const { container } = render(<MemoryRouter><PricingSection /></MemoryRouter>)

    // Advertising a price checkout will not honour is worse than no pricing.
    await waitFor(() => expect(container.querySelector('#pricing')).toBeNull())
    expect(screen.queryByText(/₹999/)).toBeNull()
    expect(screen.queryByText(/₹2,499/)).toBeNull()
  })

  it('survives a plan whose limits object is empty', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [{ ...FIFTEEN_HUNDRED_PLAN, features: undefined }] } } as any)

    render(
      <ErrorBoundary showDetails>
        <MemoryRouter><PricingSection /></MemoryRouter>
      </ErrorBoundary>,
    )

    expect(await screen.findByText('Business')).toBeInTheDocument()
    // A plan with no caps set shows no limit badges at all — not a "—" placeholder.
    expect(screen.queryByText(/users/)).toBeNull()
    expect(screen.queryByText(/bills\/mo/)).toBeNull()
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })
})
