import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  apiGetDoctorPatients,
  apiGetPatientProfile,
  apiDoctorSendReply,
  apiGetDoctorMessages
} from '../api'

// ─── Chart Components ────────────────────────────────────────────────────────

function PieChart({ taken, missed }) {
  const total = taken + missed;
  if (total === 0) return <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-400">No Data</div>;
  
  const takenPct = Math.round((taken / total) * 100);
  const strokeDasharray = `${takenPct} 100`;

  return (
    <div className="relative w-16 h-16">
      <svg width="100%" height="100%" viewBox="0 0 36 36" className="transform -rotate-90">
        <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#f87171" strokeWidth="4" />
        <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={strokeDasharray} strokeDashoffset="0" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black text-slate-700">{takenPct}%</span>
      </div>
    </div>
  )
}

function AdherenceBarChart({ data }) {
  if (!data || data.length === 0) return <div className="h-24 flex items-center justify-center text-xs text-slate-400">No chart data</div>;
  return (
    <div className="flex items-end gap-1 h-28 mt-4">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full group">
          <div className="w-full bg-slate-100 rounded-t-md h-full relative overflow-hidden">
            <div 
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t-md transition-all duration-1000 group-hover:opacity-80"
              style={{ height: `${d.percentage}%` }}
            ></div>
            <div className="absolute bottom-1 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity">
               <span className="text-[9px] font-bold text-white bg-black/30 px-1 rounded">{Math.round(d.percentage)}%</span>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

function TimeSlotChart({ data }) {
  if (!data) return null;
  const max = Math.max(data.morning, data.afternoon, data.night, 1);
  return (
    <div className="space-y-3 mt-2">
      {['morning', 'afternoon', 'night'].map(slot => (
        <div key={slot} className="flex items-center gap-3">
          <span className="w-14 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{slot}</span>
          <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden relative">
            <div 
              className="absolute top-0 left-0 h-full rounded-full bg-brand-500 transition-all duration-1000" 
              style={{ width: `${(data[slot] / max) * 100}%` }}
            ></div>
          </div>
          <span className="text-xs font-black text-slate-700 w-5 text-right">{data[slot]}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { user, logout } = useAuth()
  
  const [patients, setPatients] = useState([])
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  // Patient Profile state
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  
  // Chat state
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  // Fetch Patients
  useEffect(() => {
    async function fetchPatients() {
      try {
        const data = await apiGetDoctorPatients()
        setPatients(data.patients || [])
      } catch (err) {
        console.error("Failed to load patients", err)
      } finally {
        setLoadingPatients(false)
      }
    }
    fetchPatients()
  }, [])

  // Fetch Profile & Chat on Select
  useEffect(() => {
    if (!selectedPatientId) return
    
    let isMounted = true;
    
    async function loadData() {
      setLoadingProfile(true)
      try {
        const [profData, chatData] = await Promise.all([
          apiGetPatientProfile(selectedPatientId),
          apiGetDoctorMessages(100, 0)
        ])
        
        if (isMounted) {
          setProfile(profData)
          const allMsgs = chatData.messages || []
          // Since profData.patient_id is always the actual ObjectId now, we use it for filtering chats
          const actualPatientId = profData.patient_id || selectedPatientId;
          const thread = allMsgs.filter(m => m.user_id === actualPatientId)
          setMessages(thread)
          // Ensure selectedPatientId is normalized to the ObjectId so further actions work
          if (actualPatientId !== selectedPatientId) {
             setSelectedPatientId(actualPatientId)
          }
        }
      } catch (err) {
        console.error("Failed to load patient data", err)
        // If searching and patient not found, maybe show an alert or handle error
        if (isMounted) {
           setProfile(null)
           setMessages([])
        }
      } finally {
        if (isMounted) setLoadingProfile(false)
      }
    }
    
    loadData()
    
    return () => { isMounted = false }
  }, [selectedPatientId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !selectedPatientId) return
    setInput('')
    setSending(true)
    try {
      const data = await apiDoctorSendReply(selectedPatientId, text)
      const allMsgs = data.messages || []
      setMessages(allMsgs.filter(m => m.user_id === selectedPatientId))
    } catch (err) {
      console.error('Failed to send message.', err)
    } finally {
      setSending(false)
    }
  }

  async function handleQuickAlert(msgText) {
    if (!selectedPatientId) return
    setSending(true)
    try {
      const data = await apiDoctorSendReply(selectedPatientId, `[ALERT] ${msgText}`)
      const allMsgs = data.messages || []
      setMessages(allMsgs.filter(m => m.user_id === selectedPatientId))
    } catch (err) {
      console.error('Failed to send alert.', err)
    } finally {
      setSending(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSelectedPatientId(q)
    setSearchQuery('')
  }

  const STATUS_STYLES = {
    active: 'bg-emerald-100 text-emerald-700',
    stable: 'bg-teal-100 text-teal-700',
    critical: 'bg-red-100 text-red-700 animate-pulse'
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* ── LEFT SIDEBAR: Patient List ──────────────────────────── */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0 shadow-sm z-10">
        <div className="p-4 border-b border-slate-100 bg-white sticky top-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-emerald-200">
               👨‍⚕️
             </div>
             <div>
               <h1 className="font-extrabold text-slate-800 tracking-tight">Medisync Pro</h1>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doctor Panel</p>
             </div>
          </div>
          <button onClick={logout} className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Log out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="p-3 bg-white border-b border-slate-100">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Enter Patient ID (e.g. P-123456)" 
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <button type="submit" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
              🔍 Find
            </button>
          </form>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">My Patients ({patients.length})</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingPatients ? (
            <div className="p-6 flex justify-center"><span className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"></span></div>
          ) : patients.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No patients assigned yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {patients.map(p => (
                <li key={p.id}>
                  <button 
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-3
                      ${selectedPatientId === p.id ? 'bg-emerald-50/50 border-l-4 border-emerald-500' : 'border-l-4 border-transparent'}
                    `}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shrink-0">
                      {p.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.condition} · Age {p.age}</p>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_STYLES[p.status]?.split(' ')[0] || 'bg-slate-300'}`}></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT: Chat & Profile Split ──────────────────── */}
      {selectedPatientId && profile ? (
        <main className="flex-1 flex flex-col xl:flex-row h-full overflow-hidden bg-slate-50 relative">
          
          {/* Chat Column */}
          <div className="flex-1 flex flex-col border-r border-slate-200 h-full">
            <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
               <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-sm shrink-0">{profile.name.charAt(0)}</div>
               <div>
                  <h2 className="font-bold text-slate-800 text-sm">Chat: {profile.name}</h2>
                  <p className="text-xs text-slate-500">Secure clinical thread</p>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                   <span className="text-4xl">💬</span>
                   <p className="text-sm font-medium text-slate-600">No messages yet.</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isDoc = msg.sender === 'doctor'
                const isSys = msg.sender === 'system'
                return (
                  <div key={i} className={`flex ${isDoc ? 'justify-end' : isSys ? 'justify-center' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm
                      ${isDoc ? 'bg-emerald-600 text-white rounded-tr-sm' : 
                        isSys ? 'bg-amber-100 text-amber-800 text-xs italic rounded-xl border border-amber-200' : 
                        'bg-white text-slate-800 rounded-tl-sm border border-slate-100'}
                    `}>
                      {msg.message}
                      {!isSys && <div className={`text-[9px] mt-1 text-right ${isDoc ? 'text-emerald-200' : 'text-slate-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={`Reply to ${profile.name}...`}
                  rows={2}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-50 transition-colors shadow-md shrink-0"
                >
                  {sending ? <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : '➤'}
                </button>
              </div>
            </div>
          </div>

          {/* Profile Panel Column */}
          <div className="w-full xl:w-[400px] bg-white h-full overflow-y-auto border-t xl:border-t-0 shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
             
             {/* Header */}
             <div className="p-6 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center text-3xl shadow-inner">
                    👤
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                    ${profile.risk_level === 'high' ? 'bg-red-100 text-red-700 border border-red-200' : 
                      profile.risk_level === 'medium' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                      'bg-emerald-100 text-emerald-700 border border-emerald-200'}
                  `}>
                    {profile.risk_level} Risk
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-800">{profile.name}</h2>
                <p className="text-sm text-slate-500 font-medium mb-1">ID: <span className="font-bold text-slate-700">{profile.patient_id}</span></p>
                <p className="text-sm text-slate-500 font-medium">Age {profile.age} · {profile.condition}</p>
             </div>

             <div className="p-6 space-y-8">
                
                {/* Insights / Smart Suggestions */}
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="text-brand-500">✨</span> Smart Insights
                  </h3>
                  <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
                     {profile.recommendations.map((rec, idx) => (
                       <p key={idx} className="text-xs font-semibold text-brand-800 leading-relaxed">• {rec}</p>
                     ))}
                  </div>
                </section>

                {/* Adherence Summary & Graphs */}
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="text-emerald-500">📊</span> Adherence Analytics
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                     <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                        <PieChart taken={profile.graph_data.missed_vs_taken.taken} missed={profile.graph_data.missed_vs_taken.missed} />
                        <div>
                           <p className="text-xs text-slate-500 font-bold">Overall</p>
                           <p className="text-lg font-black text-slate-800">{profile.adherence_stats.weekly_percentage}%</p>
                        </div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Today's Status</p>
                        <p className="text-sm font-black text-emerald-600">{profile.adherence_stats.today_taken} Taken</p>
                        <p className="text-sm font-black text-red-500">{profile.adherence_stats.today_missed} Missed</p>
                     </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">7-Day Trend</p>
                     <AdherenceBarChart data={profile.graph_data.daily_adherence} />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                     <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Time-Slot Consistency</p>
                     <TimeSlotChart data={profile.graph_data.time_slot_adherence} />
                  </div>
                </section>

                {/* Symptoms */}
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="text-red-500">🌡️</span> Reported Symptoms
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.symptoms.map((sym, i) => (
                      <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs font-bold shadow-sm">
                        {sym}
                      </span>
                    ))}
                  </div>
                </section>

                {/* Medicines */}
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="text-teal-500">💊</span> Active Prescriptions
                  </h3>
                  <div className="space-y-2">
                    {profile.medicines.length === 0 ? <p className="text-sm text-slate-400">No active medicines.</p> : null}
                    {profile.medicines.map((m, i) => (
                      <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center font-bold">℞</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">{m.name}</p>
                          <p className="text-[10px] font-bold text-slate-500">{m.dosage} · {m.timing}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Actionable Alerts */}
                <section className="pt-4 border-t border-slate-100">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="text-amber-500">⚡</span> Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleQuickAlert('Please remember to take your missed medications today.')} className="p-2.5 bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm">
                      🔔 Send Missed Dose Reminder
                    </button>
                    <button onClick={() => handleQuickAlert('Your recent symptoms are concerning. Please book a consultation immediately.')} className="p-2.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm">
                      📅 Recommend Consultation
                    </button>
                  </div>
                </section>

             </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex items-center justify-center bg-slate-50 p-8">
           <div className="text-center max-w-sm">
             <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center text-4xl mx-auto mb-4 border border-slate-100">
               🩺
             </div>
             <h2 className="text-xl font-black text-slate-800 mb-2">Select a Patient</h2>
             <p className="text-sm text-slate-500">Choose a patient from the sidebar to view their clinical profile, adherence analytics, and message thread.</p>
           </div>
        </main>
      )}

    </div>
  )
}
