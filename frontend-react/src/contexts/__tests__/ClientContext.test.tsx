import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { ClientProvider, useClient } from '@/contexts/ClientContext'

// Minimal consumer component — renders whatever it reads from context
function TestConsumer() {
  const ctx = useClient()
  if (ctx.isLoading) return <div>loading</div>
  return (
    <div>
      <div data-testid="auth">{String(ctx.isAuthenticated)}</div>
      <div data-testid="token">{ctx.token ?? 'null'}</div>
      <div data-testid="user-email">{ctx.user?.email ?? 'null'}</div>
      <div data-testid="user-name">{ctx.user?.full_name ?? 'null'}</div>
      <div data-testid="client-name">{ctx.client?.client_name ?? 'null'}</div>
    </div>
  )
}

function PermissionConsumer({ permission }: { permission: string }) {
  const { hasPermission } = useClient()
  return <div data-testid="perm">{String(hasPermission(permission))}</div>
}

function renderInProvider(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ClientProvider>{ui}</ClientProvider>
    </MemoryRouter>
  )
}

// ── 1. Unauthenticated state renders without errors ───────────────────────────
it('provides null auth state when no token in localStorage', async () => {
  renderInProvider(<TestConsumer />)
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())

  expect(screen.getByTestId('auth').textContent).toBe('false')
  expect(screen.getByTestId('token').textContent).toBe('null')
  expect(screen.getByTestId('user-email').textContent).toBe('null')
})

// ── 2. Login sets user, token, and client ─────────────────────────────────────
it('sets user, token, and client after successful login', async () => {
  function LoginButton() {
    const { login, user, token, client } = useClient()
    return (
      <>
        <button onClick={() => login('owner@example.com', 'pass')}>login</button>
        <div data-testid="token">{token ?? 'null'}</div>
        <div data-testid="email">{user?.email ?? 'null'}</div>
        <div data-testid="client">{client?.client_name ?? 'null'}</div>
      </>
    )
  }

  renderInProvider(<LoginButton />)

  await act(async () => {
    screen.getByRole('button', { name: 'login' }).click()
  })

  await waitFor(() => {
    expect(screen.getByTestId('token').textContent).toBe('mock-jwt-token')
    expect(screen.getByTestId('email').textContent).toBe('owner@example.com')
    expect(screen.getByTestId('client').textContent).toBe('Test Restaurant')
  })
})

// ── 3. Logout clears all auth state ───────────────────────────────────────────
it('logout sets user, token, client to null', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({ user_id: 'u1', email: 'a@b.com', role: 'manager', permissions: [] }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Shop' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  function LogoutButton() {
    const { logout, token } = useClient()
    return (
      <>
        <button onClick={logout}>logout</button>
        <div data-testid="token">{token ?? 'null'}</div>
      </>
    )
  }

  renderInProvider(<LogoutButton />)
  await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('mock-jwt-token'))

  await act(async () => {
    screen.getByRole('button', { name: 'logout' }).click()
  })

  await waitFor(() => {
    expect(screen.getByTestId('token').textContent).toBe('null')
  })
})

// ── 4. Logout clears localStorage ─────────────────────────────────────────────
it('logout removes token, user, client from localStorage', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({ user_id: 'u1', email: 'a@b.com', role: 'manager', permissions: [] }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Shop' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  function LogoutButton() {
    const { logout } = useClient()
    return <button onClick={logout}>logout</button>
  }

  renderInProvider(<LogoutButton />)

  await act(async () => {
    screen.getByRole('button', { name: 'logout' }).click()
  })

  await waitFor(() => {
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('client')).toBeNull()
  })
})

// ── 5. hasPermission returns true for held permission ─────────────────────────
it('hasPermission returns true when user has the permission', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({
    user_id: 'u1', email: 'a@b.com', role: 'manager',
    permissions: ['gst_billing'], is_super_admin: false,
  }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Shop' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  renderInProvider(<PermissionConsumer permission="gst_billing" />)

  await waitFor(() => {
    expect(screen.getByTestId('perm').textContent).toBe('true')
  })
})

// ── 6. hasPermission returns false for missing permission ─────────────────────
it('hasPermission returns false when user lacks the permission', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({
    user_id: 'u1', email: 'a@b.com', role: 'staff',
    permissions: ['gst_billing'], is_super_admin: false,
  }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Shop' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  renderInProvider(<PermissionConsumer permission="stock_entry" />)

  await waitFor(() => {
    expect(screen.getByTestId('perm').textContent).toBe('false')
  })
})

// ── 7. is_super_admin bypasses all permission checks ─────────────────────────
// Note: actual code checks user.is_super_admin, NOT user.role === 'admin'
it('hasPermission returns true for any permission when is_super_admin is true', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({
    user_id: 'u1', email: 'admin@b.com', role: 'staff',
    permissions: [], // no explicit permissions
    is_super_admin: true,
  }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Shop' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  renderInProvider(<PermissionConsumer permission="anything_at_all" />)

  await waitFor(() => {
    expect(screen.getByTestId('perm').textContent).toBe('true')
  })
})

// ── 8. Context provides user data to children ─────────────────────────────────
it('provides correct user name and email to consuming components', async () => {
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify({
    user_id: 'u1', email: 'owner@example.com', role: 'manager',
    permissions: ['gst_billing'], full_name: 'Test User',
  }))
  localStorage.setItem('client', JSON.stringify({ client_id: 'c1', client_name: 'Test Restaurant' }))
  localStorage.setItem('last_refresh', String(Date.now()))

  renderInProvider(<TestConsumer />)

  await waitFor(() => {
    expect(screen.getByTestId('user-email').textContent).toBe('owner@example.com')
    expect(screen.getByTestId('user-name').textContent).toBe('Test User')
    expect(screen.getByTestId('client-name').textContent).toBe('Test Restaurant')
  })
})
