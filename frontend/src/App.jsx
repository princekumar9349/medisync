/**
 * App.jsx — Medisync main application (v3.0)
 *
 * Auth gate → shows Login/Register if not logged in.
 * Role-based routing:
 *   - user.role === 'doctor'  → DoctorDashboard
 *   - user.role === 'patient' → MainApp (6-tab patient shell)
 *
 * Patient shell tabs:
 *   Scan | Results | Pillbox | Chat | History | Profile
 */

import { useState, useCallback } from 'react'
import { AuthProvider, useAuth }   from './context/AuthContext'
import LoginPage                   from './pages/LoginPage'
import RegisterPage                from './pages/RegisterPage'
import DoctorDashboard             from './pages/DoctorDashboard'
import UploadCard                  from './components/UploadCard'
import ResultCard                  from './components/ResultCard'
import ControlBar                  from './components/ControlBar'
import ChatBox                     from './components/ChatBox'
import Dashboard                   from './components/Dashboard'
import SmartPillbox                from './components/SmartPillbox'
import ReminderModal               from './components/ReminderModal'
import { apiScan }                 from './api'

const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN' }

// ─── Tab definitions (patient shell) ─────────────────────────────────────────
const TABS = [
  { id: 'scan',    label: 'Scan',    icon: ScanIcon    },
  { id: 'results', label: 'Results', icon: ResultsIcon },
  { id: 'pillbox', label: 'Pillbox', icon: PillboxIcon },
  { id: 'chat',    label: 'Chat',    icon: ChatIcon    },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
]

// ─── Root with Auth Provider ──────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────
function AppShell() {
  const { isLoggedIn, user, loading } = useAuth()
  const [authMode, setAuthMode] = useState('login')   // 'login' | 'register'

  // Full-screen loader while validating stored token
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700
                          flex items-center justify-center shadow-xl animate-pulse">
            <span className="text-2xl">⚕️</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <p className="text-xs text-slate-400 font-medium">Loading Medisync…</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return authMode === 'login'
      ? <LoginPage    onSwitch={() => setAuthMode('register')} />
      : <RegisterPage onSwitch={() => setAuthMode('login')} />
  }

  // Role-based routing
  if (user?.role === 'doctor') {
    return <DoctorDashboard />
  }

  return <MainApp />
}

// ─── Main App (authenticated patient) ─────────────────────────────────────────
function MainApp() {
  const { user, logout } = useAuth()

  const [voiceOn,         setVoiceOn]         = useState(false)
  const [language,        setLanguage]        = useState('EN')
  const [activeTab,       setActiveTab]       = useState('scan')
  const [showReminder,    setShowReminder]    = useState(false)
  const [reminderMeds,    setReminderMeds]    = useState([])

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)

  // ── Voice ───────────────────────────────────────────────────────────────
  function speak(text) {
    if (!voiceOn || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = LANG_MAP[language] || 'en-IN'
    utt.rate = 0.95
    window.speechSynthesis.speak(utt)
  }

  function buildSpeakText(res) {
    if (!res) return ''
    const meds = (res.medicines || []).map(m => `${m.name} ${m.dosage}`).join(', ')
    if (language === 'HI') {
      return `आपकी दवाएं हैं: ${meds || 'कोई नहीं'}। स्थिति: ${res.possible_condition || 'अज्ञात'}।`
    }
    return `Your medicines are: ${meds || 'none found'}. Possible condition: ${res.possible_condition || 'unknown'}.`
  }

  // ── Scan API ────────────────────────────────────────────────────────────
  const handleScan = useCallback(async (file) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await apiScan(file)
      setResult(data)
      setActiveTab('results')
      setTimeout(() => speak(buildSpeakText(data)), 600)
    } catch (err) {
      setError(err.message || 'Failed to scan prescription. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [voiceOn, language])

  function toggleVoice() { setVoiceOn(v => !v) }
  function toggleLang()  { setLanguage(l => l === 'EN' ? 'HI' : 'EN') }

  function triggerReminder(meds = []) {
    setReminderMeds(meds)
    setShowReminder(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100
                    flex flex-col max-w-lg mx-auto">

      {/* ── Top App Bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800
                          flex items-center justify-center shadow-md shadow-brand-200">
            <span className="text-lg">⚕️</span>
          </div>
          <div className="flex-1">
            <h1 className="font-extrabold text-brand-700 text-lg leading-none tracking-tight">Medisync</h1>
            <p className="text-slate-400 text-[11px] font-medium tracking-wide">Smart Medication Assistant</p>
          </div>

          {/* Reminder Bell */}
          <button
            id="reminder-bell"
            onClick={() => triggerReminder(result?.medicines || [])}
            title="Set Reminder"
            className="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-100 flex items-center
                       justify-center text-amber-500 transition-colors relative"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

          {/* Status pill */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border
              transition-colors duration-300
              ${loading
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : result
                  ? 'bg-green-50 border-green-200 text-green-600'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : result ? 'bg-green-400' : 'bg-slate-300'}`} />
            {loading ? 'Scanning' : result ? 'Ready' : 'Idle'}
          </div>
        </div>
      </header>

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <nav className="sticky top-[57px] z-20 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="flex overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 min-w-[60px] flex flex-col items-center gap-0.5 py-2
                          text-[10px] font-semibold transition-all duration-200 whitespace-nowrap
                          ${activeTab === tab.id
                            ? 'text-brand-600 border-b-2 border-brand-600'
                            : 'text-slate-400 border-b-2 border-transparent hover:text-slate-600'
                          }`}
            >
              <tab.icon active={activeTab === tab.id} />
              {tab.label}
              {tab.id === 'results' && result && (
                <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-4 space-y-4 pb-6">

        {/* Error Banner */}
        {error && (
          <div id="error-banner" className="flex items-start gap-3 bg-red-50 border border-red-200
                                            rounded-xl px-4 py-3 animate-fade-in">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-red-700 text-sm font-semibold">Error</p>
              <p className="text-red-500 text-xs mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Controls Bar — visible on Scan/Results */}
        {(activeTab === 'scan' || activeTab === 'results') && (
          <ControlBar
            voiceOn={voiceOn}
            language={language}
            onVoiceToggle={toggleVoice}
            onLangToggle={toggleLang}
          />
        )}

        {/* ── TAB: Scan ───────────────────────────────────────────────── */}
        {activeTab === 'scan' && (
          <UploadCard onScan={handleScan} loading={loading} />
        )}

        {/* ── TAB: Results ────────────────────────────────────────────── */}
        {activeTab === 'results' && (
          <>
            {result
              ? <ResultCard result={result} />
              : <EmptyResults onGoScan={() => setActiveTab('scan')} />
            }
          </>
        )}

        {/* ── TAB: Pillbox ────────────────────────────────────────────── */}
        {activeTab === 'pillbox' && (
          <SmartPillbox />
        )}

        {/* ── TAB: Chat ───────────────────────────────────────────────── */}
        {activeTab === 'chat' && (
          <ChatBox
            language={language}
            voiceOn={voiceOn}
            currentMedicines={result?.medicines || []}
          />
        )}

        {/* ── TAB: History ────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <Dashboard />
        )}

        {/* ── TAB: Profile ────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <ProfilePanel
            user={user}
            onLogout={logout}
            voiceOn={voiceOn}
            onVoiceToggle={toggleVoice}
            language={language}
            onLangToggle={toggleLang}
            onReminder={() => triggerReminder(result?.medicines || [])}
          />
        )}

      </main>

      <div className="h-4 safe-bottom" />

      {/* ── Reminder Modal ───────────────────────────────────────────────── */}
      {showReminder && (
        <ReminderModal
          medicines={reminderMeds}
          onClose={() => setShowReminder(false)}
          onMarkTaken={(med) => {
            // Handled within modal — just close after
          }}
        />
      )}
    </div>
  )
}

// ─── Profile Panel ────────────────────────────────────────────────────────────
function ProfilePanel({ user, onLogout, voiceOn, onVoiceToggle, language, onLangToggle, onReminder }) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* User Card */}
      <div className="card border border-slate-100 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700
                        flex items-center justify-center text-2xl shadow-lg shadow-brand-200 flex-shrink-0">
          {user?.name?.[0]?.toUpperCase() || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-base truncate">{user?.name || 'User'}</p>
          <p className="text-sm text-slate-400 truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-xs font-semibold text-brand-600 bg-brand-50
                           px-2 py-0.5 rounded-full capitalize">
            {user?.role || 'patient'}
          </span>
        </div>
      </div>

      {/* Preferences */}
      <div className="card border border-slate-100 space-y-1">
        <p className="section-title">Preferences</p>
        <ToggleRow
          label="Voice Output"
          description="Speak scan results and AI responses"
          icon="🔊"
          enabled={voiceOn}
          onToggle={onVoiceToggle}
          id="voice-toggle-profile"
        />
        <div className="h-px bg-slate-100 my-1" />
        <ToggleRow
          label={`Language: ${language === 'EN' ? 'English' : 'हिंदी'}`}
          description="Toggle between English and Hindi"
          icon="🌐"
          enabled={language === 'HI'}
          onToggle={onLangToggle}
          id="lang-toggle-profile"
        />
      </div>

      {/* Quick Actions */}
      <div className="card border border-slate-100 space-y-2">
        <p className="section-title">Quick Actions</p>
        <button
          onClick={onReminder}
          className="w-full flex items-center gap-3 py-3 px-4 rounded-xl
                     bg-amber-50 hover:bg-amber-100 border border-amber-200
                     text-amber-700 font-semibold text-sm transition-all duration-200 active:scale-95"
        >
          <span className="text-lg">⏰</span>
          <div className="flex-1 text-left">
            <p className="font-semibold text-sm">Set Reminder</p>
            <p className="text-xs font-normal text-amber-600">Get notified for your next dose</p>
          </div>
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* App Info */}
      <div className="card border border-slate-100 space-y-2 text-sm text-slate-500">
        <p className="section-title">About</p>
        {[
          { label: 'Version',   value: '3.0.0' },
          { label: 'Backend',   value: 'Medisync API' },
          { label: 'AI Engine', value: 'Groq LLaMA 3.3' },
          { label: 'Database',  value: 'MongoDB Atlas' },
        ].map(row => (
          <div key={row.label} className="flex justify-between">
            <span>{row.label}</span>
            <span className="font-medium text-slate-700">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Logout */}
      <button
        id="logout-btn"
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                   border-2 border-red-200 text-red-500 font-semibold
                   hover:bg-red-50 active:scale-95 transition-all duration-200"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign Out
      </button>
    </div>
  )
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, description, icon, enabled, onToggle, id }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <button
        id={id}
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none
          ${enabled ? 'bg-brand-600' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm
                          transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

// ─── Empty Results ────────────────────────────────────────────────────────────
function EmptyResults({ onGoScan }) {
  return (
    <div className="card flex flex-col items-center justify-center py-14 gap-4 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
        <span className="text-4xl">📋</span>
      </div>
      <div>
        <p className="font-bold text-slate-700 text-base">No results yet</p>
        <p className="text-sm text-slate-400 mt-1 max-w-[220px] mx-auto">
          Upload and scan a prescription to see your medicine details here.
        </p>
      </div>
      <button onClick={onGoScan} className="btn-primary max-w-[200px]">
        <ScanIcon active={true} />
        Scan Now
      </button>
    </div>
  )
}

// ─── Tab Icons ────────────────────────────────────────────────────────────────
function ScanIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}
function ResultsIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
function PillboxIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  )
}
function ChatIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
function HistoryIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function ProfileIcon({ active }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}
