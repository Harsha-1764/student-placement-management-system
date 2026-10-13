import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const response = await api.getCurrentUser()
        if (active) setUser(response.user)
      } catch (error) {
        if (active && error.status !== 401) setAuthError(error.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    restore()
    const expire = () => { if (active) setUser(null) }
    window.addEventListener('auth:expired', expire)
    setUnauthorizedHandler(() => window.dispatchEvent(new Event('auth:expired')))
    return () => { active = false; window.removeEventListener('auth:expired', expire); setUnauthorizedHandler(null) }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    authError,
    async login(credentials) {
      const response = await api.login(credentials)
      setUser(response.user)
      setAuthError('')
      return response.user
    },
    async logout() {
      try { await api.logout() } finally { setUser(null) }
    },
  }), [user, loading, authError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
