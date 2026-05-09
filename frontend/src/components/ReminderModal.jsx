/**
 * ReminderModal.jsx — Medication reminder modal for Medisync.
 *
 * Shows as a bottom-sheet on mobile / centered dialog on desktop.
 * Features:
 *   - List of today's upcoming medicines with times
 *   - "Speak Reminder" button (TTS)
 *   - Quick "Mark Taken" shortcut
 *   - Dismiss / Snooze (10 min) actions
 */

import { useState } from 'react'

export default function ReminderModal({ medicines = [], onClose, onMarkTaken }) {
  const [snoozed, setSnoozed] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  function speakReminder() {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const medList = medicines.map(m => `${m.name}${m.dosage ? ', ' + m.dosage : ''}`).join('. Then ')
    const text = medicines.length > 0
      ? `Medication reminder. Time to take: ${medList}.`
      : 'Medication reminder. Please check your pillbox for due medicines.'

    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-IN'
    utt.rate = 0.9
    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }

  function handleSnooze() {
    setSnoozed(true)
    setTimeout(() => {
      setSnoozed(false)
    }, 10 * 60 * 1000)
    onClose?.()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal-panel animate-slide-up">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500
                          flex items-center justify-center shadow-lg shadow-amber-200 text-2xl flex-shrink-0">
            ⏰
          </div>
          <div className="flex-1">
            <h2 className="font-extrabold text-slate-800 text-lg leading-tight">Medicine Reminder</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · Time to take your dose
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center
                       justify-center text-slate-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Medicine List */}
        <div className="space-y-2 mb-5">
          {medicines.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-3">No specific medicines listed.</p>
          ) : (
            medicines.slice(0, 4).map((med, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xl">💊</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm capitalize truncate">{med.name}</p>
                  {med.dosage && <p className="text-xs text-slate-400">{med.dosage}</p>}
                </div>
                {onMarkTaken && (
                  <button
                    onClick={() => onMarkTaken(med)}
                    className="text-xs font-bold text-emerald-600 bg-emerald-100 border border-emerald-200
                               px-2.5 py-1 rounded-lg hover:bg-emerald-200 transition-colors active:scale-95"
                  >
                    ✓ Taken
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Speak Reminder */}
        <button
          onClick={speakReminder}
          disabled={speaking}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold
                     text-sm transition-all duration-200 active:scale-95 mb-3
                     ${speaking
                       ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                       : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200'
                     }`}
        >
          {speaking ? (
            <>
              <span className="w-4 h-4 border-2 border-amber-600/40 border-t-amber-600 rounded-full animate-spin" />
              Speaking…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M6.343 6.343a8 8 0 000 11.314" />
              </svg>
              🔊 Speak Reminder
            </>
          )}
        </button>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSnooze}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl
                       border-2 border-slate-200 text-slate-500 font-semibold text-sm
                       hover:border-brand-300 hover:text-brand-600 transition-all duration-200 active:scale-95"
          >
            😴 Snooze 10m
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white
                       font-semibold text-sm transition-all duration-200 active:scale-95
                       shadow-md shadow-brand-200"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
