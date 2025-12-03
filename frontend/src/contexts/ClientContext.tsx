'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
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
}

const ClientContext = createContext<ClientContextType | undefined>(undefined)

export function ClientProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

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

          // Check if client data is missing address (old localStorage data)
          // If so, clear localStorage and force re-login to get fresh data
          if (!clientData.address && clientData.client_id) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            localStorage.removeItem('client')
            setToken(null)
            setUser(null)
            setClient(null)
            setIsAuthenticated(false)
            delete api.defaults.headers.common['Authorization']
            // Redirect to login
            router.push('/auth/login')
            return
          }
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
  }, [router])

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
      router.push('/billing/create')
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
    router.push('/auth/login')
  }, [router])

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
      const response = await api.get(`/client/${client.client_id}`)
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
        }
        setClient(updatedClient)
        localStorage.setItem('client', JSON.stringify(updatedClient))
      }
    } catch (error) {
      console.error('Failed to refresh client data:', error)
    }
  }, [token, client?.client_id])

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
