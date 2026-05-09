/**
 * SmartPillbox.jsx — Smart Pillbox UI for Medisync
 *
 * Displays Morning / Afternoon / Night slots derived from the user's
 * active prescriptions. Each slot shows medicine name, dosage, and
 * a "Take Now" button that calls POST /mark-done.
 *
 * Statuses are persisted in localStorage for the current day so they
 * survive tab switches without re-fetching.
 */

import { useState, useEffect, useCallback } from 'react'
import { apiGetPillboxSlots, apiMarkDone } from '../api'

// ─── Local storage helpers ────────────────────────────────────────────────────

const TODAY_KEY = () => `pillbox_${new Date().toISOString().slice(0, 10)}`

function loadTodayStatus() {
  try { return JSON.parse(localStorage.getItem(TODAY_KEY())) || {} } catch { return {} }
}

function saveTodayStatus(map) {
  localStorage.setItem(TODAY_KEY(), JSON.stringify(map))
}

// ─── Slot Config ──────────────────────────────────────────────────────────────

const SLOT_CONFIG = [
  {
    id: 'morning',
    label: 'Morning',
    icon: '🌅',
    time: '7:00 – 9:00 AM',
    gradient: 'from-amber-500 to-orange-400',
    bg: 'pillbox-slot-morning',
    dot: 'bg-amber-400',
    ring: 'ring-amber-300',
    btnTake: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
    accent: 'text-amber-700',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    icon: '☀️',
    time: '12:00 – 2:00 PM',
    gradient: 'from-sky-500 to-cyan-400',
    bg: 'pillbox-slot-afternoon',
    dot: 'bg-sky-400',
    ring: 'ring-sky-300',
    btnTake: 'bg-sky-500 hover:bg-sky-600 shadow-sky-200',
    accent: 'text-sky-700',
  },
  {
    id: 'night',
    label: 'Night',
    icon: '🌙',
    time: '8:00 – 10:00 PM',
    gradient: 'from-indigo-600 to-purple-500',
    bg: 'pillbox-slot-night',
    dot: 'bg-indigo-400',
    ring: 'ring-indigo-300',
    btnTake: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200',
    accent: 'text-indigo-700',
  },
]

// ─── Root Component ───────────────────────────────────────────────────────────

export default function SmartPillbox() {
  const [slots, setSlots]     = useState({ morning: [], afternoon: [], night: [] })
  const [status, setStatus]   = useState(loadTodayStatus)   // { med_id: 'taken'|'missed'|'pending' }
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetPillboxSlots()
      setSlots(data)
    } catch (e) {
      setError(e.message || 'Could not load pillbox data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  // Persist status changes to localStorage
  function updateStatus(med_id, newStatus) {
    setStatus(prev => {
      const next = { ...prev, [med_id]: newStatus }
      saveTodayStatus(next)
      return next
    })
  }

  async function handleTake(med) {
    updateStatus(med.med_id, 'taken')
    try {
      await apiMarkDone(med.med_id, 'taken')
    } catch {
      // Silently fail — status is already updated locally
    }
  }

  async function handleMiss(med) {
    updateStatus(med.med_id, 'missed')
    try {
      await apiMarkDone(med.med_id, 'missed')
    } catch {}
  }

  // ── Stats ─────────────────────────────────────────────────────────
  const allMeds = [...slots.morning, ...slots.afternoon, ...slots.night]
  const taken   = allMeds.filter(m => status[m.med_id] === 'taken').length
  const missed  = allMeds.filter(m => status[m.med_id] === 'missed').length
  const total   = allMeds.length
  const adherePct = total > 0 ? Math.round((taken / total) * 100) : 0

  if (loading) return <PillboxSkeleton />

  if (error) {
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center animate-fade-in">
        <span className="text-5xl">⚠️</span>
        <div>
          <p className="font-bold text-slate-700">Could not load pillbox</p>
          <p className="text-sm text-slate-400 mt-1">{error}</p>
        </div>
        <button onClick={fetchSlots} className="btn-primary max-w-[180px] btn-sm">
          Retry
        </button>
      </div>
    )
  }

  if (total === 0) return <EmptyPillbox />

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Daily Summary ──────────────────────────────────────────── */}
      <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white border-0 shadow-lg shadow-brand-200">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="white" strokeWidth="3"
                strokeDasharray={`${adherePct}, 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-extrabold leading-none">{adherePct}%</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-base">Today's Adherence</p>
            <p className="text-brand-200 text-xs mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <div className="flex gap-4 mt-2">
              <div className="text-center">
                <p className="text-lg font-extrabold text-white">{taken}</p>
                <p className="text-[10px] text-brand-200">Taken</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-extrabold text-amber-300">{total - taken - missed}</p>
                <p className="text-[10px] text-brand-200">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-extrabold text-red-300">{missed}</p>
                <p className="text-[10px] text-brand-200">Missed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Slots ─────────────────────────────────────────────────── */}
      {SLOT_CONFIG.map(slot => (
        <PillboxSlot
          key={slot.id}
          slot={slot}
          meds={slots[slot.id] || []}
          status={status}
          onTake={handleTake}
          onMiss={handleMiss}
        />
      ))}

      {/* ── Refresh ───────────────────────────────────────────────── */}
      <button
        onClick={fetchSlots}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm text-slate-400
                   hover:text-brand-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh medicines
      </button>
    </div>
  )
}

// ─── Slot Panel ───────────────────────────────────────────────────────────────

function PillboxSlot({ slot, meds, status, onTake, onMiss }) {
  const takenCount = meds.filter(m => status[m.med_id] === 'taken').length

  return (
    <div className={`pillbox-slot ${slot.bg} animate-slide-up`}>
      {/* Slot Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${slot.gradient}
                         flex items-center justify-center shadow-md text-white text-xl`}>
          {slot.icon}
        </div>
        <div className="flex-1">
          <p className={`font-bold text-base ${slot.accent}`}>{slot.label}</p>
          <p className="text-xs text-slate-500">{slot.time}</p>
        </div>
        <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
          takenCount === meds.length
            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : 'bg-white/80 text-slate-600 border-slate-200'
        }`}>
          {takenCount}/{meds.length}
        </div>
      </div>

      {/* Medicine Items */}
      {meds.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
          <span>🎉</span>
          <span>No medicines for this slot</span>
        </div>
      ) : (
        <div className="space-y-2">
          {meds.map((med, i) => (
            <PillItem
              key={`${med.med_id}-${i}`}
              med={med}
              status={status[med.med_id] || 'pending'}
              onTake={() => onTake(med)}
              onMiss={() => onMiss(med)}
              btnClass={slot.btnTake}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Individual Pill Item ─────────────────────────────────────────────────────

function PillItem({ med, status, onTake, onMiss, btnClass }) {
  const isTaken  = status === 'taken'
  const isMissed = status === 'missed'

  return (
    <div className={`pill-item ${isTaken ? 'pill-taken' : isMissed ? 'pill-missed' : 'pill-pending'}`}>
      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg
        ${isTaken ? 'bg-emerald-100' : isMissed ? 'bg-red-100' : 'bg-slate-100'}`}>
        {isTaken ? '✅' : isMissed ? '❌' : '💊'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm capitalize truncate">{med.name}</p>
        {med.dosage && (
          <p className="text-xs text-slate-500">{med.dosage}</p>
        )}
      </div>

      {/* Status / Actions */}
      {isTaken ? (
        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600
                         bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">
          ✓ Taken
        </span>
      ) : isMissed ? (
        <span className="flex items-center gap-1 text-xs font-bold text-red-600
                         bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">
          ✗ Missed
        </span>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            id={`take-${med.med_id}`}
            onClick={onTake}
            className={`${btnClass} text-white text-xs font-bold px-3 py-1.5 rounded-lg
                        transition-all duration-200 active:scale-95 shadow`}
          >
            Take Now
          </button>
          <button
            onClick={onMiss}
            className="text-xs text-slate-400 hover:text-red-500 text-center transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyPillbox() {
  return (
    <div className="card flex flex-col items-center justify-center py-16 gap-4 text-center animate-fade-in">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-100 to-brand-200
                      flex items-center justify-center shadow-inner">
        <span className="text-5xl">💊</span>
      </div>
      <div>
        <p className="font-bold text-slate-700 text-base">Pillbox is empty</p>
        <p className="text-sm text-slate-400 mt-1 max-w-[220px] mx-auto">
          Scan a prescription first. Your medicines will appear here organized by timing.
        </p>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PillboxSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card h-24 skeleton" />
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-2xl border-2 border-slate-100 p-4 space-y-3">
          <div className="h-10 skeleton rounded-xl w-1/2" />
          <div className="h-14 skeleton rounded-xl" />
          <div className="h-14 skeleton rounded-xl" />
        </div>
      ))}
    </div>
  )
}
