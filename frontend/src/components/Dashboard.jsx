/**
 * Dashboard.jsx — Patient history, adherence & today's schedule.
 *
 * Sections:
 *   1. Today's Schedule (medicines due today derived from prescriptions)
 *   2. Adherence ring + stats
 *   3. Dose timeline (recent activity)
 *   4. Prescription history (expandable cards)
 */

import { useState, useEffect } from 'react'
import { apiGetPrescriptions, apiGetInsights, apiDeleteExpired, apiMarkDone } from '../api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeOfDaySlot() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'night'
}

function formatDate(iso) {
  if (!iso) return 'Unknown date'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const map = {
    low:    { color: 'bg-green-100 text-green-700 border-green-200',  icon: '✅', label: 'Low Risk' },
    medium: { color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: '⚠️',  label: 'Medium Risk' },
    high:   { color: 'bg-red-100 text-red-700 border-red-200',        icon: '🚨', label: 'High Risk' },
  }
  const cfg = map[level] || map.low
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Today's Schedule ─────────────────────────────────────────────────────────
function TodaySchedule({ prescriptions, onMarkTaken }) {
  const currentSlot = timeOfDaySlot()
  const SLOT_LABELS = {
    morning:   { icon: '🌅', label: 'Morning', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    afternoon: { icon: '☀️', label: 'Afternoon', color: 'text-sky-600 bg-sky-50 border-sky-200' },
    night:     { icon: '🌙', label: 'Night', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  }

  // Flatten all medicines from recent prescriptions
  const allMeds = prescriptions.slice(0, 3).flatMap(rx =>
    (rx.medicines || []).map(med => ({ ...med, rx_condition: rx.possible_condition }))
  )

  // Determine which slot to show (current time slot)
  const dueMeds = allMeds.filter(med => {
    const t = (med.timing || '').toLowerCase()
    if (currentSlot === 'morning')   return t.includes('morning') || t.includes('breakfast') || (!t.includes('afternoon') && !t.includes('night'))
    if (currentSlot === 'afternoon') return t.includes('afternoon') || t.includes('lunch')
    return t.includes('night') || t.includes('evening') || t.includes('dinner')
  })

  const slot = SLOT_LABELS[currentSlot]

  return (
    <div className="card border border-slate-100 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${slot.color}`}>
          {slot.icon} {slot.label} Slot — Now
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {dueMeds.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-slate-400">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-medium text-slate-600">All clear for now!</p>
            <p className="text-xs text-slate-400">No medicines due in this slot.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {dueMeds.slice(0, 4).map((med, i) => (
            <MedRow key={i} med={med} onMarkTaken={onMarkTaken} />
          ))}
          {dueMeds.length > 4 && (
            <p className="text-xs text-center text-slate-400 pt-1">
              +{dueMeds.length - 4} more medicines
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MedRow({ med, onMarkTaken }) {
  const [taken, setTaken] = useState(false)

  async function handleTake() {
    setTaken(true)
    const med_id = med.name?.replace(/\s+/g, '_').toLowerCase() || 'unknown'
    try { await apiMarkDone(med_id, 'taken') } catch {}
    onMarkTaken?.(med)
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
                     ${taken ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
      <span className="text-lg flex-shrink-0">{taken ? '✅' : '💊'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm capitalize truncate">{med.name}</p>
        {med.dosage && <p className="text-xs text-slate-400">{med.dosage}</p>}
      </div>
      {taken ? (
        <span className="text-xs font-bold text-emerald-600">Taken ✓</span>
      ) : (
        <button
          onClick={handleTake}
          className="text-xs font-bold text-white bg-brand-600 hover:bg-brand-700
                     px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow"
        >
          Take
        </button>
      )}
    </div>
  )
}

// ─── Adherence Ring ───────────────────────────────────────────────────────────
function InsightsPanel({ insights }) {
  if (!insights) return null
  const rate = Math.round((insights.adherence_rate || 0) * 100)

  return (
    <div className="card border border-slate-100 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span>🧠</span> AI Adherence Insights
        </h3>
        <RiskBadge level={insights.risk_level} />
      </div>

      {/* Adherence ring */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={rate >= 85 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444'}
              strokeWidth="3"
              strokeDasharray={`${rate}, 100`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold text-slate-800">{rate}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {[
            { label: 'Taken',    value: insights.total_doses_taken,    color: 'text-green-600' },
            { label: 'Missed',   value: insights.total_doses_missed,   color: 'text-red-500' },
            { label: 'Expected', value: insights.total_doses_expected, color: 'text-slate-600' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-xs">
              <span className="text-slate-500">{row.label}</span>
              <span className={`font-semibold ${row.color}`}>{row.value ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {(insights.recommendations || []).length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {insights.recommendations.slice(0, 3).map((rec, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
              <span className="text-brand-500 mt-0.5 flex-shrink-0">→</span>
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function DoseTimeline({ prescriptions }) {
  // Fake a timeline from recent prescriptions for visual display
  const events = prescriptions.slice(0, 5).map((rx, i) => ({
    date: formatDate(rx.created_at),
    label: rx.possible_condition || 'Prescription',
    meds: (rx.medicines || []).length,
    type: i === 0 ? 'recent' : 'past',
  }))

  if (events.length === 0) return null

  return (
    <div className="card border border-slate-100 animate-slide-up">
      <p className="section-title">📅 Prescription Timeline</p>
      <div className="relative pl-4">
        {events.map((ev, i) => (
          <div key={i} className="timeline-item pb-4 last:pb-0">
            {i < events.length - 1 && <div className="timeline-line" />}
            <div className={`timeline-dot ${ev.type === 'recent' ? 'bg-brand-500 border-brand-300' : 'bg-slate-300 border-slate-200'}`} />
            <div className="pl-4">
              <p className="font-semibold text-slate-700 text-sm">{ev.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{ev.date} · {ev.meds} medicine{ev.meds !== 1 ? 's' : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Prescription Card ────────────────────────────────────────────────────────
function PrescriptionCard({ rx, index }) {
  const [expanded, setExpanded] = useState(false)
  const meds = rx.medicines || []

  return (
    <div
      className="card border border-slate-100 cursor-pointer hover:border-brand-200
                 hover:shadow-md transition-all duration-200 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">📋</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
            {rx.possible_condition || 'Prescription'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatDate(rx.created_at)} · {meds.length} medicine{meds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {(rx.schedule || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(rx.schedule || []).map(s => (
            <span key={s} className="badge bg-brand-50 text-brand-600 border border-brand-100 capitalize text-xs">
              {s === 'morning' ? '🌅' : s === 'afternoon' ? '☀️' : '🌙'} {s}
            </span>
          ))}
        </div>
      )}

      {expanded && meds.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {meds.map((med, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-base">💊</span>
              <span className="font-medium text-slate-700 capitalize">{med.name}</span>
              {med.dosage && <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">{med.dosage}</span>}
              {med.timing && <span className="text-xs text-slate-400 ml-auto">{med.timing}</span>}
            </div>
          ))}
          {rx.doctor_advice && (
            <div className="mt-2 p-2.5 bg-rose-50 rounded-lg border border-rose-100">
              <p className="text-xs text-rose-700 leading-relaxed">🩺 {rx.doctor_advice}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [prescriptions, setPrescriptions] = useState([])
  const [insights, setInsights]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [deleting, setDeleting]           = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [rxData, insightData] = await Promise.all([
          apiGetPrescriptions(),
          apiGetInsights().catch(() => null),
        ])
        setPrescriptions(rxData.prescriptions || [])
        setInsights(insightData)
      } catch (err) {
        setError(err.message || 'Failed to load dashboard.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleDeleteExpired() {
    setDeleting(true)
    try {
      const res = await apiDeleteExpired()
      alert(`✅ ${res.message}`)
      const rxData = await apiGetPrescriptions()
      setPrescriptions(rxData.prescriptions || [])
    } catch (err) {
      alert(`⚠️ ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card h-20 skeleton" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="card flex flex-col items-center gap-3 py-10 text-center animate-fade-in">
        <span className="text-4xl">⚠️</span>
        <p className="text-slate-600 font-semibold text-sm">{error}</p>
        <p className="text-xs text-slate-400">Make sure you're logged in and the server is running.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Today's Schedule */}
      {prescriptions.length > 0 && (
        <TodaySchedule prescriptions={prescriptions} />
      )}

      {/* Adherence Insights */}
      {insights && <InsightsPanel insights={insights} />}

      {/* Prescription Timeline */}
      {prescriptions.length > 0 && <DoseTimeline prescriptions={prescriptions} />}

      {/* Prescription History Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
          <span>📁</span>
          Recent Prescriptions
          <span className="ml-1 text-xs font-normal text-slate-400">({prescriptions.length})</span>
        </h2>
        {prescriptions.length > 0 && (
          <button
            id="delete-expired-btn"
            onClick={handleDeleteExpired}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors
                       disabled:opacity-50 flex items-center gap-1"
          >
            🗑️ {deleting ? 'Cleaning…' : 'Remove Expired'}
          </button>
        )}
      </div>

      {/* Prescription List */}
      {prescriptions.length === 0 ? (
        <div className="card flex flex-col items-center py-14 gap-4 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <span className="text-3xl">📂</span>
          </div>
          <div>
            <p className="font-bold text-slate-700">No prescriptions yet</p>
            <p className="text-sm text-slate-400 mt-1">Scan your first prescription to see it here.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx, i) => (
            <PrescriptionCard key={rx._id || i} rx={rx} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
