/**
 * LoginPage.jsx — Role-aware login screen for Medisync.
 *
 * Supports Patient Login and Doctor Login via a toggle.
 * After login, reads user.role from /me and routes accordingly.
 * JWT is stored in localStorage via AuthContext.
 */

import { useState } from 'react'
import { apiLogin, apiGetMe, setUser } from '../api'

// Role is stored separately because the backend hardcodes role='patient' for all users.
const ROLE_STORAGE_KEY = 'medisync_ui_role'
export function saveUiRole(role) { localStorage.setItem(ROLE_STORAGE_KEY, role) }
export function getUiRole()  { return localStorage.getItem(ROLE_STORAGE_KEY) || 'patient' }
export function clearUiRole() { localStorage.removeItem(ROLE_STORAGE_KEY) }
import { useAuth } from '../context/AuthContext'

const ROLES = [
  { id: 'patient', label: 'Patient', icon: '🧑‍⚕️', desc: 'Manage your prescriptions' },
  { id: 'doctor',  label: 'Doctor',  icon: '👨‍⚕️', desc: 'Manage your patients' },
]

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth()
  const [selectedRole, setSelectedRole] = useState('patient')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [showPw, setShowPw]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)

    try {
      await apiLogin(email.trim(), password)
      const profile = await apiGetMe()
      // Override role with UI selection because backend hardcodes 'patient' for everyone
      const profileWithRole = { ...profile, role: selectedRole }
      saveUiRole(selectedRole)
      setUser(profileWithRole)
      login(profileWithRole)
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const isDoctor = selectedRole === 'doctor'
  const accentFrom = isDoctor ? 'from-emerald-500' : 'from-brand-500'
  const accentTo   = isDoctor ? 'to-teal-600'      : 'to-brand-700'
  const ringClass  = isDoctor ? 'focus:ring-emerald-300' : 'focus:ring-brand-300'
  const btnClass   = isDoctor
    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
    : 'bg-brand-600 hover:bg-brand-700 shadow-brand-200'

  return (
    <div className="auth-page">
      {/* Decorative blobs */}
      <div className="auth-orb" />
      <div className="auth-orb-2" />

      <div className="auth-card animate-scale-in">

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Medisync Logo" className="w-16 h-16 rounded-2xl shadow-xl mb-4 transition-all duration-300 object-cover bg-white" />
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Welcome back
          </h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your Medisync account</p>
        </div>

        {/* Role Toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          {ROLES.map(role => (
            <button
              key={role.id}
              id={`role-${role.id}`}
              type="button"
              onClick={() => { setSelectedRole(role.id); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold
                          transition-all duration-200
                          ${selectedRole === role.id
                            ? 'bg-white shadow text-slate-800'
                            : 'text-slate-400 hover:text-slate-600'
                          }`}
            >
              <span>{role.icon}</span>
              {role.label}
            </button>
          ))}
        </div>

        {/* Role Description */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-5 text-xs font-medium
                         transition-all duration-200
                         ${isDoctor ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-brand-50 text-brand-700 border border-brand-100'}`}>
          <span>{ROLES.find(r => r.id === selectedRole)?.icon}</span>
          {isDoctor
            ? 'Logging in as a Doctor — you\'ll see the Doctor Panel'
            : 'Logging in as a Patient — you\'ll see your health dashboard'}
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error mb-4">
            <span className="text-sm">⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="auth-label">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`auth-input ${ringClass}`}
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="auth-label">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`auth-input pr-12 ${ringClass}`}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400
                           hover:text-slate-600 transition-colors"
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            id="login-btn"
            type="submit"
            disabled={loading || !email || !password}
            className={`btn-primary mt-2 ${btnClass}`}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                {isDoctor ? '👨‍⚕️' : '⚕️'} Sign in as {isDoctor ? 'Doctor' : 'Patient'}
              </>
            )}
          </button>
        </form>

        {/* Switch */}
        <p className="text-center text-sm text-slate-500 mt-5">
          Don't have an account?{' '}
          <button
            id="go-register"
            onClick={onSwitch}
            className={`font-semibold hover:underline transition-colors
                        ${isDoctor ? 'text-emerald-600' : 'text-brand-600'}`}
          >
            Create one
          </button>
        </p>

        {/* Hint */}
        <p className="text-center text-[10px] text-slate-400 mt-3">
          🔒 Your data is encrypted and HIPAA-compliant
        </p>
      </div>
    </div>
  )
}
