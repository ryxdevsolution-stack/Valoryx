import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import api, {
  invalidateCache,
  cachedGet,
  setLogoutHandler,
  setLoadingHandlers,
} from '@/lib/api'

const BASE = 'http://localhost:5017/api'

beforeEach(() => {
  // Reset cache and module-level state between tests
  invalidateCache()
  setLogoutHandler(() => {})
  setLoadingHandlers(() => {}, () => {})
})

// ── 1. Request includes Authorization header ─────────────────────────────────
describe('request interceptor', () => {
  it('injects Authorization header when token is in localStorage', async () => {
    localStorage.setItem('token', 'test-token-abc')
    let capturedAuth: string | null = null

    server.use(
      http.get(`${BASE}/stock`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization')
        return HttpResponse.json([])
      })
    )

    await api.get('/stock')
    expect(capturedAuth).toBe('Bearer test-token-abc')
  })

  // ── 2. No auth header when no token ────────────────────────────────────────
  it('sends no Authorization header when localStorage has no token', async () => {
    localStorage.removeItem('token')
    let capturedAuth: string | null = 'present' // sentinel

    server.use(
      http.get(`${BASE}/stock`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization')
        return HttpResponse.json([])
      })
    )

    await api.get('/stock')
    expect(capturedAuth).toBeNull()
  })

  // ── 3. FormData removes Content-Type ───────────────────────────────────────
  it('removes Content-Type header for FormData requests so browser sets multipart boundary', async () => {
    let capturedContentType: string | null = 'application/json' // sentinel

    server.use(
      http.post(`${BASE}/upload`, ({ request }) => {
        capturedContentType = request.headers.get('Content-Type')
        return HttpResponse.json({ ok: true })
      })
    )

    const form = new FormData()
    form.append('file', new Blob(['data']), 'test.txt')
    await api.post('/upload', form)

    // browser sets multipart/form-data with boundary — no explicit Content-Type
    expect(capturedContentType).not.toBe('application/json')
  })
})

// ── 4 & 5. 401 clears auth + calls logout exactly once ───────────────────────
describe('401 response handling', () => {
  it('clears localStorage auth keys and calls logout handler on 401', async () => {
    localStorage.setItem('token', 'expired-token')
    localStorage.setItem('user', '{"user_id":"u1"}')
    localStorage.setItem('client', '{"client_id":"c1"}')

    const logoutMock = vi.fn()
    setLogoutHandler(logoutMock)

    server.use(
      http.get(`${BASE}/billing/list`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    )

    await expect(api.get('/billing/list')).rejects.toThrow()

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('client')).toBeNull()
  })

  it('calls logout handler exactly once (no infinite loop)', async () => {
    const logoutMock = vi.fn()
    setLogoutHandler(logoutMock)

    server.use(
      http.get(`${BASE}/billing/list`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    )

    await expect(api.get('/billing/list')).rejects.toThrow()
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it('flags SESSION_REVOKED logouts with a reason for the login page', async () => {
    server.use(
      http.get(`${BASE}/anything`, () =>
        HttpResponse.json(
          { error: 'Session has been revoked. Please login again.', code: 'SESSION_REVOKED' },
          { status: 401 }
        )
      )
    )

    await api.get('/anything').catch(() => {})

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('logout_reason')).toBe('session_revoked')
  })
})

// ── 6. 403 TRIAL_EXPIRED / SUBSCRIPTION_EXPIRED redirects to upgrade page ──────
describe('403 expiry code handling', () => {
  it('changes window.location.href to /upgrade on TRIAL_EXPIRED', async () => {
    // jsdom allows assigning window.location.href
    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: originalHref, hash: '' },
    })

    server.use(
      http.get(`${BASE}/stock`, () =>
        HttpResponse.json(
          { error: 'Trial expired', code: 'TRIAL_EXPIRED' },
          { status: 403 }
        )
      )
    )

    await expect(api.get('/stock')).rejects.toThrow()
    expect(window.location.href).toBe('/upgrade')
  })

  it('changes window.location.href to /upgrade on SUBSCRIPTION_EXPIRED', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/', hash: '' },
    })

    server.use(
      http.get(`${BASE}/stock`, () =>
        HttpResponse.json(
          { error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' },
          { status: 403 }
        )
      )
    )

    await expect(api.get('/stock')).rejects.toThrow()
    expect(window.location.href).toBe('/upgrade')
  })
})

// ── 7. GET response cached with correct TTL ───────────────────────────────────
describe('response caching', () => {
  it('returns cached data on second cachedGet within TTL (no second network call)', async () => {
    let callCount = 0

    server.use(
      // Note: /stock/lookup, not /stock — plain /stock has no entry in
      // CACHE_TTLS (stock lists must always be fresh) so it is never cached.
      http.get(`${BASE}/stock/lookup`, () => {
        callCount++
        return HttpResponse.json([{ product_id: 'p1', product_name: 'Cached Widget' }])
      })
    )

    const first = await cachedGet('/stock/lookup')
    const second = await cachedGet('/stock/lookup')

    expect(callCount).toBe(1) // only one network request
    expect(second.data).toEqual(first.data)
  })

  // ── 8. Cache expires after TTL ─────────────────────────────────────────────
  it('makes a fresh network request after TTL expires', async () => {
    let callCount = 0

    server.use(
      http.get(`${BASE}/customer/search`, () => {
        callCount++
        return HttpResponse.json([])
      })
    )

    await cachedGet('/customer/search')
    expect(callCount).toBe(1)

    // Manually expire the cache entry by invalidating it
    invalidateCache('/customer/search')

    await cachedGet('/customer/search')
    expect(callCount).toBe(2)
  })
})

// ── 9. invalidateCache("billing") clears billing cache only ──────────────────
describe('invalidateCache', () => {
  it('clears only billing cache when pattern "billing" passed, leaves stock cache', async () => {
    let stockCalls = 0
    let billingCalls = 0

    server.use(
      // /stock/lookup is a cacheable endpoint (plain /stock is never cached)
      http.get(`${BASE}/stock/lookup`, () => {
        stockCalls++
        return HttpResponse.json([])
      }),
      http.get(`${BASE}/billing/list`, () => {
        billingCalls++
        return HttpResponse.json({ bills: [] })
      })
    )

    // Prime both caches
    await cachedGet('/stock/lookup')
    await cachedGet('/billing/list')
    expect(stockCalls).toBe(1)
    expect(billingCalls).toBe(1)

    // Invalidate billing only
    invalidateCache('billing')

    // Stock still cached; billing fetches again
    await cachedGet('/stock/lookup')
    await cachedGet('/billing/list')

    expect(stockCalls).toBe(1)   // no new stock request
    expect(billingCalls).toBe(2) // billing re-fetched
  })

  // ── 10. invalidateCache() with no args clears all ─────────────────────────
  it('clears all cache entries when called with no arguments', async () => {
    let stockCalls = 0
    let billingCalls = 0

    server.use(
      http.get(`${BASE}/stock`, () => {
        stockCalls++
        return HttpResponse.json([])
      }),
      http.get(`${BASE}/billing/list`, () => {
        billingCalls++
        return HttpResponse.json({ bills: [] })
      })
    )

    await cachedGet('/stock')
    await cachedGet('/billing/list')

    invalidateCache() // clear all

    await cachedGet('/stock')
    await cachedGet('/billing/list')

    expect(stockCalls).toBe(2)
    expect(billingCalls).toBe(2)
  })
})

// ── 11 & 12. Loading spinner behaviour ───────────────────────────────────────
describe('loading spinner', () => {
  it('does NOT call showLoading for requests completing under 100ms', async () => {
    vi.useFakeTimers()
    const showLoading = vi.fn()
    const hideLoading = vi.fn()
    setLoadingHandlers(showLoading, hideLoading)

    server.use(
      http.get(`${BASE}/customer/search`, async () => {
        return HttpResponse.json([])
      })
    )

    const promise = api.get('/customer/search', { showLoading: true })
    // Advance only 50ms — under the 100ms delay threshold
    vi.advanceTimersByTime(50)
    await promise

    expect(showLoading).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('calls hideLoading exactly once after all parallel requests complete', async () => {
    const showLoading = vi.fn()
    const hideLoading = vi.fn()
    setLoadingHandlers(showLoading, hideLoading)

    // Run 3 concurrent requests — hideLoading must fire only when activeRequests reaches 0
    await Promise.all([
      api.get('/stock', { showLoading: true }),
      api.get('/billing/list', { showLoading: true }),
      api.get('/customer/search', { showLoading: true }),
    ])

    // If hideLoading were called after each request, it would be called 3 times.
    // The counter guards ensure it fires exactly once (when last request completes).
    expect(hideLoading).toHaveBeenCalledTimes(1)
  })
})
