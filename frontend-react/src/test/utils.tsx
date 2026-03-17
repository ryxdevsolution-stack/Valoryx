import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { DataProvider } from '@/contexts/DataContext'
import { ClientProvider } from '@/contexts/ClientContext'

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <LoadingProvider>
        <ThemeProvider>
          <DataProvider>
            <ClientProvider>
              {children}
            </ClientProvider>
          </DataProvider>
        </ThemeProvider>
      </LoadingProvider>
    </MemoryRouter>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

/**
 * Pre-populate localStorage to simulate a logged-in session.
 * Sets last_refresh to now to prevent ClientProvider from triggering
 * background /profile and /clients/:id refreshes.
 */
export function setAuthState(overrides?: {
  role?: string
  permissions?: string[]
  is_super_admin?: boolean
  user_id?: string
}) {
  const user = {
    user_id: overrides?.user_id ?? 'u1',
    email: 'owner@example.com',
    role: overrides?.role ?? 'manager',
    permissions: overrides?.permissions ?? ['gst_billing', 'non_gst_billing'],
    is_super_admin: overrides?.is_super_admin ?? false,
    full_name: 'Test User',
  }
  const client = { client_id: 'c1', client_name: 'Test Restaurant' }
  localStorage.setItem('token', 'mock-jwt-token')
  localStorage.setItem('user', JSON.stringify(user))
  localStorage.setItem('client', JSON.stringify(client))
  localStorage.setItem('last_refresh', String(Date.now()))
}
