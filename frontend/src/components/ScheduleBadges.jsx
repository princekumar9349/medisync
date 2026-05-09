// ScheduleBadges.jsx – Morning / Afternoon / Night badges
const SLOT_CONFIG = {
  morning: {
    label: 'Morning',
    icon: '🌅',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  afternoon: {
    label: 'Afternoon',
    icon: '☀️',
    className: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
  night: {
    label: 'Night',
    icon: '🌙',
    className: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
}

export default function ScheduleBadges({ schedule = [] }) {
  if (!schedule || schedule.length === 0) {
    return (
      <span className="text-xs text-slate-400 italic">No schedule info</span>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {schedule.map((slot) => {
        const cfg = SLOT_CONFIG[slot.toLowerCase()] || {
          label: slot,
          icon: '⏰',
          className: 'bg-slate-100 text-slate-600 border border-slate-200',
        }
        return (
          <span key={slot} className={`badge ${cfg.className}`}>
            <span>{cfg.icon}</span>
            {cfg.label}
          </span>
        )
      })}
    </div>
  )
}
