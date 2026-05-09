/**
 * ChatBox.jsx — Dual-mode Chat (AI Assistant + Doctor Chat)
 *
 * Tab 1: AI Assistant  — instant Groq LLM responses, mic input, Hindi/English
 * Tab 2: Doctor Chat   — persistent message thread stored in MongoDB via API
 *
 * Smart switching:
 *   - AI detects serious keywords → appends "consult your doctor" advisory
 *     with a quick-jump button to the Doctor tab
 *   - Doctor tab shows unread badge when there are unread messages
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { apiChat, apiSendDoctorMessage, apiGetDoctorMessages } from '../api'

const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN' }

const AI_INITIAL = {
  role: 'ai',
  text: "Hello! 👋 I'm your Medisync assistant. Ask me anything about your prescription, medicines, or health.",
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function ChatBox({ language, voiceOn, currentMedicines = [] }) {
  const [activeTab, setActiveTab]   = useState('ai')   // 'ai' | 'doctor'
  const [doctorUnread, setDoctorUnread] = useState(0)

  return (
    <div className="flex flex-col h-[520px] rounded-2xl overflow-hidden shadow-lg border border-slate-100 animate-fade-in bg-white">

      {/* ── Dual Tab Header ─────────────────────────────────────────── */}
      <div className="flex bg-gradient-to-r from-brand-700 to-brand-600">
        <TabBtn
          id="tab-ai"
          label="AI Assistant"
          icon="🤖"
          active={activeTab === 'ai'}
          onClick={() => setActiveTab('ai')}
        />
        <TabBtn
          id="tab-doctor"
          label="Doctor"
          icon="👨‍⚕️"
          active={activeTab === 'doctor'}
          badge={doctorUnread}
          onClick={() => setActiveTab('doctor')}
        />
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────── */}
      {activeTab === 'ai' ? (
        <AIChat
          language={language}
          voiceOn={voiceOn}
          currentMedicines={currentMedicines}
          onSwitchToDoctor={() => setActiveTab('doctor')}
        />
      ) : (
        <DoctorChat
          language={language}
          onUnreadChange={setDoctorUnread}
        />
      )}
    </div>
  )
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ id, label, icon, active, badge, onClick }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-all duration-200
        ${active
          ? 'bg-white/15 text-white border-b-2 border-white'
          : 'text-brand-200 hover:text-white hover:bg-white/10 border-b-2 border-transparent'
        }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {!!badge && (
        <span className="absolute top-1.5 right-3 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AI CHAT
// ═════════════════════════════════════════════════════════════════════════════
function AIChat({ language, voiceOn, currentMedicines, onSwitchToDoctor }) {
  const [messages, setMessages]   = useState([AI_INITIAL])
  const [input, setInput]         = useState('')
  const [listening, setListening] = useState(false)
  const [isTyping, setIsTyping]   = useState(false)
  const bottomRef                 = useRef(null)
  const recognitionRef            = useRef(null)
  const inputRef                  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  function speak(text) {
    if (!voiceOn || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = LANG_MAP[language] || 'en-IN'
    utt.rate = 0.95
    window.speechSynthesis.speak(utt)
  }

  function addMessage(role, text, extra = {}) {
    setMessages(prev => [...prev, { role, text, ...extra }])
  }

  async function handleSend(textOverride) {
    const text = (textOverride ?? input).trim()
    if (!text || isTyping) return

    setInput('')
    addMessage('user', text)
    setIsTyping(true)

    try {
      const user_data = currentMedicines.length > 0 ? { medicines: currentMedicines } : {}
      const lang = language === 'HI' ? 'hi' : 'en'
      const res = await apiChat(text, lang, user_data)
      const reply = res.response || 'Sorry, I could not understand that.'

      // Check if backend flagged a serious advisory
      const hasDoctorHint = reply.includes('Doctor Chat') || reply.includes('Doctor Chat')
      addMessage('ai', reply, { showDoctorBtn: hasDoctorHint })
      speak(reply)
    } catch {
      addMessage('ai',
        language === 'HI'
          ? 'माफ़ करें, अभी जवाब देने में समस्या है।'
          : "Sorry, I'm having trouble connecting right now. Please try again."
      )
    } finally {
      setIsTyping(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Mic (click-to-toggle) ──────────────────────────────────────
  function toggleMic() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { addMessage('ai', '❌ Speech recognition is not supported in this browser. Use Chrome or Edge.'); return }

    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(() => {
        const r = new SR()
        recognitionRef.current = r
        r.lang = LANG_MAP[language] || 'en-IN'
        r.interimResults = false
        r.maxAlternatives = 1
        r.continuous = false
        r.onstart  = () => setListening(true)
        r.onend    = () => setListening(false)
        r.onerror  = (e) => {
          setListening(false)
          if (e.error === 'not-allowed')
            addMessage('ai', '🎤 Mic permission denied. Allow microphone access in browser settings.')
          else if (e.error === 'no-speech')
            addMessage('ai', '🔇 No speech detected. Try again.')
          else
            addMessage('ai', `⚠️ Mic error: ${e.error}`)
        }
        r.onresult = (e) => {
          const transcript = e.results[0][0].transcript
          handleSend(transcript)
        }
        r.start()
      })
      .catch(() => addMessage('ai', '🎤 Microphone access denied. Please allow mic permission.'))
  }

  return (
    <>
      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-50 border-b border-brand-100">
        <div className={`w-2 h-2 rounded-full ${isTyping ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
        <span className="text-xs text-brand-700 font-medium">
          {isTyping ? 'AI is typing…' : 'Online · Powered by Groq LLaMA'}
        </span>
        {listening && (
          <span className="ml-auto text-xs text-red-600 font-semibold animate-pulse">🔴 Listening…</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            {msg.role === 'ai' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center mt-1 text-xs">🤖</div>
            )}
            <div className="flex flex-col gap-1 max-w-[78%]">
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap
                ${msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-tr-sm'
                  : 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
              {/* Doctor-switch CTA when AI detects serious symptom */}
              {msg.showDoctorBtn && (
                <button
                  onClick={onSwitchToDoctor}
                  className="self-start mt-0.5 text-[11px] font-semibold text-brand-600 bg-brand-50 border border-brand-200
                             rounded-lg px-2.5 py-1 hover:bg-brand-100 transition-colors flex items-center gap-1"
                >
                  👨‍⚕️ Open Doctor Chat →
                </button>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mt-1 text-xs">👤</div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2 justify-start animate-slide-up">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center mt-1 text-xs">🤖</div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-end gap-2">
          {/* Mic */}
          <button
            onClick={toggleMic}
            id="mic-btn"
            title={listening ? 'Click to stop' : 'Click to speak'}
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90
              ${listening ? 'bg-red-500 text-white shadow-md shadow-red-200' : 'bg-slate-100 text-slate-500 hover:bg-brand-100 hover:text-brand-600'}`}
          >
            {listening && <span className="absolute w-10 h-10 rounded-xl bg-red-400 animate-ping opacity-40" />}
            <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <input
            ref={inputRef}
            id="ai-chat-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            placeholder={language === 'HI' ? 'कुछ पूछें…' : 'Ask about your medicines…'}
            className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all duration-200 disabled:opacity-60"
          />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
            id="ai-send-btn"
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40
                       disabled:cursor-not-allowed text-white flex items-center justify-center
                       transition-all duration-200 active:scale-90 shadow-md shadow-brand-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {currentMedicines.length > 0 && (
          <p className="text-center text-[10px] text-slate-400 mt-1.5">
            💊 Using {currentMedicines.length} medicine(s) as context
          </p>
        )}
      </div>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCTOR CHAT
// ═════════════════════════════════════════════════════════════════════════════
function DoctorChat({ language, onUnreadChange }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const bottomRef               = useRef(null)

  // ── Fetch thread on mount ──────────────────────────────────────
  const fetchThread = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetDoctorMessages()
      setMessages(data.messages || [])
      onUnreadChange?.(data.unread_count || 0)
    } catch (e) {
      setError('Could not load doctor messages. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [onUnreadChange])

  useEffect(() => { fetchThread() }, [fetchThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    try {
      const data = await apiSendDoctorMessage(text)
      setMessages(data.messages || [])
      onUnreadChange?.(data.unread_count || 0)
    } catch {
      setError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Sender label & style map ───────────────────────────────────
  const bubbleStyle = {
    user:   'bg-brand-600 text-white rounded-tr-sm self-end',
    doctor: 'bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-tl-sm self-start',
    system: 'bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-center text-xs italic self-center max-w-[90%]',
  }

  const avatarMap = { user: '👤', doctor: '👨‍⚕️', system: '⚠️' }

  return (
    <>
      {/* Doctor info banner */}
      <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 border-b border-emerald-100">
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm text-white shadow">👨‍⚕️</div>
        <div className="flex-1">
          <p className="text-xs font-bold text-emerald-800">Dr. [Assigned Doctor]</p>
          <p className="text-[10px] text-emerald-600">Replies within 24 hours · Secure & Private</p>
        </div>
        <button
          onClick={fetchThread}
          title="Refresh messages"
          className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-hide">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <p className="text-xs">Loading your conversation…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            ⚠️ {error}
            <button onClick={fetchThread} className="ml-auto text-red-500 underline">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="w-20 h-20 rounded-2xl bg-emerald-50 flex items-center justify-center text-4xl shadow-inner">
              👨‍⚕️
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-700 text-sm">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">
                Send a message to your doctor. They typically reply within 24 hours.
              </p>
            </div>
          </div>
        )}

        {/* Message list */}
        {!loading && messages.map((msg, i) => (
          <div key={msg.id || i}
            className={`flex gap-2 animate-slide-up
              ${msg.sender === 'user' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}
          >
            {msg.sender !== 'user' && msg.sender !== 'system' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center mt-1 text-xs">
                {avatarMap[msg.sender]}
              </div>
            )}
            <div className={`flex flex-col gap-0.5 ${msg.sender === 'user' ? 'items-end' : msg.sender === 'system' ? 'items-center' : 'items-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm max-w-[78%] ${bubbleStyle[msg.sender]}`}>
                {msg.message}
              </div>
              <span className="text-[9px] text-slate-400 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.sender === 'user' && (
                  <span className="ml-1 text-brand-400">{msg.read ? '✓✓' : '✓'}</span>
                )}
              </span>
            </div>
            {msg.sender === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mt-1 text-xs">👤</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-end gap-2">
          <input
            id="doctor-chat-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder={language === 'HI' ? 'डॉक्टर को संदेश लिखें…' : 'Message your doctor…'}
            className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:bg-white transition-all duration-200 disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            id="doctor-send-btn"
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40
                       disabled:cursor-not-allowed text-white flex items-center justify-center
                       transition-all duration-200 active:scale-90 shadow-md shadow-emerald-200"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-1.5">
          🔒 Your messages are private and secure
        </p>
      </div>
    </>
  )
}
