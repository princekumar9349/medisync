/**
 * LoginPage.jsx — MediSync Premium Healthcare Login
 * Exactly matches the mobile app design:
 * - Dark navy background with floating orbs
 * - Animated ECG heartbeat line
 * - Logo with pulse rings
 * - Glass card with 3-role selector (Patient / Doctor)
 * - Role-aware accent color throughout
 */

import { useState, useEffect, useRef } from 'react'
import { apiLogin, apiGetMe, setUser } from '../api'
import { useAuth } from '../context/AuthContext'

const ROLE_STORAGE_KEY = 'medisync_ui_role'
export function saveUiRole(role) { localStorage.setItem(ROLE_STORAGE_KEY, role) }
export function getUiRole()  { return localStorage.getItem(ROLE_STORAGE_KEY) || 'patient' }
export function clearUiRole() { localStorage.removeItem(ROLE_STORAGE_KEY) }

const ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    iconSvg: 'heart',
    emoji: '❤️',
    accent: '#0D9488',
    accentLight: 'rgba(13,148,136,0.15)',
    accentBorder: 'rgba(13,148,136,0.5)',
    gradFrom: '#0D9488',
    gradTo: '#0F766E',
    desc: 'Track your medications',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    iconSvg: 'medical',
    emoji: '🩺',
    accent: '#6366F1',
    accentLight: 'rgba(99,102,241,0.15)',
    accentBorder: 'rgba(99,102,241,0.5)',
    gradFrom: '#6366F1',
    gradTo: '#4338CA',
    desc: 'Monitor your patients',
  },
]

// ── Animated ECG heartbeat line ───────────────────────────────────────────────
function HeartbeatLine({ color }) {
  return (
    <div style={{ height: 20, overflow: 'hidden', opacity: 0.4, margin: '10px 0', position: 'relative' }}>
      <svg width="100%" height="20" viewBox="0 0 400 20" preserveAspectRatio="none">
        <polyline
          points="0,10 60,10 80,2 90,18 100,2 110,18 120,10 400,10"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="ecg-scanner" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
    </div>
  )
}

// ── Floating orb ──────────────────────────────────────────────────────────────
function FloatingOrb({ size, color, style, delay }) {
  return (
    <div
      className="floating-orb"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`,
        animationDelay: `${delay}s`,
        ...style,
      }}
    />
  )
}

// ── Logo with pulse rings ─────────────────────────────────────────────────────
function LogoWithRings({ accent }) {
  return (
    <div className="logo-ring-wrap">
      <div className="pulse-ring" style={{ borderColor: accent + '60', animationDelay: '0s' }} />
      <div className="pulse-ring" style={{ borderColor: accent + '40', animationDelay: '0.9s' }} />
      <div className="logo-inner-wrap" style={{ borderColor: accent + '60' }}>
        <img src="/logo.png" alt="MediSync" className="logo-img" />
      </div>
    </div>
  )
}

// ── Role Tab ──────────────────────────────────────────────────────────────────
function RoleTab({ role, isActive, onClick }) {
  return (
    <button
      type="button"
      id={`role-${role.id}`}
      onClick={onClick}
      className="role-tab-btn"
      style={isActive ? {
        background: role.accentLight,
        borderColor: role.accentBorder,
        color: role.accent,
        boxShadow: `0 0 20px ${role.accent}20`,
      } : {}}
    >
      <span className="role-tab-icon" style={isActive ? { background: role.accent } : {}}>
        {role.emoji}
      </span>
      <div className="role-tab-text">
        <div className="role-tab-label" style={isActive ? { color: role.accent } : {}}>{role.label}</div>
        <div className="role-tab-desc">{role.desc}</div>
      </div>
    </button>
  )
}

// ── Premium Input ─────────────────────────────────────────────────────────────
function PremiumInput({ icon, type, placeholder, value, onChange, accent, children }) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      className="premium-input-wrap"
      style={{ borderColor: focused ? accent : 'rgba(255,255,255,0.1)' }}
    >
      <div className="premium-input-icon" style={{ background: focused ? accent + '20' : 'rgba(255,255,255,0.05)' }}>
        {icon}
      </div>
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="premium-input-field"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={type === 'email' ? 'email' : 'current-password'}
        required
      />
      {children}
    </div>
  )
}

// ── Main Login Page ───────────────────────────────────────────────────────────
export default function LoginPage({ onSwitch }) {
  const { login } = useAuth()
  const [selectedRole, setSelectedRole] = useState(0)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [showPw, setShowPw]       = useState(false)

  const role = ROLES[selectedRole]

  function selectRole(idx) {
    setSelectedRole(idx)
    setError(null)
    setEmail('')
    setPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)
    try {
      await apiLogin(email.trim(), password)
      const profile = await apiGetMe()
      const profileWithRole = { ...profile, role: role.id }
      saveUiRole(role.id)
      setUser(profileWithRole)
      login(profileWithRole)
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ms-login-page">
      {/* Dark gradient background */}
      <div className="ms-login-bg" />

      {/* Floating orbs */}
      <FloatingOrb size={320} color={role.accent} delay={0}
        style={{ position: 'absolute', top: -80, left: -100 }} />
      <FloatingOrb size={240} color={role.accent} delay={0.6}
        style={{ position: 'absolute', top: 160, right: -80 }} />
      <FloatingOrb size={180} color="#6366F1" delay={1.2}
        style={{ position: 'absolute', bottom: 60, left: -40 }} />

      {/* ── Hero Section (top) ── */}
      <div className="ms-hero">
        <LogoWithRings accent={role.accent} />
        <h1 className="ms-brand">MEDISYNC</h1>

        <HeartbeatLine color={role.accent} />

        {/* Trust badges */}
        <div className="ms-trust-row">
          {[
            { icon: '🛡️', text: 'HIPAA Safe' },
            { icon: '🔒', text: 'Encrypted' },
            { icon: '🤖', text: '' },
          ].map(b => (
            <div key={b.text} className="ms-trust-badge" style={{ color: role.accent + 'CC' }}>
              <span>{b.icon}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Glass Card ── */}
      <div className="ms-glass-card animate-scale-in">
        {/* Accent top line */}
        <div className="ms-card-accent-line" style={{ background: role.accent }} />

        <h2 className="ms-card-title">Sign In</h2>
        <p className="ms-card-sub">Choose your role to continue</p>

        {/* Role Tabs */}
        <div className="ms-role-tabs">
          {ROLES.map((r, i) => (
            <RoleTab key={r.id} role={r} isActive={i === selectedRole} onClick={() => selectRole(i)} />
          ))}
        </div>

        {/* Role descriptor pill */}
        <div className="ms-role-pill" style={{ background: role.accentLight }}>
          <span>{role.emoji}</span>
          <span style={{ color: role.accent, fontWeight: 700, fontSize: 13 }}>{role.desc}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="ms-error-box">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <PremiumInput
            icon="✉️"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            accent={role.accent}
          />

          <PremiumInput
            icon="🔒"
            type={showPw ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            accent={role.accent}
          >
            <button type="button" className="ms-eye-btn" onClick={() => setShowPw(p => !p)}>
              {showPw ? '🙈' : '👁️'}
            </button>
          </PremiumInput>

          {/* Submit */}
          <button
            id="login-btn"
            type="submit"
            disabled={loading || !email || !password}
            className="ms-submit-btn"
            style={{
              background: `linear-gradient(90deg, ${role.gradFrom}, ${role.gradTo})`,
              boxShadow: `0 4px 24px ${role.accent}50`,
              opacity: (loading || !email || !password) ? 0.5 : 1,
            }}
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Signing in…</>
            ) : (
              <>{role.emoji} Sign in as {role.label} <span style={{ marginLeft: 'auto' }}>→</span></>
            )}
          </button>
        </form>

        {/* Register link */}
        <p className="ms-register-row">
          New to MediSync?{' '}
          <button id="go-register" type="button" onClick={onSwitch} className="ms-register-link"
            style={{ color: role.accent }}>
            Create Account →
          </button>
        </p>
      </div>
    </div>
  )
}
