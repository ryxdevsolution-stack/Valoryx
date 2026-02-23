
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { setLogoutHandler } from '@/lib/api'

interface User {
  user_id: string
  email: string
  role: string
  is_super_admin?: boolean
  permissions?: string[]
  full_name?: string
  phone?: string
  department?: string
}

interface Client {
  client_id: string
  client_name: string
  logo_url?: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  subscription_status?: string
  plan_id?: string
  trial_end_date?: string
  trial_days_remaining?: number
}

interface ClientContextType {
  user: User | null
  client: Client | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setClientData: (user: User, client: Client, token: string) => void
  hasPermission: (permission: string) => boolean
  isSuperAdmin: () => boolean
  refreshClientData: () => Promise<void>
  refreshUserData: () => Promise<void>
  updateSubscriptionStatus: (status: string, endDate?: string, planId?: string) => void
}

const ClientContext = createContext<ClientContextType | undefined>(undefined)

export function ClientProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Check for stored token on mount
    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token')
        const storedUser = localStorage.getItem('user')
        const storedClient = localStorage.getItem('client')

        if (storedToken && storedUser && storedClient) {
          const userData = JSON.parse(storedUser)
          const clientData = JSON.parse(storedClient)

          setToken(storedToken)
          setUser(userData)
          setClient(clientData)
          setIsAuthenticated(true)
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`

          // Background refresh: sync subscription status from backend
          // so users don't need to re-login to see updated status
          api.get(`/clients/${clientData.client_id}`).then(res => {
            if (res.data?.client) {
              const fresh = res.data.client
              const updated = {
                ...clientData,
                subscription_status: fresh.subscription_status,
                plan_id: fresh.plan_id,
                trial_end_date: fresh.trial_end_date,
                trial_days_remaining: fresh.trial_days_remaining,
              }
              setClient(updated)
              localStorage.setItem('client', JSON.stringify(updated))
            }
          }).catch(() => { /* silent — non-blocking */ })
        }
      } catch (error) {
        // Clear invalid data
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('client')
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [navigate])

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const { token, user, client_id, client_name, client_logo, client_address, client_phone, client_email, client_gstin } = response.data

      const userData: User = {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        is_super_admin: user.is_super_admin,
        permissions: user.permissions,
        full_name: user.full_name,
        phone: user.phone,
        department: user.department
      }

      const clientData: Client = {
        client_id,
        client_name,
        logo_url: client_logo,
        address: client_address,
        phone: client_phone,
        email: client_email,
        gstin: client_gstin,
        subscription_status: response.data.subscription_status || response.data.trial?.status,
        plan_id: response.data.plan_id,
        trial_end_date: response.data.trial?.end_date,
        trial_days_remaining: response.data.trial?.days_remaining,
      }

      // Store in state
      setToken(token)
      setUser(userData)
      setClient(clientData)
      setIsAuthenticated(true)

      // Store in localStorage
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('client', JSON.stringify(clientData))

      // Set axios default header
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      // Redirect to create bill
      navigate('/billing/create')
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed')
    }
  }

  const logout = useCallback(() => {
    // Clear state
    setToken(null)
    setUser(null)
    setClient(null)
    setIsAuthenticated(false)

    // Clear localStorage
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('client')

    // Clear axios header
    delete api.defaults.headers.common['Authorization']

    // Redirect to login
    navigate('/auth/login')
  }, [navigate])

  // Register logout handler with api interceptor for token expiration
  useEffect(() => {
    setLogoutHandler(logout)
  }, [logout])

  const setClientData = (userData: User, clientData: Client, tokenData: string) => {
    setUser(userData)
    setClient(clientData)
    setToken(tokenData)
    setIsAuthenticated(true)

    localStorage.setItem('token', tokenData)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('client', JSON.stringify(clientData))

    api.defaults.headers.common['Authorization'] = `Bearer ${tokenData}`
  }

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.is_super_admin) return true
    return user.permissions?.includes(permission) || false
  }

  const isSuperAdmin = (): boolean => {
    return user?.is_super_admin || false
  }

  // Refresh client data from API (can be called manually if needed)
  const refreshClientData = useCallback(async () => {
    if (!token || !client?.client_id) return

    try {
      const response = await api.get(`/clients/${client.client_id}`)
      if (response.data?.client) {
        const freshClient = response.data.client
        const updatedClient: Client = {
          client_id: freshClient.client_id,
          client_name: freshClient.client_name,
          logo_url: freshClient.logo_url,
          address: freshClient.address,
          phone: freshClient.phone,
          email: freshClient.email,
          gstin: freshClient.gst_number,
          subscription_status: freshClient.subscription_status,
          plan_id: freshClient.plan_id,
          trial_end_date: freshClient.trial_end_date,
          trial_days_remaining: freshClient.trial_days_remaining,
        }
        setClient(updatedClient)
        localStorage.setItem('client', JSON.stringify(updatedClient))
      }
    } catch (error) {
      console.error('Failed to refresh client data:', error)
    }
  }, [token, client?.client_id])

  // Update subscription status locally (after payment verification)
  const updateSubscriptionStatus = useCallback((status: string, endDate?: string, planId?: string) => {
    setClient(prev => {
      if (!prev) return prev
      const updated = { ...prev, subscription_status: status, trial_days_remaining: undefined, ...(planId && { plan_id: planId }) }
      localStorage.setItem('client', JSON.stringify(updated))
      return updated
    })
  }, [])

  // Refresh user profile data from API
  const refreshUserData = useCallback(async () => {
    if (!token) return

    try {
      const response = await api.get('/profile')
      if (response.data) {
        const profile = response.data
        const updatedUser: User = {
          user_id: profile.user_id,
          email: profile.email,
          role: profile.role,
          is_super_admin: profile.is_super_admin,
          permissions: profile.permissions,
          full_name: profile.full_name,
          phone: profile.phone,
          department: profile.department
        }
        setUser(updatedUser)
        localStorage.setItem('user', JSON.stringify(updatedUser))
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error)
    }
  }, [token])

  return (
    <ClientContext.Provider
      value={{
        user,
        client,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
        setClientData,
        hasPermission,
        isSuperAdmin,
        refreshClientData,
        refreshUserData,
        updateSubscriptionStatus,
      }}
    >
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const context = useContext(ClientContext)
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider')
  }
  return context
}
