/**
 * MedicineItem.jsx — Individual medicine row with Mark as Taken/Missed actions.
 * Calls POST /mark-done when user taps a status button.
 */

import { useState } from 'react'
import ScheduleBadges from './ScheduleBadges'
import { apiMarkDone } from '../api'

const STATUS_CONFIG = {
  taken:   { label: 'Taken ✓',   bg: 'bg-green-500',  ring: 'ring-green-200',  icon: '✅' },
  missed:  { label: 'Missed',     bg: 'bg-red-400',    ring: 'ring-red-200',    icon: '❌' },
  skipped: { label: 'Skipped',    bg: 'bg-amber-400',  ring: 'ring-amber-200',  icon: '⏭️' },
}

export default function MedicineItem({ medicine, index }) {
  const { name, dosage, timing, duration, schedule } = medicine

  const [status, setStatus]   = useState(null)   // null | 'taken' | 'missed' | 'skipped'
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  // Use medicine name as the med_id (slugified)
  const medId = (name || 'unknown').toLowerCase().replace(/\s+/g, '_')

  async function handleMark(newStatus) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await apiMarkDone(medId, newStatus)
      setStatus(newStatus)
    } catch (err) {
      // If not logged in, still update UI optimistically
      if (err.message?.includes('401') || err.message?.includes('403')) {
        setStatus(newStatus)   // UI update without persistence
      } else {
        setError('Could not save. Try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const statusCfg = status ? STATUS_CONFIG[status] : null

  return (
    <div
      className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 animate-slide-up transition-all duration-300"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 transition-colors duration-300
        ${statusCfg ? 'bg-green-100' : 'bg-brand-100'}`}>
        <span className="text-base">{statusCfg ? statusCfg.icon : '💊'}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-800 text-sm leading-tight capitalize">{name || 'Unknown'}</p>
          {dosage && (
            <span className="flex-shrink-0 text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">
              {dosage}
            </span>
          )}
        </div>

        {timing && <p className="text-xs text-slate-500 mt-0.5">{timing}</p>}

        {duration && (
          <div className="flex items-center gap-1 mt-1">
            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-slate-400">{duration}</span>
          </div>
        )}

        {schedule && schedule.length > 0 && (
          <div className="mt-2">
            <ScheduleBadges schedule={schedule} />
          </div>
        )}

        {/* ── Mark Done Buttons ───────────────────────────────── */}
        {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}

        {status ? (
          // Already marked — show status chip + undo
          <div className="flex items-center gap-2 mt-2.5">
            <span className={`text-xs font-semibold text-white px-3 py-1 rounded-full ${statusCfg.bg}`}>
              {statusCfg.label}
            </span>
            <button
              onClick={() => setStatus(null)}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Undo
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2.5">
            <button
              id={`mark-taken-${index}`}
              onClick={() => handleMark('taken')}
              disabled={saving}
              className="flex items-center gap-1 text-xs font-semibold bg-green-500 hover:bg-green-600 active:scale-95
                         text-white px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-50 shadow-sm"
            >
              {saving ? '…' : '✓ Taken'}
            </button>
            <button
              id={`mark-missed-${index}`}
              onClick={() => handleMark('missed')}
              disabled={saving}
              className="flex items-center gap-1 text-xs font-semibold bg-slate-100 hover:bg-red-50 hover:text-red-600
                         text-slate-500 px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-50"
            >
              ✗ Missed
            </button>
            <button
              id={`mark-skipped-${index}`}
              onClick={() => handleMark('skipped')}
              disabled={saving}
              className="flex items-center gap-1 text-xs font-semibold bg-slate-100 hover:bg-amber-50 hover:text-amber-600
                         text-slate-500 px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-50"
            >
              ⏭ Skip
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
