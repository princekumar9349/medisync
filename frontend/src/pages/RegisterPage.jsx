/**
 * RegisterPage.jsx — Registration screen for Medisync.
 * Calls POST /auth/register, then auto-logs in via POST /auth/login.
 */

import { useState } from 'react'
import { apiRegister, apiLogin, apiGetMe, setUser } from '../api'
import { useAuth } from '../context/AuthContext'
import { saveUiRole } from './LoginPage'

const ROLES = [
  { id: 'patient', label: 'Patient', icon: '🧑‍⚕️' },
  { id: 'doctor',  label: 'Doctor',  icon: '👨‍⚕️' },
]

export default function RegisterPage({ onSwitch }) {
  const { login } = useAuth()
  const [role, setRole]         = useState('patient')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [showPw, setShowPw]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      await apiRegister(name.trim(), email.trim(), password, role)
      // Auto-login after registration
      await apiLogin(email.trim(), password)
      const profile = await apiGetMe()
      
      const profileWithRole = { ...profile, role: role }
      saveUiRole(role)
      setUser(profileWithRole)
      login(profileWithRole)
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const strengthLabel = ['', 'Weak', 'Good', 'Strong']
  const strengthColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-green-400']

  return (
    <div className="auth-page">
      <div className="auth-orb" />

      <div className="auth-card animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-200 mb-4">
            <span className="text-3xl">⚕️</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Create account</h1>
          <p className="text-slate-400 text-sm mt-1">Start managing your medications smartly</p>
        </div>

        {/* Role Toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          {ROLES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold
                          transition-all duration-200
                          ${role === r.id
                            ? 'bg-white shadow text-slate-800'
                            : 'text-slate-400 hover:text-slate-600'
                          }`}
            >
              <span>{r.icon}</span>
              {r.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error mb-4">
            <span className="text-sm">⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="auth-label">Full name</label>
            <input
              id="reg-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Arjun Sharma"
              className="auth-input"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="auth-label">Email address</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="auth-label">Password</label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="auth-input pr-12"
                required
                minLength={6}
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor[pwStrength]}`}
                    style={{ width: `${(pwStrength / 3) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-400">{strengthLabel[pwStrength]}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="auth-label">Confirm password</label>
            <input
              id="reg-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`auth-input ${confirm && confirm !== password ? 'border-red-300 focus:ring-red-200' : ''}`}
              required
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
            )}
          </div>

          {/* Submit */}
          <button
            id="register-btn"
            type="submit"
            disabled={loading || !name || !email || !password || password !== confirm}
            className="btn-primary mt-2"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Creating account…
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Switch */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <button id="go-login" onClick={onSwitch} className="text-brand-600 font-semibold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
