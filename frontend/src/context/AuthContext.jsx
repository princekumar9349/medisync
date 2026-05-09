/**
 * AuthContext.jsx — Global auth state for Medisync.
 *
 * Provides: { user, token, isLoggedIn, login, logout, loading }
 * Wrap the app root with <AuthProvider> to use useAuth() anywhere.
 *
 * NOTE: The backend hardcodes role='patient' for all users.
 * We persist the UI-selected role separately in localStorage
 * under 'medisync_ui_role' and merge it into the profile here.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { getToken, getUser, setUser, clearToken, apiGetMe } from '../api'

const ROLE_KEY = 'medisync_ui_role'

function getStoredRole() { return localStorage.getItem(ROLE_KEY) || null }
function clearStoredRole() { localStorage.removeItem(ROLE_KEY) }

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(getUser)
  const [loading, setLoading] = useState(true)

  // On mount, re-validate token against /me to ensure it's still valid
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    apiGetMe()
      .then(profile => {
        // Merge the UI-selected role (overrides the backend-hardcoded 'patient')
        const storedRole = getStoredRole()
        const merged = storedRole ? { ...profile, role: storedRole } : profile
        setUserState(merged)
        setUser(merged)
      })
      .catch(() => {
        // Token invalid/expired — clear everything
        clearToken()
        clearStoredRole()
        setUserState(null)
      })
      .finally(() => setLoading(false))
  }, [])

  function login(profile) {
    // profile already has the merged role from LoginPage
    setUserState(profile)
    setUser(profile)
  }

  function logout() {
    clearToken()
    clearStoredRole()
    setUserState(null)
  }

  const value = {
    user,
    isLoggedIn: !!user,
    loading,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
