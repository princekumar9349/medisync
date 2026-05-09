// ResultCard.jsx – Full scan results dashboard
import MedicineItem from './MedicineItem'
import ScheduleBadges from './ScheduleBadges'

function InfoCard({ icon, label, children, accent = 'brand' }) {
  const accentMap = {
    brand: 'bg-brand-50 border-brand-100',
    green: 'bg-emerald-50 border-emerald-100',
    purple: 'bg-purple-50 border-purple-100',
    rose: 'bg-rose-50 border-rose-100',
  }
  const titleMap = {
    brand: 'text-brand-700',
    green: 'text-emerald-700',
    purple: 'text-purple-700',
    rose: 'text-rose-700',
  }

  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]} animate-slide-up`}>
      <div className={`section-title ${titleMap[accent]}`}>
        <span className="text-base">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}

export default function ResultCard({ result }) {
  if (!result) return null

  const { medicines = [], schedule = [], doctor_advice, possible_condition, precautions } = result

  // Gather global schedule from all medicines if top-level schedule is empty
  const globalSchedule = schedule.length > 0
    ? schedule
    : [...new Set(medicines.flatMap(m => m.schedule || []))]

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow"></div>
        <h2 className="font-bold text-slate-800 text-base">Scan Results</h2>
        <span className="ml-auto text-xs text-slate-400 font-medium">
          {medicines.length} medicine{medicines.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Medicines */}
      <InfoCard icon="💊" label="Medicines" accent="brand">
        {medicines.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No medicines detected.</p>
        ) : (
          <div className="space-y-2">
            {medicines.map((med, i) => (
              <MedicineItem key={i} medicine={med} index={i} />
            ))}
          </div>
        )}
      </InfoCard>

      {/* Schedule */}
      {globalSchedule.length > 0 && (
        <InfoCard icon="⏰" label="Daily Schedule" accent="green">
          <ScheduleBadges schedule={globalSchedule} />
        </InfoCard>
      )}

      {/* Possible Condition */}
      {possible_condition && (
        <InfoCard icon="🧬" label="Possible Condition" accent="purple">
          <p className="text-sm text-slate-700 leading-relaxed">{possible_condition}</p>
        </InfoCard>
      )}

      {/* Doctor Advice */}
      {doctor_advice && (
        <InfoCard icon="🩺" label="Doctor's Advice" accent="rose">
          <p className="text-sm text-slate-700 leading-relaxed">{doctor_advice}</p>
        </InfoCard>
      )}

      {/* Precautions */}
      {precautions && (
        <InfoCard icon="⚠️" label="Precautions" accent="brand">
          <p className="text-sm text-slate-700 leading-relaxed">{precautions}</p>
        </InfoCard>
      )}
    </div>
  )
}
